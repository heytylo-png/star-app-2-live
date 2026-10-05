/**
 * Hip clip: the idle <-> smug travel, taken from the Helix clip hip-bridge-917.mp4.
 *
 * The clip's own frames (720x1280, 24 fps, white background) are the art: frame 29 is
 * the last arms-down frame, 30..75 is the right arm travelling out and onto the hip
 * (a new picture every 3rd tick, so 8 distinct pictures a second), and 78 is the
 * last travel picture. The HOLD is not a clip frame: after travel the stage shows
 * `smug_hold.png` (keyed Helix 06, hand on hip + smirk). Exit plays the same 18
 * pictures backwards. Nothing was repainted: the pictures were cut to RGBA offline
 * with the same matte engine as the other pre-cut sheets (scripts/cut-hip-clip.md),
 * cropped to their common box and stored as lossy WebP with alpha.
 *
 * Why not a <video>: Chrome cannot play backwards (negative playbackRate is not
 * supported), seeking frame by frame is async and drops frames on phones, and a video
 * has no alpha. Here every frame is decoded to an ImageBitmap up front and painted on
 * a canvas in order, one frame per animation frame at most, so a slow phone stretches
 * the travel but can never skip a picture. The same list played backwards is the exit.
 *
 * This module is pure (no React, no DOM beyond what is injected) so the order and the
 * timing can be tested with a fake clock.
 */

/** One distinct picture of the clip. */
export type HipFrame = {
  /** File under public/rai/hip/. */
  file: string;
  /** Frame number in hip-bridge-917.mp4 (24 fps). */
  source: number;
  /** How many 24 fps ticks the clip shows it for. */
  ticks: number;
};

const SOURCE_FRAMES = [29, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78] as const;

export const HIP_CLIP_FRAMES: readonly HipFrame[] = SOURCE_FRAMES.map((source, i) => ({
  file: `rai/hip/hip_bridge_${String(i).padStart(2, "0")}.webp`,
  source,
  // 29 is a single tick (the clip's last still frame before the arm moves); the rest of
  // the travel steps every 3 ticks. The last one is the hold: its ticks are never waited out.
  ticks: i === 0 ? 1 : 3,
}));

export const HIP_CLIP_LAST = HIP_CLIP_FRAMES.length - 1;
export const HIP_TICK_MS = 1000 / 24;
/** A picture change within this of its due time keeps the clip's beat; later than that restarts the beat. */
export const HIP_ON_TIME_MS = 20;

/** Where the cropped pictures sit in the 720x1280 sheet space the stage draws all sheets in. */
export const HIP_CLIP_CROP = { x: 118, y: 0, w: 413, h: 1263 } as const;
export const HIP_CLIP_SHEET = { w: 720, h: 1280 } as const;

/** How long picture `index` stays up, in either direction. */
export function hipFrameDwellMs(index: number): number {
  return (HIP_CLIP_FRAMES[index]?.ticks ?? 1) * HIP_TICK_MS;
}

/** Position of picture `index` on the clip's own timeline (ms), for the debug readout. */
export function hipClipTimeMs(index: number): number {
  const f = HIP_CLIP_FRAMES[index];
  return f ? Math.round((f.source / 24) * 1000) : 0;
}

/** Whole travel, first picture up to the hold picture appearing. */
export function hipTravelMs(): number {
  let ms = 0;
  for (let i = 0; i < HIP_CLIP_LAST; i++) ms += hipFrameDwellMs(i);
  return ms;
}

/** Longest the stage waits for the clip before it gives up on it (loud). */
/** Reduced-motion exit: the hip stays up this long while the live idle layer rises (the pool paints an incoming sheet at 0 for ~48 ms first), so the swap is hip -> idle with no blank or plate in between. */
export const HIP_CUT_LINGER_MS = 96;
export const HIP_CLIP_WAIT_MAX_MS = 30_000;
export const HIP_CLIP_RETRY_MS = 800;
/** Retries per picture before the loader stops asking (the stage's own wait bound is HIP_CLIP_WAIT_MAX_MS). */
export const HIP_CLIP_MAX_ATTEMPTS = 60;

export type HipClipLoadDeps<B> = {
  fetchBlob: (src: string) => Promise<Blob>;
  decode: (blob: Blob) => Promise<B>;
  srcFor: (file: string) => string;
  onFrame?: (index: number, bitmap: B) => void;
  wait?: (ms: number) => Promise<void>;
  cancelled?: () => boolean;
};

/**
 * Fetch and decode every picture, all at once, each retried until it is in. Resolves
 * with the bitmaps in play order, or null when a picture never loaded (or the caller
 * cancelled).
 */
