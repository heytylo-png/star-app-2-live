/**
 * Stage side of the smug clip player (paste-15): hands the two bridge canvases to the
 * clip worker (smug-clip-worker.ts) and drives it as PoseBridge's BridgeClipPlayer.
 *
 * - play(): the stage has just made the clip's canvas visible (it rests on frame 0); once
 *   that change has had an animation frame, the worker is told to play. Every frame it
 *   paints comes back as shown(i) (stage label, proofs); done() once the last frame has
 *   had its dwell.
 * - When a canvas goes hidden (play over or dropped) the worker is told two animation
 *   frames later, so re-arming it on frame 0 can never reach the screen.
 */
import type { BridgeClipEvents, BridgeClipPlayer } from "./pose-bridge.ts";
import type { ClipKey, ClipWorkerIn, ClipWorkerOut } from "./smug-clip-protocol.ts";

export type ClipPlayerState = { in: boolean; out: boolean; unsupported: boolean; failed: boolean };

type LogEntry = [t: number, clip: ClipKey, frame: number];

/** Last few hundred clip frames painted (stage clock, clip, frame): read by the live proofs. */
export function bridgeLog(): LogEntry[] {
  const g = globalThis as { __raiBridgeLog?: LogEntry[] };
  if (!g.__raiBridgeLog) g.__raiBridgeLog = [];
  return g.__raiBridgeLog;
}

export type SmugClipPlayerOptions = {
  canvases: Record<ClipKey, HTMLCanvasElement>;
  urls: Record<ClipKey, string>;
  frames: Record<ClipKey, number>;
  box: { x: number; y: number; w: number; h: number };
  keyOf: (file: string) => ClipKey | null;
  onState: (state: ClipPlayerState) => void;
};

/** True when this browser can run the off-main-thread clip player at all. */
export function smugClipPlayerSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    "transferControlToOffscreen" in HTMLCanvasElement.prototype
  );
}

const players = new WeakMap<HTMLCanvasElement, SmugClipPlayer>();

export class SmugClipPlayer implements BridgeClipPlayer {
  private readonly worker: Worker;
  private readonly keyOf: (file: string) => ClipKey | null;
  private onState: (state: ClipPlayerState) => void;
  private st: ClipPlayerState = { in: false, out: false, unsupported: false, failed: false };
  private readonly unsupportedKeys = new Set<ClipKey>();
  private readonly failedKeys = new Set<ClipKey>();
  private seq = 0;
  private current: { key: ClipKey; id: number; events: BridgeClipEvents } | null = null;
  private waiters: Array<() => void> = [];

  /** One player per pair of canvases for the life of the page (a canvas can be handed over once). */
  static for(opts: SmugClipPlayerOptions): SmugClipPlayer {
    const had = players.get(opts.canvases.in);
    if (had) {
      had.onState = opts.onState;
      opts.onState(had.state());
      return had;
    }
    const p = new SmugClipPlayer(opts);
    players.set(opts.canvases.in, p);
    return p;
  }

  private constructor(opts: SmugClipPlayerOptions) {
    this.keyOf = opts.keyOf;
    this.onState = opts.onState;
    this.worker = new Worker(new URL("./smug-clip-worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<ClipWorkerOut>) => this.receive(ev.data);
    this.worker.onerror = (ev) => {
      console.warn("[rai] smug clip worker failed", ev.message);
      this.st = { in: false, out: false, unsupported: true, failed: true };
      this.onState(this.state());
      this.flush();
    };
    const keys: ClipKey[] = ["in", "out"];
    const clips = keys.map((key) => ({
      key,
      url: new URL(opts.urls[key], location.href).href,
      frames: opts.frames[key],
      canvas: opts.canvases[key].transferControlToOffscreen(),
    }));
    this.send(
      { type: "init", timeOrigin: performance.timeOrigin, box: opts.box, clips },
      clips.map((c) => c.canvas),
    );
  }

  private send(msg: ClipWorkerIn, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  state(): ClipPlayerState {
    return { ...this.st };
  }

  ready(key: ClipKey): boolean {
    return this.st[key];
  }

  /** Resolves once both clips are ready (true) or one failed (false). Retries a failed load. */
  load(): Promise<boolean> {
    if (this.st.in && this.st.out) return Promise.resolve(true);
    if (this.st.unsupported) return Promise.resolve(false);
    if (this.st.failed) {
      this.failedKeys.clear();
      this.st = { ...this.st, failed: false };
      this.send({ type: "load" });
    }
    return new Promise((resolve) => {
      this.waiters.push(() => resolve(this.st.in && this.st.out));
    });
  }

  private flush() {
    if (!(this.st.in && this.st.out) && !this.st.failed && !this.st.unsupported) return;
    const w = this.waiters;
    this.waiters = [];
    for (const fn of w) fn();
  }

  private receive(msg: ClipWorkerOut) {
    switch (msg.type) {
      case "state": {
        if (msg.unsupported) this.unsupportedKeys.add(msg.key);
        if (msg.failed) this.failedKeys.add(msg.key);
        else this.failedKeys.delete(msg.key);
        this.st = {
          ...this.st,
          [msg.key]: msg.ready,
          unsupported: this.unsupportedKeys.size > 0,
          failed: this.failedKeys.size > 0,
        };
        this.onState(this.state());
        this.flush();
        break;
      }
      case "shown": {
        const log = bridgeLog();
        log.push([msg.t, msg.key, msg.index]);
        if (log.length > 600) log.splice(0, log.length - 600);
        const cur = this.current;
        if (cur && cur.id === msg.id) cur.events.shown(msg.index);
        break;
      }
      case "done": {
        const cur = this.current;
        if (!cur || cur.id !== msg.id) break;
        this.current = null;
        this.hiddenLater(cur.key);
        const g = globalThis as { __raiBridgeDone?: unknown[] };
        (g.__raiBridgeDone ??= []).push([performance.now(), msg.key, msg.stalls, msg.reanchors]);
        if (msg.failed) console.warn("[rai] smug clip could not start", cur.key);
        cur.events.done();
        break;
      }
    }
  }

  /** Tell the worker the canvas is hidden once the stage has painted that (two frames on). */
  private hiddenLater(key: ClipKey) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (this.current?.key === key) return;
        this.send({ type: "hidden", key });
      }),
    );
  }

  play(files: readonly string[], start: number, events: BridgeClipEvents): boolean {
    const key = files[0] ? this.keyOf(files[0]) : null;
    if (!key || !this.st[key] || start !== 0) return false;
    this.drop();
    this.seq += 1;
    const id = this.seq;
    this.current = { key, id, events };
    // The stage made the canvas visible in this task: play from the frame after it shows.
    requestAnimationFrame(() => {
      if (this.current?.id === id) this.send({ type: "play", key, id, start });
    });
    return true;
  }

  private drop() {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    this.send({ type: "stop", key: cur.key, id: cur.id });
    this.hiddenLater(cur.key);
  }

  stop(): void {
    this.drop();
  }

  setPaused(paused: boolean): void {
    this.send({ type: "pause", paused });
  }
}
