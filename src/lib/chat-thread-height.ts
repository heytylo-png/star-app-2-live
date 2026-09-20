/**
 * Chat transcript height — Expo-style compact stack in the bottom third.
 * Transparent frame (no white card) so the puppet stays on stage.
 * Optional drag handle persists a pixel height in localStorage.
 */

export const CHAT_THREAD_HEIGHT_KEY = "star-rai-chat-thread-height";

/** Default = ~bottom third of the viewport (Expo target). */
export const CHAT_THREAD_DEFAULT_VH = 0.28;

/** Fallback px when viewport is unknown (0.28 × 800). */
export const CHAT_THREAD_DEFAULT_PX = Math.round(800 * CHAT_THREAD_DEFAULT_VH);

/** One compact bubble + grip. */
export const CHAT_THREAD_MIN_PX = Math.round(5.75 * 16);

/** Hard cap vs viewport so the pane cannot eat the stage / torso. */
export const CHAT_THREAD_MAX_VH = 0.4;

/**
 * Header + composer + tabs + a minimum puppet band (torso / face).
 * Viewport minus this is the other max-height clamp.
 */
export const CHAT_THREAD_STAGE_RESERVE_PX = 420;

export function maxChatThreadHeightPx(viewportHeight: number): number {
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  const byVh = Math.round(vh * CHAT_THREAD_MAX_VH);
  const byReserve = vh - CHAT_THREAD_STAGE_RESERVE_PX;
  return Math.max(CHAT_THREAD_MIN_PX, Math.min(byVh, byReserve));
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