export async function loadHipClip<B>(deps: HipClipLoadDeps<B>): Promise<B[] | null> {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out: (B | undefined)[] = new Array(HIP_CLIP_FRAMES.length).fill(undefined);
  await Promise.all(
    HIP_CLIP_FRAMES.map(async (frame, i) => {
      const src = deps.srcFor(frame.file);
      for (let attempt = 0; attempt < HIP_CLIP_MAX_ATTEMPTS; attempt++) {
        if (deps.cancelled?.()) return;
        try {
          const bmp = await deps.decode(await deps.fetchBlob(src));
          out[i] = bmp;
          deps.onFrame?.(i, bmp);
          return;
        } catch {
          await wait(HIP_CLIP_RETRY_MS);
        }
      }
    }),
  );
  if (deps.cancelled?.()) return null;
  return out.every((b) => b !== undefined) ? (out as B[]) : null;
}

/** What the stage knows about the clip layer. */
export type ClipView = {
  visible: boolean;
  /** Picture on the canvas (meaningful while visible). */
  index: number;
  /** in: travelling to the hip. out: travelling back. */
  dir: "in" | "out";
  /** Travel finished: live smug_hold.png is the hold (canvas off). */
  arrived: boolean;
};

export type ClipHost = {
  raf: (cb: (ts: number) => void) => number;
  cancelRaf: (handle: number) => void;
  /** Clock in the rAF timebase (performance.now). A frame's timestamp is its vsync start, which is stale when a long task ran before the callback. */
  now?: () => number;
  /** Paint picture `index` on the canvas. Called inside an animation frame (or once before show). */
  draw: (index: number) => void;
  /** Make the canvas the one visible layer (hides the live sheets) in this paint. */
  show: () => void;
  /** Canvas off, live sheets back, in this paint. */
  hide: () => void;
  /** View changed (phase / debug). */
  onView: (view: ClipView) => void;
};

/**
 * Plays the pictures in order. At most one picture change per animation frame, and a
 * picture's dwell is counted from the frame it was painted in, so a stall stretches the
 * travel but never skips a picture. The hold is the last picture left on the canvas.
 */
export class HipClipPlayer {
  private readonly host: ClipHost;
  private index = 0;
  private visible = false;
  private dir: "in" | "out" = "in";
  private target = 0;
  private raf = 0;
  /** When the picture now up is due to give way (rAF timebase); NaN until its first frame. */
  private due = Number.NaN;
  /** The canvas was asked to show but the stage has not confirmed it is on screen yet: no picture changes meanwhile. */
  private pendingShow = false;
  /** Travel finished; the smug_hold sheet is up. */
  private arrived = false;
  /** A cut is waiting for the live layer to come up: the picture stays until then (rAF timebase). */
  private lingerUntil = Number.NaN;
  private lingerFor = 0;

  constructor(host: ClipHost) {
    this.host = host;
  }

  view(): ClipView {
    return { visible: this.visible, index: this.index, dir: this.dir, arrived: this.arrived };
  }

  private emit() {
    this.host.onView(this.view());
  }

  private stopLoop() {
    if (this.raf) this.host.cancelRaf(this.raf);
    this.raf = 0;
  }

  private startLoop() {
    if (this.raf) return;
    this.raf = this.host.raf(this.tick);
  }

  /** idle -> smug: the arm travels onto the hip, then the live smug_hold sheet takes over. */
  playIn() {
    this.lingerUntil = Number.NaN;
    this.lingerFor = 0;
    this.arrived = false;
    if (!this.visible) {
      this.index = 0;
      this.host.draw(0);
      this.visible = true;
      this.pendingShow = true;
      this.due = Number.NaN;
      this.host.show();
    }
    this.dir = "in";
    this.target = HIP_CLIP_LAST;
    this.emit();
    this.startLoop();
  }

  /**
   * The stage committed the canvas as the visible layer. Dwell counting starts from the next
   * animation frame, so the first picture is always seen before the second replaces it.
   */
  confirmShown() {
    if (!this.pendingShow) return;
    this.pendingShow = false;
    this.due = Number.NaN;
    if (this.visible) this.startLoop();
  }

  /**
   * smug -> idle: the same pictures backwards, then the live idle sheet.
   * Starts from the hold sheet too: the last travel picture goes up, then reverses.
   */
  playOut() {
    this.lingerUntil = Number.NaN;
    this.lingerFor = 0;
    this.arrived = false;
    if (!this.visible) {
      this.index = HIP_CLIP_LAST;
      this.host.draw(HIP_CLIP_LAST);
      this.visible = true;
      this.pendingShow = true;
      this.due = Number.NaN;
      this.host.show();
    }
    this.dir = "out";
    this.target = 0;
    this.emit();
    this.startLoop();
  }

  /**
   * Straight to the hold sheet (reduced motion, or smug reached from a non-idle pose).
   * The clip canvas stays off: `smug_hold.png` is the visible layer.
   */
  jumpToHold() {
    this.lingerUntil = Number.NaN;
    this.lingerFor = 0;
    this.stopLoop();
    this.index = HIP_CLIP_LAST;
    this.visible = false;
    this.pendingShow = false;
    this.arrived = true;
    this.dir = "in";
    this.target = HIP_CLIP_LAST;
    this.due = Number.NaN;
    this.host.hide();
    this.emit();
  }

