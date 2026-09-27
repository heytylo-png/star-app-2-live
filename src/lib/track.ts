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

/** Short phrase from their last line for topic hints. Not for her spoken line. */
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

const COFFEE_RE = /\b(?:coffee|latte|espresso)\b/i;
const TIRED_RE = /\b(?:tired|sleepy|exhausted|wiped|drained)\b/i;
const DOING_RE = /\bwhat(?:'re| are|'?s| is)? (?:you |ya |u )?(?:doing|up to)\b/i;

const REACTION_BANKS: { test: (text: string) => boolean; lines: readonly string[] }[] = [
  { test: (text) => COFFEE_RE.test(text), lines: ["Save me a sip :3", "Pour it. I'm watching~"] },
  { test: (text) => TIRED_RE.test(text), lines: ["Then sit. I'm not making you move~", "Low battery. Stay anyway :3"] },
  { test: (text) => DOING_RE.test(text), lines: ["Standing here. You called~", "Nothing you get to grade :3"] },
  {
    test: (text) => /\?\s*$/.test(text) || /\b(?:what|why|how|where|when|who)\b/i.test(text),
    lines: ["You first. I'm listening~", "Asking me? Bold :3"],
  },
];

const GENERIC_REACTIONS = [
  "Okay. Say more~",
  "Mm. I'm with you :3",
  "Cute. Keep going :3",
  "Your turn. I'm here~",
] as const;

const ECHO_ACK_RE = /\byeah,?\s+i heard that\b|\bi heard that\b/i;

/** Words for overlap checks. Apostrophes fold so "I'm" and "im" match. */
export function speechTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function longestSharedRun(clause: string[], user: string[]): number {
  let best = 0;
  for (let i = 0; i < clause.length; i++) {
    for (let j = 0; j < user.length; j++) {
      let k = 0;
      while (i + k < clause.length && j + k < user.length && clause[i + k] === user[j + k]) k += 1;
      if (k > best) best = k;
    }
  }
  return best;
}

/** Share of the user's words that appear in the clause. */
function userTokenOverlap(clause: string[], user: string[]): number {
  const unique = [...new Set(user)];
  if (!unique.length) return 0;
  const have = new Set(clause);
  let hit = 0;
  for (const token of unique) if (have.has(token)) hit += 1;
  return hit / unique.length;
}

/**
 * True when a clause repeats the latest user message:
 * 4+ consecutive words, or more than 60% of their tokens.
 */
export function clauseEchoesUser(clause: string, userText: string): boolean {
  const left = speechTokens(clause);
  const right = speechTokens(userText);
  if (!left.length || !right.length) return false;
  if (longestSharedRun(left, right) >= 4) return true;
  return userTokenOverlap(left, right) > 0.6;
}

export function lineEchoesUser(line: string, userText: string): boolean {
  const clauses = line
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = clauses.length ? clauses : [line];
  return parts.some((part) => clauseEchoesUser(part, userText) || ECHO_ACK_RE.test(part));
}

function pickStable(lines: readonly string[], seed: string): string {
  let hash = 2166136261;
  for (const ch of seed) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return lines[(hash >>> 0) % lines.length]!;
}

/** In-voice reaction to what they said. Never their words. */
export function localReactionLine(userText: string): string {
  const cleaned = cleanText(userText);
  const bank = REACTION_BANKS.find((row) => row.test(cleaned));
  const line = pickStable(bank?.lines ?? GENERIC_REACTIONS, cleaned.toLowerCase());
  if (!clauseEchoesUser(line, cleaned) && !ECHO_ACK_RE.test(line)) return line;
  return "Mm. Your move~";
}

/**
 * Drop a clause that repeats the latest user message or is the
 * "yeah I heard that" ack. If nothing is left, one local reaction.
 * Clock time-ask lines pass `exempt` and stay the real hour.
 */
export function filterEchoedLine(line: string, userText: string, opts?: { exempt?: boolean }): string {
  const raw = line.replace(/\s+/g, " ").trim();
  if (!raw || opts?.exempt) return raw;
  const user = cleanText(userText);
  if (!user) return raw;
  const kept = raw
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !clauseEchoesUser(part, user) && !ECHO_ACK_RE.test(part));
  if (kept.length) return kept.join(" ");
  return localReactionLine(user);
}

/**
 * Local-brain line for generic chat (no named pose).
 * Corrections / permission-asks use table rows. Other lines react.
 * They never get their own words back. Bare greetings return null
 * so the idle pose bank can still fire.
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

  return {
    emotion: DEFAULT_EMOTION,
    line: localReactionLine(cleaned),
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
  return `LAST USER SAID\n${last}\nAnswer that line. One beat. Do not repeat or quote it. If they corrected you, acknowledge and pivot.`;
}
