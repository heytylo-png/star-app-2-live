import { RAI_SYSTEM } from "@/lib/rai";

export const DEFAULT_MODEL = "grok-4.6";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  model?: string;
  error?: string;
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
    id: "grok-4.6",
    name: "Grok 4.6",
    blurb: "Flagship — code, reasoning, chat",
    badge: "Default",
  },
  {
    id: "grok-4.5",
    name: "Grok 4.5",
    blurb: "Previous flagship",
  },
  {
    id: "grok-4.3",
    name: "Grok 4.3",
    blurb: "Fast generalist",
  },
  {
    id: "grok-build-0.1",
    name: "Grok Build",
    blurb: "Code and build work",
    badge: "Code",
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
  {
    id: "direct",
    name: "Direct",
    blurb: "Fewest words that stay accurate",
    system:
      "You are Grok. Answer in the fewest words that remain accurate. No preamble, no recap, no cheerleading. If a list is needed, keep it tight.",
  },
  {
    id: "creative",
    name: "Literary",
    blurb: "Texture without purple prose",
    system:
      "You are Grok. Write with texture and useful metaphor, still strictly truthful. Avoid purple prose, exclamation, and emoji. Keep paragraphs short.",
  },
  {
    id: "technical",
    name: "Technical",
    blurb: "Engineer-first, tradeoffs named",
    system:
      "You are Grok. Optimize for engineers. Show code when useful, name tradeoffs, skip pep talk. Prefer precise terms over marketing language.",
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
    .replace(/^grok-/, "Grok ")
    .replace(/-0309/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

export function supportsReasoningEffort(model: string) {
  if (
    !model ||
    model.includes("non-reasoning") ||
    model.includes("imagine") ||
    model.startsWith("grok-build")
  ) {
    return false;
  }
  return (
    model.startsWith("grok-4.3") ||
    model.startsWith("grok-4.5") ||
    model.startsWith("grok-4.6") ||
    model.startsWith("grok-4.20")
  );
}

export function supportsXHighReasoning(model: string) {
  return /^grok-4\.[6-9]/.test(model) || /^grok-[5-9]/.test(model);
}

export function clampReasoning(model: string, level: ReasoningLevel): ReasoningLevel {
  if (!supportsReasoningEffort(model)) return "low";
  if (level === "xhigh" && !supportsXHighReasoning(model)) return "high";
  return level;
}

export function titleFromPrompt(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New thread";
  return cleaned.length > 42 ? `${cleaned.slice(0, 42).trimEnd()}…` : cleaned;
}

export function newId() {
  return crypto.randomUUID();
}
