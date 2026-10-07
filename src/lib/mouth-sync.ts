/**
 * Mouth frames from real TTS playback.
 * Rest (0) before the first sample and after the last.
 * While audio is playing, RMS picks closed (1), half-open (2), or open (3)
 * with a little hysteresis so syllables open and gaps close.
 * If the analyser never attaches, `drive` is "chew": the old timed flap,
 * still only between playing and ended.
 */

export type MouthPhase = "idle" | "playing" | "ended" | "paused" | "error";

export type MouthDrive = "rest" | "rms" | "chew";

/** 0 rest, 1 closed, 2 half-open (Maker 02), 3 open (Maker 03). */
export type MouthSyncFrame = 0 | 1 | 2 | 3;

export type MouthAudioEvent =
  | { type: "playing"; analyserOk?: boolean; t?: number }
  | { type: "rms"; rms: number; t?: number }
  | { type: "ended"; t?: number }
  | { type: "pause"; t?: number }
  | { type: "error"; t?: number }
  | { type: "stop"; t?: number };

export type MouthSyncSnapshot = {
  phase: MouthPhase;
  frame: MouthSyncFrame;
  open: boolean;
  drive: MouthDrive;
};

/** Enter half-open from closed. */
export const MOUTH_RMS_HALF_ON = 0.04;
/** Drop from half-open back to closed. */
export const MOUTH_RMS_HALF_OFF = 0.025;
/** Enter open from closed or half-open. */
export const MOUTH_RMS_OPEN_ON = 0.09;
/** Drop from open back to half-open. */
export const MOUTH_RMS_OPEN_OFF = 0.055;
/** One-pole mix on each sample. Half the new RMS, half the previous. */
export const MOUTH_RMS_ALPHA = 0.5;
/**
 * Shortest time an audio mouth frame stays up.
 * Two frames at 30 fps. Time-based, so a fast display cannot flicker under it.
 * Ended, pause, error, and stop still cut to rest immediately.
 */
export const MOUTH_FRAME_HOLD_MS = 66;

function clampRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  return rms > 1 ? 1 : rms;
}

function frameFromRms(rms: number, prev: number): 1 | 2 | 3 {
  const loud = clampRms(rms);
  if (prev >= 3) {
    if (loud >= MOUTH_RMS_OPEN_OFF) return 3;
    if (loud >= MOUTH_RMS_HALF_OFF) return 2;
    return 1;
  }
  if (prev === 2) {
    if (loud >= MOUTH_RMS_OPEN_ON) return 3;
    if (loud >= MOUTH_RMS_HALF_OFF) return 2;
    return 1;
  }
  if (loud >= MOUTH_RMS_OPEN_ON) return 3;
  if (loud >= MOUTH_RMS_HALF_ON) return 2;
  return 1;
}

/**
 * One playback sample.
 * `rms` omitted means no sample yet (rest, even if phase is already playing).
 */
export function mouthFrameFromPlayback(input: {
  phase: MouthPhase;
  rms?: number;
  prev: number;
  analyserOk: boolean;
}): MouthSyncSnapshot {
  const phase = input.phase;
  if (phase !== "playing") {
    return { phase, frame: 0, open: false, drive: "rest" };
  }
  if (!input.analyserOk) {
    return { phase, frame: 0, open: false, drive: "chew" };
  }
  if (input.rms === undefined) {
    return { phase, frame: 0, open: false, drive: "rms" };
  }
  const frame = frameFromRms(input.rms, input.prev);
  return { phase, frame, open: frame >= 2, drive: "rms" };
}

function phaseFor(type: MouthAudioEvent["type"]): MouthPhase | null {
  if (type === "playing") return "playing";
  if (type === "pause") return "paused";
  if (type === "error") return "error";
  if (type === "ended" || type === "stop") return "ended";
  return null;
}

export type MouthPlaybackState = MouthSyncSnapshot & {
  /** Smoothed RMS used for the threshold. */
  smooth: number;
  /** When the current frame was shown. */
  shownAt: number;
  analyserOk: boolean;
};

