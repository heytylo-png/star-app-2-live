/**
 * Away / return memory — Kindroid-style one-beat notice, then resume.
 * Local-only. PNG puppet default. No pose swap required.
 *
 * Buckets from lastSeenAt:
 *   < ~4h        silent
 *   ~4h–1 day    light notice
 *   ~1–3 days    notice + optional last-topic hook
 *   3d+          notice once, then move on (never worry / guilt)
 */

import { extractSlotsFromUserText } from "./memory-slots.ts";
import { clipUserBeat } from "./track.ts";
import type { ChatMessage } from "./helix.ts";

export const RETURN_GAP_LIGHT_MS = 4 * 60 * 60 * 1000;
export const RETURN_GAP_NOTICE_MS = 24 * 60 * 60 * 1000;
export const RETURN_GAP_LONG_MS = 3 * 24 * 60 * 60 * 1000;

export const PRESENCE_HEARTBEAT_MS = 45_000;

export const TOPIC_HINT_MAX = 42;
export const TOPIC_HOOK_MAX = 28;

export type ReturnBucket = "silent" | "light" | "notice" | "long";
export type ReturnSurface = "chat" | "call";

export type PresenceSnapshot = {
  lastSeenAt: number | null;
  lastTopicHint: string | null;
  /** lastSeenAt value already acknowledged with a return bubble. */
  returnAckedFor: number | null;
};

export type ReturnOffer = {
  inject: boolean;
  line: string | null;
  bucket: ReturnBucket;
  next: PresenceSnapshot;
};

/** Lines that must never appear — Replika / worry / onboarding energy. */
export const RETURN_BANNED_RE =
  /i missed you|missed you so much|i was worried|where were you|where have you been|how many hours|for \d+ hours|check[- ]in|how are you feeling|i(?:'m| am) here for you|welcome back to|it(?:'s| has) been too long|i was waiting|don'?t abandon|therapy|onboarding/i;

export const RETURN_LINES_LIGHT = [
  "You went quiet. Busy?",
  "Back. Don't make it a thing :3",
  "There you are. Took a minute~",
] as const;

export const RETURN_LINES_NOTICE = [
  "You went quiet. Anyway—",
  "Days, huh. You're here now :3",
] as const;

export const RETURN_LINES_LONG = [
  "You're here. What's up~",
  "Hey. Moving on :3",
  "There you are. Anyway—",
] as const;

let sessionGapKey: number | null = null;
let sessionSurface: ReturnSurface | null = null;

export function resetReturnSession(): void {
  sessionGapKey = null;
  sessionSurface = null;
}

export function lastReturnSurface(): ReturnSurface | null {
  return sessionSurface;
}

export function parseLastSeenAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const t = Date.parse(trimmed);
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  return null;
}

export function clipTopicHint(text: string, max: number = TOPIC_HINT_MAX): string {
  const beat = clipUserBeat(text, Math.max(1, max - 1));
  const t = beat.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Tiny last-topic string from a user line. Null if it's only a greeting / pose tap. */
export function topicHintFromUserText(text: string): string | null {
  const topic = extractSlotsFromUserText(text).last_topic;
  const clipped = clipTopicHint(topic ?? "");
  return clipped || null;
}

export function gapMs(lastSeenAt: number | null, now: number): number {
  if (lastSeenAt == null || lastSeenAt <= 0) return 0;
  return Math.max(0, now - lastSeenAt);
}

export function returnBucket(gap: number): ReturnBucket {
  if (gap < RETURN_GAP_LIGHT_MS) return "silent";
  if (gap < RETURN_GAP_NOTICE_MS) return "light";
  if (gap < RETURN_GAP_LONG_MS) return "notice";
  return "long";
}

function pickFrom<T>(items: readonly T[], seed: number): T {
  if (!items.length) throw new Error("empty return line bank");
  const i = Math.abs(Math.floor(seed)) % items.length;
  return items[i]!;
}

function hookHint(raw: string | null | undefined): string {
  return clipTopicHint(raw ?? "", TOPIC_HOOK_MAX);
}

export function noticeTopicLines(hint: string): string[] {
  const h = hookHint(hint);
  if (!h) return [...RETURN_LINES_NOTICE];
  return [`You went quiet. Still on ${h}?`, `Back. We were on ${h} :3`];
}

export function composeReturnLine(
  bucket: Exclude<ReturnBucket, "silent">,
  lastTopicHint: string | null,
  seed = 0,
): string {
  if (bucket === "light") return pickFrom(RETURN_LINES_LIGHT, seed);
  if (bucket === "long") return pickFrom(RETURN_LINES_LONG, seed);
  const hint = hookHint(lastTopicHint);
  const bank = hint ? noticeTopicLines(hint) : RETURN_LINES_NOTICE;
  return pickFrom(bank, seed);
}

export function linePassesTone(line: string): boolean {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  if (RETURN_BANNED_RE.test(trimmed)) return false;
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 2) return false;
  return true;
}

/** Last bubble is already the return nag for this gap — don't stack. */
export function threadHasFreshReturnBeat(messages: readonly ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  return Boolean(last && last.role === "assistant" && last.source === "return");
}

/**
 * Decide whether to inject a return beat, and the presence snapshot to persist.
 * Session lock: Chat and Call cannot both fire for the same lastSeenAt.
 */
export function offerReturnBeat(
  state: PresenceSnapshot,
  now: number,
  surface: ReturnSurface,
  opts: { threadHasReturn?: boolean } = {},
): ReturnOffer {
  const bucket = returnBucket(gapMs(state.lastSeenAt, now));
  const touched: PresenceSnapshot = { ...state, lastSeenAt: now };

  if (state.lastSeenAt == null || bucket === "silent") {
    return { inject: false, line: null, bucket, next: touched };
  }

  if (state.returnAckedFor === state.lastSeenAt || opts.threadHasReturn) {
    return { inject: false, line: null, bucket, next: touched };
  }

  if (sessionGapKey === state.lastSeenAt) {
    // Other surface already claimed this gap. Do not retouch or re-nag.
    return { inject: false, line: null, bucket, next: state };
  }

  sessionGapKey = state.lastSeenAt;
  sessionSurface = surface;

  const line = composeReturnLine(bucket, state.lastTopicHint, state.lastSeenAt);
  return {
    inject: true,
    line,
    bucket,
    next: {
      lastSeenAt: now,
      lastTopicHint: state.lastTopicHint,
      returnAckedFor: state.lastSeenAt,
    },
  };
}
