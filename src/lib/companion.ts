export type CompanionMood = "idle" | "listen" | "think" | "talk";

export const MOOD_LABEL: Record<CompanionMood, string> = {
  idle: "Idling",
  listen: "Listening",
  think: "Thinking",
  talk: "Speaking",
};

export const MAX_TTS_CHARS = 520;

export function speakable(text: string) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > MAX_TTS_CHARS ? `${cleaned.slice(0, MAX_TTS_CHARS).trimEnd()}…` : cleaned;
}
