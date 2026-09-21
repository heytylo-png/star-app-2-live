/**
 * Track the last user beat — voice-card TRACK / CORRECTION / ASKS helpers.
 * Used by the Grok packer and the pose-keyed local-brain fallback.
 * Kiss stays unmapped. Output contract is still {"line","emotion","pose"}.
 */

import { pickLocalBrainLine } from "./local-brain.ts";
import { DEFAULT_EMOTION, type EmotionId } from "./rai.ts";

/** Last N user/assistant turns sent to Grok. Keep in sync with helix MAX_HISTORY. */
export const GROK_TURN_MAX = 16;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type TrackedAct = {
  emotion: EmotionId;
  line: string;
};

/** Stock bratty-flirt beats that ignore what they just said. */
export const STOCK_FLIRT_RE =
  /\blooking at you\b|\bdon'?t flinch\b|\bthen ask already\b|\bdon'?t drag it\b/i;

export const CORRECTION_RE =
  /\b(?:that'?s not what i (?:said|meant)|that is not what i (?:said|meant)|i didn'?t (?:say|mean) that|i never (?:said|asked) that|you(?:'re| are) (?:not listening|mishearing|misread(?:ing)?)|not what i (?:said|meant))\b/i;

export const PERMISSION_ASK_RE =
  /\b(?:(?:all|everything) you (?:have to|need to|gotta) do is ask|you just (?:have to|need to|gotta) ask|all i (?:have to|need to) do is ask)\b/i;

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function isCorrectionTurn(text: string): boolean {
  return CORRECTION_RE.test(cleanText(text));
}

export function isPermissionAsk(text: string): boolean {
  return PERMISSION_ASK_RE.test(cleanText(text));
}

/** True only when they clearly put a question / request to her — not permission language. */
export function theyClearlyAsked(text: string): boolean {
  const t = cleanText(text);
  if (!t) return false;
  if (isPermissionAsk(t)) return false;
  if (/\?/.test(t)) return true;
  return /\b(?:i(?:'m| am) asking|i asked you|let me ask you|can you|could you|will you|would you)\b/i.test(
    t,
  );
}

export function isBareGreeting(text: string): boolean {
  const t = cleanText(text).toLowerCase().replace(/[!~.]+$/g, "");
  return /^(hi|hey|hello|yo|sup|good morning|good evening|just got here|i'?m here)$/i.test(t);
}

/** Short phrase from their last line so a local fallback can still use their words. */
export function clipUserBeat(text: string, max = 42): string {
  let t = cleanText(text).replace(/^["'“”]+|["'“”]+$/g, "");
  const parts = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 1 && /^(hi|hey|hello|yo|sup)[.!?~]*$/i.test(parts[0] ?? "")) {
    t = parts.slice(1).join(" ");
  }
  t = t.replace(/[.!?~]+$/g, "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

export function localTrackKey(userText: string): "_correction" | "_permission" | null {
  const t = cleanText(userText);
  if (!t) return null;
  if (isCorrectionTurn(t)) return "_correction";
  if (isPermissionAsk(t)) return "_permission";
  return null;
}

/**
 * Local-brain line for generic chat (no named pose).
 * Corrections / permission-asks use table rows; other lines echo their words.
 * Bare greetings return null so the idle pose bank can still fire.
 */
export function localTrackAct(userText: string): TrackedAct | null {
  const cleaned = cleanText(userText);
  if (!cleaned) return null;

  const key = localTrackKey(cleaned);
  if (key) {
    const row = pickLocalBrainLine(key);
    return { emotion: row.emotion, line: row.line };
  }

  if (isBareGreeting(cleaned)) return null;

  const beat = clipUserBeat(cleaned);
  if (!beat) return null;
  return {
    emotion: DEFAULT_EMOTION,
    line: `${beat}. Yeah, I heard that~`,
  };
}

/** Keep the last N turns; always retain a last user line when one exists. */
export function packChatTurns(messages: ChatTurn[], max: number = GROK_TURN_MAX): ChatTurn[] {
  const cleaned = messages.filter((m) => m.content.trim().length > 0);
  if (cleaned.length <= max) return cleaned;
  const tail = cleaned.slice(-max);
  if (tail.some((m) => m.role === "user")) return tail;
  const lastUser = [...cleaned].reverse().find((m) => m.role === "user");
  if (!lastUser) return tail;
  return [...tail.slice(1), lastUser];
}

/** Compact cue appended after CLOCK / MEMORY FACTS on the Grok path. */
export function formatLastUserCue(messages: ChatTurn[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user")?.content.trim();
  if (!last) return "";
  return `LAST USER SAID\n${last}\nTrack that line. One beat. If they corrected you, acknowledge and pivot.`;
}
