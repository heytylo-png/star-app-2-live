/**
 * Decoded frames of one idle <-> smug clip (paste-15): an animated AVIF (AV1 + alpha,
 * 24 fps, no audio) unpacked with the WebCodecs ImageDecoder, frame by frame, in order.
 *
 * - load(): fetch the whole file, open the decoder, then decode the first PRIME frames
 *   and keep them for the life of the stage. A clip never starts before this is done
 *   (the stage waits, see bridgeGate), so the first frames of every play are already
 *   decoded and a cold first send does not stutter.
 * - While a clip plays, frames past the kept prefix are decoded AHEAD of the frame on
 *   stage, sequentially (cheap for AV1), and closed once they are behind it.
 * - After a play the decoder is walked back to the end of the kept prefix, so the next
 *   play continues sequentially from there.
 *
 * No DOM here beyond the decoder interface, which is injected so the order can be tested.
 */

/** Frames kept decoded for the life of the stage (0.5 s of clip). */
export const SMUG_CLIP_PRIME = 12;
/** Frames decoded ahead of the one on stage while a clip plays (0.5 s of clip). */
export const SMUG_CLIP_AHEAD = 12;

/** The parts of a decoded frame (VideoFrame) this module uses. */
export type ClipImage = { close: () => void };

/** The parts of ImageDecoder this module uses. */
export type ClipDecoder<I extends ClipImage> = {
  decode: (opts: { frameIndex: number }) => Promise<{ image: I }>;
  close: () => void;
  /** Frame count once the track header is in. */
  frameCount: () => Promise<number>;
};

export type ClipFramesOptions<I extends ClipImage> = {
  /** Fetch the file and open a decoder on it. Throws on failure; `isUnsupported(err)` marks a browser that can never decode it. */
  open: () => Promise<ClipDecoder<I>>;
  isUnsupported?: (err: unknown) => boolean;
  /** Frames the clip must have. */
  frames: number;
  prime?: number;
  ahead?: number;
  /** Ready changed (primed, or a load failed). */
  onChange?: () => void;
};

export class ClipFrames<I extends ClipImage> {
  private dec: ClipDecoder<I> | null = null;
  private readonly images = new Map<number, I>();
  private readonly frames: number;
  private readonly prime: number;
  private readonly ahead: number;
  private readonly open: () => Promise<ClipDecoder<I>>;
  private readonly isUnsupported: (err: unknown) => boolean;
  private unsupportedState = false;
  private readonly onChange: () => void;
  private loading: Promise<boolean> | null = null;
  /** Frame on stage, or -1 when the clip is not playing. */
  private playhead = -1;
  /** Next frame index the decoder hands out (decoding is strictly sequential). */
  private next = 0;
  private busy = false;
  /** The decoder has to be walked back to the kept prefix before the next play. */
  private rewind = false;
  private failedState = false;
  private disposed = false;

  constructor(opts: ClipFramesOptions<I>) {
    this.frames = opts.frames;
    this.prime = Math.min(opts.prime ?? SMUG_CLIP_PRIME, opts.frames);
    this.ahead = opts.ahead ?? SMUG_CLIP_AHEAD;
    this.open = opts.open;
    this.isUnsupported = opts.isUnsupported ?? (() => false);
    this.onChange = opts.onChange ?? (() => {});
  }

  /** Loaded and the kept prefix decoded: a play can start. */
  ready(): boolean {
    if (!this.dec || this.failedState) return false;
    for (let i = 0; i < this.prime; i++) if (!this.images.has(i)) return false;
    return true;
  }

  /** The load failed (no ImageDecoder, network, bad file). A later load() retries. */
  failed(): boolean {
    return this.failedState;
  }

  /** This browser cannot decode the clip at all (the stage hard-cuts, like reduced motion). */
  unsupported(): boolean {
    return this.unsupportedState;
  }

  /** Frame `index` is decoded and can be drawn now. */
  has(index: number): boolean {
    return this.images.has(index);
  }

  /** Decoded image of frame `index` without moving the playhead (null when not decoded). */
  peek(index: number): I | null {
    return this.images.get(index) ?? null;
  }

