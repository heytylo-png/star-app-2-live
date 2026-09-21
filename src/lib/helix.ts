import { RAI_SYSTEM } from "@/lib/rai";

/** Local presence brain id — kept stable for zustand chat persist. */
export const DEFAULT_MODEL = "star-rai-local";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  model?: string;
  error?: string;
  /** Local away/return nag — one assistant bubble per qualifying gap. */
  source?: "return";
};

export type Thread = {
  id: string;
  title: string;
  model: string;
  personality: PersonalityId;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type PersonalityId = "default" | "direct" | "creative" | "technical";

export type ReasoningLevel = "low" | "medium" | "high" | "xhigh";

export type ModelOption = {
  id: string;
  name: string;
  blurb: string;
  badge?: string;
};

export const CURATED_MODELS: ModelOption[] = [
  {
    id: "star-rai-local",
    name: "Star Rai",
    blurb: "On-device presence brain",
    badge: "Local",
  },
];

export const PERSONALITIES: {
  id: PersonalityId;
  name: string;
  blurb: string;
  system: string;
}[] = [
  {
    id: "default",
    name: "Rai",
    blurb: "Star Rai, as herself",
    system: RAI_SYSTEM,
  },
];

export const STARTERS = [
  {
    label: "Hey",
    prompt: "Hey. Just got here.",
  },
  {
    label: "I bumped you",
    prompt: "Sorry — I wasn't watching where I was going.",
  },
  {
    label: "Who are you?",
    prompt: "Who are you supposed to be?",
  },
  {
    label: "Remember this",
    prompt: "Remember that I like talking to you at night.",
  },
];

export const MAX_INPUT_CHARS = 4000;
export const MAX_HISTORY = 16;
export const MAX_THREADS = 40;
export const MAX_TOKENS = 4096;

export const REASONING_LEVELS: { id: ReasoningLevel; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Med" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Max" },
];

export function personalityById(id: PersonalityId) {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
}

export function modelLabel(id: string) {
  return CURATED_MODELS.find((m) => m.id === id)?.name ?? prettyModelName(id);
}

export function prettyModelName(id: string) {
  return id
    .replace(/^star-rai-/, "Star Rai ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

export function supportsReasoningEffort(_model: string) {
  return false;
}

export function supportsXHighReasoning(_model: string) {
  return false;
}

export function clampReasoning(_model: string, _level: ReasoningLevel): ReasoningLevel {
  return "low";
}

export function titleFromPrompt(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New thread";
  return cleaned.length > 42 ? `${cleaned.slice(0, 42).trimEnd()}…` : cleaned;
}

export function newId() {
  return crypto.randomUUID();
}
