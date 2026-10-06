/// <reference lib="webworker" />
/**
 * The idle <-> smug clip player (paste-15), off the main thread: decodes the two animated
 * AVIF clips (1085 intro, 1084 rest) with ImageDecoder and paints them at 24 fps onto two
 * OffscreenCanvases handed over by the stage, one per clip, on this worker's own animation
 * frames. A busy main thread (React renders, the reply landing, speech starting) cannot
 * delay, drop or bunch a frame: playback is paced here, like a video element.
 *
 * Pacing (same rules as PoseBridge): frame k is due at anchor + k / 24 s; one frame per
 * animation frame at most, never skipped; a frame that has not decoded holds the one up
 * (stall); more than a frame late shifts the rest of the clip back (re-anchor).
 *
 * Each canvas rests on its clip's frame 0 (armed) while hidden, so the stage can show it the
 * instant a clip starts. After a play the canvas keeps its last frame until the stage says
 * it is hidden, then re-arms.
 */
import { ClipFrames } from "./smug-clip-frames.ts";
import { ClipUnsupportedError, openSmugClipDecoder } from "./smug-clip-decoder.ts";
import type { ClipKey, ClipWorkerIn, ClipWorkerOut } from "./smug-clip-protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

const FRAME_MS = 1000 / 24;
/** A frame is drawn in the first animation frame at or after its due time, less this slack. */
const SLACK_MS = 4;
const LATE_REANCHOR_MS = FRAME_MS;
/**
 * A canvas the stage just hid is re-armed (frame 0 painted on it) only this long after the
 * stage said so: the hide travels the page's own paint pipeline, this canvas's frames go
 * straight to the screen, so an early re-arm could flash frame 0 on a canvas still showing.
 */
const REARM_DELAY_MS = 400;

type Clip = {
  key: ClipKey;
  frames: ClipFrames<VideoFrame>;
  count: number;
  ctx: OffscreenCanvasRenderingContext2D;
  armed: boolean;
  /** Frames painted on the canvas but not hidden yet by the stage (re-arm waits for "hidden"). */
  dirty: boolean;
  rearm: ReturnType<typeof setTimeout> | null;
};
type Play = { clip: Clip; id: number; index: number; anchor: number; stalls: number; reanchors: number };

let clips: Partial<Record<ClipKey, Clip>> = {};
let box = { x: 0, y: 0, w: 0, h: 0 };
let play: Play | null = null;
let paused = false;
let ticking = false;
/** Main-thread clock = performance.now() here + this. */
let toMain = 0;

const raf: (cb: () => void) => void =
  typeof self.requestAnimationFrame === "function"
    ? (cb) => void self.requestAnimationFrame(() => cb())
    : (cb) => void setTimeout(cb, 1000 / 60);

function post(msg: ClipWorkerOut) {
  self.postMessage(msg);
}

function state(clip: Clip) {
  post({
    type: "state",
    key: clip.key,
    ready: clip.armed && clip.frames.ready(),
    failed: clip.frames.failed(),
    unsupported: clip.frames.unsupported(),
  });
}

function draw(clip: Clip, image: VideoFrame) {
  clip.ctx.clearRect(box.x, box.y, box.w, box.h);
  clip.ctx.drawImage(image, box.x, box.y, box.w, box.h);
}

/**
 * Paint frame 0 on a hidden, idle canvas so the next play can show at once. Ready is
 * reported an animation frame later, once that paint has gone to the screen.
 */
function arm(clip: Clip) {
  if (clip.dirty || (play && play.clip === clip)) return;
  const first = clip.frames.ready() ? clip.frames.peek(0) : null;
  if (first && !clip.armed) {
    draw(clip, first);
    clip.armed = true;
    raf(() => raf(() => state(clip)));
    return;
  }
  state(clip);
}

function stopPlay() {
  if (!play) return;
  play.clip.frames.finish();
  play = null;
}

