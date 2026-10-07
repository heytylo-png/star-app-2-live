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
  | { type: "playing"; analyserOk?: boolean }
  | { type: "rms"; rms: number }
  | { type: "ended" }
  | { type: "pause" }
  | { type: "error" }
  | { type: "stop" };

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
