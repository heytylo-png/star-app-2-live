export type CompanionMood = "idle" | "listen" | "think" | "talk";

export const MOOD_LABEL: Record<CompanionMood, string> = {
  idle: "Idling",
  listen: "Listening",
  think: "Thinking",
  talk: "Speaking",
};

export const MAX_TTS_CHARS = 520;

const DUMP_HEADER =
  /^(MEMORY FACTS|LORE USE|ALWAYS CONSIDER|CONDITIONAL|CLOCK|NOW|SKY)\b/i;
const BLOCK_DUMP = /^(CHART|LIFE|CLOCK|SKY)\s*\n/;

function extractSpokenLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (DUMP_HEADER.test(trimmed) || BLOCK_DUMP.test(trimmed)) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const lineField = trimmed.match(/"line"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (!lineField) return "";
    return lineField[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  }
  return trimmed;
}

/** Text to speak / show as her line — never JSON, memory lists, or lore dumps. */
export function speakable(text: string) {
  const line = extractSpokenLine(text);
  const cleaned = line
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (DUMP_HEADER.test(cleaned) || BLOCK_DUMP.test(cleaned)) return "";
  return cleaned.length > MAX_TTS_CHARS ? `${cleaned.slice(0, MAX_TTS_CHARS).trimEnd()}…` : cleaned;
}
