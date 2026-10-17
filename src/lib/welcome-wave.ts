/**
 * Welcome-back wave (TyLo 2026-10-13 10:08): "Two separate muted clips. Use either one. Both start on the idle
 * glare and end on the idle glare. Play the whole clip when the user comes back after a while."
 *
 * - 1329: open-palm wave, face stays closer to the glare. 1330: open-palm wave, face softens more.
 * - On app open or resume, when the last user activity was >= 3 h ago (TyLo 2026-10-16: was 6 h), one clip of the pool
 *   (1329, 1330, 1366; random) plays in full,
 *   idle -> idle, once per return. No chat line, no TTS (the AVIFs hold no audio track).
 * - Only on a resting idle stage (no bridge, no hold, not talking). A send that comes first defers it until the
 *   stage is idle again.
 * - Lazy: its player and files only start when a welcome is due (or the debug param asks), never at startup.
 * - Debug: `?welcome=1329` / `?welcome=1330` / `?welcome=1366` (or `?welcome=1`, random) plays it once on load whatever the gap.
 * - Never during a call (connecting or up): a call while it is pending drops it for that return; a call that starts
 *   while it is already playing lets the 5 s clip finish (CoS 356cdf5). Never on the same open as the daily check-in
 *   line, the call-ended card, the remember toast or the Reload notice (welcomeBlocker, read from the existing DOM /
 *   storage; Designer code untouched). Only the picked clip is loaded.
 *
 * Pure (no DOM): the puppet owns the canvases and the player; this module decides when.
 */
import {
  WELCOME_1329_CLIP,
  WELCOME_1330_CLIP,
  WELCOME_1366_CLIP,
  type SmugClip,
} from "./pose-bridge.ts";

export { WELCOME_1329_CLIP, WELCOME_1330_CLIP, WELCOME_1366_CLIP };
/** The welcome pool: two waves (1329, 1330) and the hair flip (1366); one is picked per return. */
export const WELCOME_CLIPS = [WELCOME_1329_CLIP, WELCOME_1330_CLIP, WELCOME_1366_CLIP] as const;

/** A return after this much quiet gets the welcome (3 h; TyLo 2026-10-16 9:26 PM, was 6 h). */
export const WELCOME_GAP_MS = 3 * 60 * 60 * 1000;
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

/** `?welcome=1329|1330|1366|1` -> the forced clip (random for 1), or null. */
export function welcomeDebugClip(search: string, rand: () => number = Math.random): SmugClip | null {
  const v = new URLSearchParams(search).get("welcome")?.trim();
  if (!v) return null;
  const forced = WELCOME_CLIPS.find((c) => c.file === `rai/welcome${v}.avif`);
  if (forced) return forced;
  if (v === "1" || v === "random") return pickWelcomeClip(rand);
  return null;
}

export function pickWelcomeClip(rand: () => number = Math.random): SmugClip {
  const i = Math.min(WELCOME_CLIPS.length - 1, Math.max(0, Math.floor(rand() * WELCOME_CLIPS.length)));
  return WELCOME_CLIPS[i]!;
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

/** Daily check-in stamp key (daily-checkin.ts CHECKIN_DATE_KEY; read only). */
export const WELCOME_CHECKIN_KEY = "star-rai-checkin";

/** What the page shows right now, for the welcome's blockers (read from the existing DOM; see welcomeBlockerFromDom). */
export type WelcomePage = {
  /** "On call" bar or "Allow microphone" (connecting) bar, or the call textbox placeholder. */
  call: boolean;
  callEndedCard: boolean;
  rememberToast: boolean;
  reloadNotice: boolean;
  /** The daily check-in stamp changed on this open (Designer's check-in line posted). */
  checkInPosted: boolean;
};

/** The first reason the welcome must not play on this open, or null. */
export function welcomeBlocker(page: WelcomePage): string | null {
  if (page.call) return "call";
  if (page.checkInPosted) return "check-in";
  if (page.callEndedCard) return "call-ended";
  if (page.rememberToast) return "remember-toast";
  if (page.reloadNotice) return "reload-notice";
  return null;
}

type DocLike = { querySelector: (sel: string) => unknown; querySelectorAll: (sel: string) => ArrayLike<{ textContent: string | null }> };

/** Reads WelcomePage off the live DOM (markers already rendered by rai-app.tsx). */
export function welcomePageFromDom(doc: DocLike, checkInPosted: boolean): WelcomePage {
  let call = false;
  const bars = doc.querySelectorAll("span.font-medium");
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i]!.textContent?.trim() ?? "";
    if (t === "On call" || t === "Allow microphone") call = true;
  }
  const box = doc.querySelector('textarea[placeholder^="On call"], textarea[placeholder^="Listening to"], input[placeholder^="On call"]');
  if (box) call = true;
  return {
    call,
    callEndedCard: Boolean(doc.querySelector("[data-call-ended]")),
    rememberToast: Boolean(doc.querySelector("[data-remember-toast]")),
    reloadNotice: Boolean(doc.querySelector("[data-stale-build-notice]")),
    checkInPosted,
  };
}
