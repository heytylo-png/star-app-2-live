/**
 * Welcome-back wave (TyLo 2026-10-13 10:08): "Two separate muted clips. Use either one. Both start on the idle
 * glare and end on the idle glare. Play the whole clip when the user comes back after a while."
 *
 * - 1329: open-palm wave, face stays closer to the glare. 1330: open-palm wave, face softens more.
 * - On app open or resume, when the last user activity was >= 6 h ago, one of the two (random) plays in full,
 *   idle -> idle, once per return. No chat line, no TTS (the AVIFs hold no audio track).
 * - Only on a resting idle stage (no bridge, no hold, not talking). A send that comes first defers it until the
 *   stage is idle again.
 * - Lazy: its player and files only start when a welcome is due (or the debug param asks), never at startup.
 * - Debug: `?welcome=1329` / `?welcome=1330` (or `?welcome=1`, random) plays it once on load whatever the gap.
 *
 * Pure (no DOM): the puppet owns the canvases and the player; this module decides when.
 */
import { WELCOME_1329_CLIP, WELCOME_1330_CLIP, type SmugClip } from "./pose-bridge.ts";

export { WELCOME_1329_CLIP, WELCOME_1330_CLIP };
export const WELCOME_CLIPS = [WELCOME_1329_CLIP, WELCOME_1330_CLIP] as const;

/** A return after this much quiet gets the welcome. */
export const WELCOME_GAP_MS = 6 * 60 * 60 * 1000;
/** Last user activity (ms epoch), kept across visits. */
export const WELCOME_ACTIVITY_KEY = "rai-last-activity-ms";
/** A due welcome that never finds a resting idle stage within this long is dropped (no surprise wave much later). */
export const WELCOME_PENDING_MAX_MS = 10 * 60 * 1000;
/** The stage must have rested on idle this long (after a send, a bridge or a line) before the welcome starts. */
export const WELCOME_SETTLE_MS = 1200;

/** Should a return with this last-activity stamp get the welcome? No stamp (first visit ever) is not a return. */
export function welcomeDue(lastActivityMs: number | null, nowMs: number): boolean {
  if (lastActivityMs == null || !Number.isFinite(lastActivityMs)) return false;
  return nowMs - lastActivityMs >= WELCOME_GAP_MS;
}

/** `?welcome=1329|1330|1` -> the forced clip (random for 1), or null. */
export function welcomeDebugClip(search: string, rand: () => number = Math.random): SmugClip | null {
  const v = new URLSearchParams(search).get("welcome")?.trim();
  if (!v) return null;
  if (v === "1329") return WELCOME_1329_CLIP;
  if (v === "1330") return WELCOME_1330_CLIP;
  if (v === "1" || v === "random") return pickWelcomeClip(rand);
  return null;
}

export function pickWelcomeClip(rand: () => number = Math.random): SmugClip {
  return rand() < 0.5 ? WELCOME_1329_CLIP : WELCOME_1330_CLIP;
}

export function readLastActivity(storage: Pick<Storage, "getItem"> | null): number | null {
  try {
    const raw = storage?.getItem(WELCOME_ACTIVITY_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(storage: Pick<Storage, "setItem"> | null, nowMs: number): void {
  try {
    storage?.setItem(WELCOME_ACTIVITY_KEY, String(Math.round(nowMs)));
  } catch {
    /* private mode / quota: no welcome bookkeeping */
  }
}

/** What the stage looks like right now, for the welcome gate. */
export type WelcomeStage = {
  /** Bridge key of the shown plates is "idle" and no clip canvas is up. */
  restingIdle: boolean;
  talking: boolean;
  /** The wanted pose is idle (nothing about to change). */
  wantedIdle: boolean;
  reducedMotion: boolean;
};

/**
 * One welcome per return. `arm()` on open / resume with the last-activity stamp read before this visit touched it;
 * `tick()` on every stage change and timer; it says "play" once, when the stage has rested on idle for
 * WELCOME_SETTLE_MS. A send while armed only pushes the settle clock (defer), it never cancels.
 */
export class WelcomeGate {
  private pendingSince: number | null = null;
  private clip: SmugClip | null = null;
  private idleSince: number | null = null;

  /** A return was detected (or the debug param): play `clip` once the stage rests. */
  arm(clip: SmugClip, nowMs: number): void {
    this.clip = clip;
    this.pendingSince = nowMs;
    this.idleSince = null;
  }

  pending(): SmugClip | null {
    return this.clip;
  }

  /** The user sent something: wait for the stage to settle again. */
  deferForSend(): void {
    this.idleSince = null;
  }

  tick(stage: WelcomeStage, nowMs: number): SmugClip | null {
    if (!this.clip || this.pendingSince == null) return null;
    if (nowMs - this.pendingSince > WELCOME_PENDING_MAX_MS) {
      this.clear();
      return null;
    }
    if (stage.reducedMotion) {
      this.clear();
      return null;
    }
    const ok = stage.restingIdle && stage.wantedIdle && !stage.talking;
    if (!ok) {
      this.idleSince = null;
      return null;
    }
    if (this.idleSince == null) this.idleSince = nowMs;
    if (nowMs - this.idleSince < WELCOME_SETTLE_MS) return null;
    const clip = this.clip;
    this.clear();
    return clip;
  }

  clear(): void {
    this.clip = null;
    this.pendingSince = null;
    this.idleSince = null;
  }
}