export function initialMouthPlayback(now = 0): MouthPlaybackState {
  return {
    phase: "idle",
    frame: 0,
    open: false,
    drive: "rest",
    smooth: 0,
    shownAt: now,
    analyserOk: true,
  };
}

function stoppedPhase(type: MouthAudioEvent["type"]): MouthPhase {
  if (type === "pause") return "paused";
  if (type === "error") return "error";
  return "ended";
}

/**
 * One audio event.
 * RMS is smoothed, then held for {@link MOUTH_FRAME_HOLD_MS} so a syllable
 * cannot flicker. Rest on stop is not held.
 */
export function stepMouthPlayback(state: MouthPlaybackState, event: MouthAudioEvent): MouthPlaybackState {
  const t = event.t ?? state.shownAt;
  if (event.type === "playing") {
    const analyserOk = event.analyserOk !== false;
    return {
      phase: "playing",
      frame: 0,
      open: false,
      drive: analyserOk ? "rms" : "chew",
      smooth: 0,
      shownAt: t,
      analyserOk,
    };
  }
  if (event.type === "ended" || event.type === "pause" || event.type === "error" || event.type === "stop") {
    return {
      phase: stoppedPhase(event.type),
      frame: 0,
      open: false,
      drive: "rest",
      smooth: 0,
      shownAt: t,
      analyserOk: state.analyserOk,
    };
  }
  if (event.type !== "rms") return state;
  if (state.phase !== "playing" || !state.analyserOk) {
    return {
      ...state,
      frame: 0,
      open: false,
      drive: state.phase === "playing" ? "chew" : "rest",
    };
  }
  const sample = clampRms(event.rms);
  const smooth = state.smooth * (1 - MOUTH_RMS_ALPHA) + sample * MOUTH_RMS_ALPHA;
  const mapped = mouthFrameFromPlayback({
    phase: "playing",
    rms: smooth,
    prev: state.frame,
    analyserOk: true,
  });
  // A true gap should close, not sit on half-open while the smoother drains.
  let target = mapped.frame;
  if (sample < MOUTH_RMS_HALF_OFF && smooth < MOUTH_RMS_OPEN_OFF) target = 1;
  if (target === state.frame) {
    return { ...state, smooth, open: state.frame >= 2, drive: "rms" };
  }
  if (state.frame !== 0 && t - state.shownAt < MOUTH_FRAME_HOLD_MS) {
    return { ...state, smooth, drive: "rms" };
  }
  return {
    ...state,
    smooth,
    frame: target,
    open: target >= 2,
    drive: "rms",
    shownAt: t,
  };
}

/** Timed fold. Samples without `t` are treated as already past the hold. */
export function reduceMouthPlaybackTimed(events: readonly MouthAudioEvent[]): MouthPlaybackState[] {
  let state = initialMouthPlayback(0);
  const out: MouthPlaybackState[] = [];
  for (const event of events) {
    const stamped = event.t === undefined ? { ...event, t: state.shownAt + MOUTH_FRAME_HOLD_MS } : event;
    state = stepMouthPlayback(state, stamped);
    out.push(state);
  }
  return out;
}

/**
 * Fold audio events and RMS samples into mouth frames.
 * Open is true only on loud samples that sit strictly between playing and stop.
 */
export function reduceMouthPlayback(events: readonly MouthAudioEvent[]): MouthSyncSnapshot[] {
  let phase: MouthPhase = "idle";
  let prev = 0;
  let analyserOk = true;
  const out: MouthSyncSnapshot[] = [];
  for (const event of events) {
    const nextPhase = phaseFor(event.type);
    if (nextPhase) phase = nextPhase;
    if (event.type === "playing") {
      analyserOk = event.analyserOk !== false;
      prev = 0;
    }
    const snap = mouthFrameFromPlayback({
      phase,
      rms: event.type === "rms" ? event.rms : undefined,
      prev,
      analyserOk,
    });
    prev = snap.drive === "rms" ? snap.frame : 0;
    out.push(snap);
  }
  return out;
}