  /**
   * Back to the live sheet (the pose left smug for something that is not a playable exit).
   * With `lingerMs` the picture up stays that long first (reduced-motion exit to idle), so the
   * live sheet is on screen before the canvas goes.
   */
  cut(lingerMs = 0) {
    this.arrived = false;
    if (!this.visible) {
      this.stopLoop();
      this.emit();
      return;
    }
    if (lingerMs > 0) {
      this.stopLoop();
      this.lingerFor = lingerMs;
      this.lingerUntil = Number.NaN;
      this.dir = "out";
      this.target = this.index;
      this.emit();
      this.startLoop();
      return;
    }
    this.finishCut();
  }

  private finishCut() {
    this.stopLoop();
    this.lingerUntil = Number.NaN;
    this.lingerFor = 0;
    this.visible = false;
    this.pendingShow = false;
    this.arrived = false;
    this.due = Number.NaN;
    this.host.hide();
    this.emit();
  }

  /** Travel done: hide the canvas so the live smug_hold sheet is the hold. */
  private arriveHold() {
    this.stopLoop();
    this.arrived = true;
    this.visible = false;
    this.pendingShow = false;
    this.due = Number.NaN;
    this.host.hide();
    this.emit();
  }

  dispose() {
    this.stopLoop();
  }

  private tick = (frameTs: number) => {
    this.raf = 0;
    const ts = this.host.now ? Math.max(frameTs, this.host.now()) : frameTs;
    if (!this.visible) return;
    if (this.pendingShow) {
      this.startLoop();
      return;
    }
    if (this.lingerFor > 0) {
      if (Number.isNaN(this.lingerUntil)) this.lingerUntil = ts + this.lingerFor;
      if (ts >= this.lingerUntil) this.finishCut();
      else this.startLoop();
      return;
    }
    // First frame of a picture that was drawn outside an animation frame: it paints now.
    if (Number.isNaN(this.due)) this.due = ts + hipFrameDwellMs(this.index);
    const atTarget = this.index === this.target;
    // Half an animation frame of slack so a 16.7 ms display lands on the 24 fps beat.
    if (ts + 8 >= this.due) {
      if (atTarget) {
        if (this.dir === "out") {
          this.visible = false;
          this.arrived = false;
          this.due = Number.NaN;
          this.host.hide();
          this.emit();
        }
        return;
      }
      const step = this.target > this.index ? 1 : -1;
      this.index += step;
      this.host.draw(this.index);
      // On time (within a frame): keep the 24 fps beat. Late (a stall): the new picture still
      // gets its full dwell from this frame, so a slow phone stretches the travel and no
      // picture is ever squeezed to a single frame to catch up.
      const late = ts - this.due;
      this.due = (late <= HIP_ON_TIME_MS ? this.due : ts) + hipFrameDwellMs(this.index);
      this.emit();
      if (this.dir === "in" && this.index === this.target) {
        // Last travel picture painted once: switch to smug_hold (no glare dwell on the clip).
        this.arriveHold();
        return;
      }
    }
    this.startLoop();
  };
}

/**
 * What the stage does with each committed set of plates. Same idea as BridgeDriver: the
 * decision uses only the key of the sheet that is on stage (idle / smug / null), so every
 * route onto smug (named, model pose tag, emotion tint, local brain) is the same change.
 *
 *  - idle -> smug: the arm travels (forward), then rests on the hip picture.
 *  - smug -> idle: the same pictures backwards, then the live idle sheet.
 *  - anything else onto smug (or reduced motion): the smug_hold sheet straight away;
 *    smug -> anything else: a cut back to the live sheet.
 * The hold is always smug_hold.png (hand on hip + smirk), never a clip frame and never
 * the arms-down smug_official.png.
 */
export class HipClipDriver {
  private last: string | null = null;
  private readonly player: HipClipPlayer;

  constructor(player: HipClipPlayer) {
    this.player = player;
  }

  key(): string | null {
    return this.last;
  }

  commit(key: string | null, env: { reducedMotion: boolean; ready: boolean }): void {
    const from = this.last;
    this.last = key;
    if (from === key) return;
    if (key === "smug") {
      if (!env.ready) return;
      const v = this.player.view();
      if (env.reducedMotion || (from !== "idle" && !v.visible && !v.arrived)) this.player.jumpToHold();
      else this.player.playIn();
      return;
    }
    if (from === "smug") {
      if (key === "idle" && !env.reducedMotion) this.player.playOut();
      else this.player.cut(key === "idle" ? HIP_CUT_LINGER_MS : 0);
    }
  }
}

/** The browser can decode the pictures to bitmaps and fetch them. */
export function hipClipSupported(): boolean {
  return (
    typeof createImageBitmap === "function" &&
    typeof fetch === "function" &&
    typeof document !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined"
  );
}