  /** Frames decoded right now (kept prefix + look-ahead). */
  decodedCount(): number {
    return this.images.size;
  }

  load(): Promise<boolean> {
    if (this.dec) return Promise.resolve(this.ready() || this.pumpPromise());
    if (this.loading) return this.loading;
    if (this.unsupportedState) return Promise.resolve(false);
    this.failedState = false;
    const job = (async () => {
      let dec: ClipDecoder<I> | null = null;
      try {
        dec = await this.open();
        const count = await dec.frameCount();
        if (count < this.frames) throw new Error(`clip has ${count} frames, wants ${this.frames}`);
      } catch (err) {
        dec?.close();
        if (!this.disposed) {
          this.failedState = true;
          this.unsupportedState = this.isUnsupported(err);
          console.warn("[rai] smug clip did not load", err);
          this.onChange();
        }
        return false;
      }
      if (this.disposed) {
        dec.close();
        return false;
      }
      this.dec = dec;
      this.next = 0;
      return this.pumpPromise();
    })().finally(() => {
      if (this.loading === job) this.loading = null;
    });
    this.loading = job;
    return job;
  }

  private pumpPromise(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.ready() || this.failedState || this.disposed) {
          resolve(this.ready());
          return true;
        }
        return false;
      };
      if (check()) return;
      this.waiters.push(check);
      void this.pump();
    });
  }

  private waiters: Array<() => boolean> = [];

  private notify() {
    this.waiters = this.waiters.filter((w) => !w());
  }

  /** Highest frame index the decoder should have decoded right now. */
  private target(): number {
    const keep = this.prime - 1;
    if (this.playhead < 0) return keep;
    return Math.min(this.frames - 1, Math.max(keep, this.playhead + this.ahead));
  }

  private async pump(): Promise<void> {
    if (this.busy || !this.dec || this.disposed) return;
    this.busy = true;
    const wasReady = this.ready();
    try {
      if (this.rewind) {
        this.rewind = false;
        // Walk the decoder back: re-decode the last kept frame (it is already held) so the
        // next play's first new frame is a plain sequential decode.
        if (this.prime > 0) {
          const r = await this.dec.decode({ frameIndex: this.prime - 1 });
          r.image.close();
        }
        this.next = this.prime;
      }
      while (!this.disposed && this.dec && !this.rewind && this.next <= this.target()) {
        const index = this.next;
        if (this.images.has(index)) {
          this.next += 1;
          continue;
        }
        const r = await this.dec.decode({ frameIndex: index });
        if (this.disposed) {
          r.image.close();
          return;
        }
        this.next = index + 1;
        if (index >= this.prime && (this.playhead < 0 || index < this.playhead)) {
          r.image.close();
          continue;
        }
        this.images.set(index, r.image);
        this.notify();
      }
    } catch (err) {
      console.warn("[rai] smug clip frame did not decode", err);
      this.failedState = true;
      this.onChange();
    } finally {
      this.busy = false;
    }
    if (this.disposed) return;
    if (this.ready() !== wasReady) this.onChange();
    this.notify();
    // A play (or a finish) moved the target while a decode was in flight.
    if (!this.failedState && (this.rewind || this.next <= this.target())) void this.pump();
  }

  /**
   * Frame `index` is going on stage: returns its image (null when it is not decoded),
   * drops look-ahead frames behind it and decodes further ahead.
   */
  take(index: number): I | null {
    const image = this.images.get(index) ?? null;
    if (!image) return null;
    this.playhead = index;
    for (const [i, img] of this.images) {
      if (i < index && i >= this.prime) {
        img.close();
        this.images.delete(i);
      }
    }
    void this.pump();
    return image;
  }

  /** The play ended (or was dropped): keep the prefix, close the rest, rewind for the next play. */
  finish(): void {
    if (this.playhead < 0) return;
    this.playhead = -1;
    for (const [i, img] of this.images) {
      if (i >= this.prime) {
        img.close();
        this.images.delete(i);
      }
    }
    this.rewind = true;
    void this.pump();
  }

  dispose(): void {
    this.disposed = true;
    for (const img of this.images.values()) img.close();
    this.images.clear();
    this.dec?.close();
    this.dec = null;
    this.waiters = [];
  }
}
