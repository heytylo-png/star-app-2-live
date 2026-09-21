/**
 * Chat transcript height — bottom band only.
 * Bubbles sit on the hem / mid-skirt (lower third of `.rai-rig`).
 * Face + ahoge stay clear. Transparent frame, no white card.
 * Optional drag handle persists a pixel height in localStorage;
 * drag cannot grow past this ceiling.
 */

export const CHAT_THREAD_HEIGHT_KEY = "star-rai-chat-thread-height";

/** Default = Expo-style bottom-third of the viewport, then clamped to the band. */
export const CHAT_THREAD_DEFAULT_VH = 0.28;

/** Fallback px when viewport is unknown (0.28 × 800). */
export const CHAT_THREAD_DEFAULT_PX = Math.round(800 * CHAT_THREAD_DEFAULT_VH);

/** One compact bubble + grip. */
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
  return Math.max(CHAT_THREAD_MIN_PX, Math.min(byVh, byRig));
}

export function defaultChatThreadHeightPx(viewportHeight: number): number {
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  return clampChatThreadHeightPx(Math.round(vh * CHAT_THREAD_DEFAULT_VH), vh);
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
