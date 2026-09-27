/**
 * Chat transcript height — a short stack just above the input.
 * At rest only the last two beats are in the window. Older lines stay in
 * that same strip and come back by scrolling. Face, torso, and thighs stay
 * clear. Transparent frame, no card.
 */

export const CHAT_THREAD_HEIGHT_KEY = "star-rai-chat-thread-height";

/** Resting readable beats. Older lines scroll inside this window. */
export const CHAT_THREAD_VISIBLE_BEATS = 2;

/**
 * Safety ceiling for the strip (two wrapped compact beats + fade).
 * A 5-line tease must not grow into the thighs. Matches `.chat-thread-frame`.
 */
export const CHAT_THREAD_CEILING_REM = 8.5;
export const CHAT_THREAD_CEILING_PX = Math.round(CHAT_THREAD_CEILING_REM * 16);

/**
 * Scroll mask band (fully transparent, then a fade). Not added to the resting
 * window — a partial older bubble must not sit in the opaque part of the mask.
 * Matches `.chat-thread-mask` (transparent through 1.25rem, opaque by 2.75rem).
 */
export const CHAT_THREAD_FADE_PX = 44;

/** Kept so a stored drag from the old tall band still clamps down. */
export const CHAT_THREAD_DEFAULT_VH = 0.28;

/** Fallback px when viewport is unknown — the two-beat ceiling, not 28vh. */
export const CHAT_THREAD_DEFAULT_PX = CHAT_THREAD_CEILING_PX;

/** One compact bubble. */
export const CHAT_THREAD_MIN_PX = Math.round(5.75 * 16);

/**
 * Secondary viewport cap (tightened from 0.4). Even without a rig measure,
 * resize cannot climb past a bottom-band slice of the screen.
 */
export const CHAT_THREAD_MAX_VH = 0.32;

/** Match `.rai-rig` top: `--rai-top-bar` (3.25rem) + 0.2rem crown air. */
export const RAI_RIG_TOP_REM = 3.25 + 0.2;

/** Match `.rai-rig` bottom: `clamp(5.1rem, 15vh, 7.25rem)` (composer + tabs). */
export const RAI_RIG_BOTTOM_MIN_REM = 5.1;
export const RAI_RIG_BOTTOM_VH = 0.15;
export const RAI_RIG_BOTTOM_MAX_REM = 7.25;

const REM_PX = 16;

/** Bubble stack may occupy only the lower third of `.rai-rig` (hem / mid-skirt). */
export const CHAT_THREAD_RIG_BAND = 1 / 3;

export function raiRigHeightPx(viewportHeight: number): number {
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  const top = RAI_RIG_TOP_REM * REM_PX;
  const bottom = Math.min(
    RAI_RIG_BOTTOM_MAX_REM * REM_PX,
    Math.max(RAI_RIG_BOTTOM_MIN_REM * REM_PX, vh * RAI_RIG_BOTTOM_VH),
  );
  return Math.max(0, vh - top - bottom);
}

export function maxChatThreadHeightPx(viewportHeight: number): number {
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  const byVh = Math.round(vh * CHAT_THREAD_MAX_VH);
  const byRig = Math.round(raiRigHeightPx(vh) * CHAT_THREAD_RIG_BAND);
  const torso = Math.max(CHAT_THREAD_MIN_PX, Math.min(byVh, byRig));
  return Math.min(torso, CHAT_THREAD_CEILING_PX);
}

export function defaultChatThreadHeightPx(viewportHeight: number): number {
  return maxChatThreadHeightPx(viewportHeight);
}

export type BeatBox = { offsetTop: number; offsetHeight: number };

/**
 * Pixel height of the resting window: exactly the last `beats` bubbles plus
 * bottom padding. Older bubbles stay above this edge so a clipped sliver
 * cannot show at rest.
 */
export function visibleBeatWindowPx(
  boxes: readonly BeatBox[],
  beats = CHAT_THREAD_VISIBLE_BEATS,
  pad = 4,
): number {
  if (!boxes.length || beats <= 0) return 0;
  const slice = boxes.slice(-beats);
  const top = slice[0]?.offsetTop ?? 0;
  const last = slice[slice.length - 1];
  const bottom = (last?.offsetTop ?? 0) + (last?.offsetHeight ?? 0);
  return Math.max(0, Math.round(bottom - top + pad));
}

/**
 * Scroll offset that aligns the window with the first resting beat.
 * Anything above that beat — including a partial older bubble — is clipped.
 */
export function restingBeatScrollTop(
  boxes: readonly BeatBox[],
  beats = CHAT_THREAD_VISIBLE_BEATS,
): number {
  if (boxes.length <= beats || beats <= 0) return 0;
  return boxes[boxes.length - beats]?.offsetTop ?? 0;
}

/** Beats shown at rest. Older messages stay mounted above this slice. */
export function restingChatBeats<T>(messages: readonly T[], visible = CHAT_THREAD_VISIBLE_BEATS): T[] {
  if (visible <= 0) return [];
  return messages.slice(-visible);
}

export function clampChatThreadHeightPx(px: number, viewportHeight: number): number {
  const max = maxChatThreadHeightPx(viewportHeight);
  if (!Number.isFinite(px)) return defaultChatThreadHeightPx(viewportHeight);
  return Math.round(Math.min(max, Math.max(CHAT_THREAD_MIN_PX, px)));
}

export function parseStoredChatThreadHeight(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function loadChatThreadHeightPx(viewportHeight: number): number {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CHAT_THREAD_HEIGHT_KEY);
  } catch {
    raw = null;
  }
  const stored = parseStoredChatThreadHeight(raw);
  if (stored == null) return defaultChatThreadHeightPx(viewportHeight);
  return clampChatThreadHeightPx(stored, viewportHeight);
}

export function saveChatThreadHeightPx(px: number, viewportHeight: number): number {
  const clamped = clampChatThreadHeightPx(px, viewportHeight);
  try {
    localStorage.setItem(CHAT_THREAD_HEIGHT_KEY, String(clamped));
  } catch {
    /* private mode / quota */
  }
  return clamped;
}