function tick() {
  ticking = false;
  const p = play;
  if (!p || paused) return;
  const now = performance.now();
  const next = p.index + 1;
  const due = p.anchor + next * FRAME_MS;
  if (now < due - SLACK_MS) return schedule();
  if (next >= p.clip.count) {
    // The last frame has had its dwell: the stage shows the live sheet now.
    post({ type: "done", key: p.clip.key, id: p.id, stalls: p.stalls, reanchors: p.reanchors });
    stopPlay();
    return;
  }
  const image = p.clip.frames.peek(next);
  if (!image) {
    p.stalls += 1;
    return schedule();
  }
  const late = now - due;
  if (late > LATE_REANCHOR_MS) {
    p.anchor += late;
    p.reanchors += 1;
  }
  p.clip.frames.take(next);
  draw(p.clip, image);
  p.index = next;
  post({ type: "shown", key: p.clip.key, id: p.id, index: next, t: now + toMain });
  schedule();
}

function schedule() {
  if (ticking || !play || paused) return;
  ticking = true;
  raf(tick);
}

function onPlay(key: ClipKey, id: number, start: number) {
  const clip = clips[key];
  if (!clip) return;
  stopPlay();
  const image = clip.frames.peek(start);
  if (!image) {
    // The stage only plays an armed clip; if it got here anyway, say so (it cuts).
    post({ type: "done", key, id, stalls: 0, reanchors: 0, failed: true });
    return;
  }
  if (!(clip.armed && start === 0)) draw(clip, image);
  if (clip.rearm) clearTimeout(clip.rearm);
  clip.rearm = null;
  clip.armed = false;
  clip.dirty = true;
  state(clip);
  clip.frames.take(start);
  const now = performance.now();
  // The stage showed frame `start` in the animation frame before this message: it gets its
  // full frame from now.
  play = { clip, id, index: start, anchor: now - start * FRAME_MS, stalls: 0, reanchors: 0 };
  post({ type: "shown", key, id, index: start, t: now + toMain });
  schedule();
}

self.onmessage = (ev: MessageEvent<ClipWorkerIn>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "init": {
      toMain = performance.timeOrigin - msg.timeOrigin;
      box = msg.box;
      clips = {};
      for (const c of msg.clips) {
        const ctx = c.canvas.getContext("2d");
        if (!ctx) {
          post({ type: "state", key: c.key, ready: false, failed: true, unsupported: true });
          continue;
        }
        const clip: Clip = {
          key: c.key,
          count: c.frames,
          ctx,
          armed: false,
          dirty: false,
          rearm: null,
          frames: new ClipFrames<VideoFrame>({
            open: () => openSmugClipDecoder(c.url),
            isUnsupported: (err) => err instanceof ClipUnsupportedError,
            frames: c.frames,
            onChange: () => arm(clip),
          }),
        };
        clips[c.key] = clip;
      }
      for (const clip of Object.values(clips)) void clip.frames.load().then(() => arm(clip));
      break;
    }
    case "load":
      for (const clip of Object.values(clips)) {
        if (!clip.frames.ready()) void clip.frames.load().then(() => arm(clip));
      }
      break;
    case "play":
      onPlay(msg.key, msg.id, msg.start);
      break;
    case "stop":
      if (play && play.clip.key === msg.key && play.id === msg.id) stopPlay();
      break;
    case "hidden": {
      const clip = clips[msg.key];
      if (!clip || (play && play.clip === clip)) break;
      if (clip.rearm) clearTimeout(clip.rearm);
      clip.rearm = setTimeout(() => {
        clip.rearm = null;
        if (play && play.clip === clip) return;
        clip.dirty = false;
        arm(clip);
      }, REARM_DELAY_MS);
      break;
    }
    case "pause":
      if (paused === msg.paused) break;
      paused = msg.paused;
      if (!paused && play) {
        // The frame that is up gets its full frame again on return.
        play.anchor = performance.now() - play.index * FRAME_MS;
        schedule();
      }
      break;
  }
};
