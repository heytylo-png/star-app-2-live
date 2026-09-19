/**
 * Compact Star Rai memory slots for the grok-4-latest system prompt.
 * SoT: artifacts/star-rai-memory-slots.txt
 *
 * Only filled slots are serialized. Nothing is invented — extractors
 * require explicit user language (no default cameraman, no bio topics).
 */

import { namedPoseFromText, type PoseId } from "./rai.ts";

export type ChartSlots = {
  date?: string;
  time?: string;
  place?: string;
};

export type LifeSlots = {
  /** Session flag — life keys are omitted from the prompt unless this is true. */
  on: boolean;
  now_playing?: string;
  mood_tag?: string;
};

export type ChartSource = "setup" | "chat";

export type MemorySlotState = {
  name?: string;
  mood?: string;
  last_topic?: string;
  last_choice?: string;
  /** Only if the user explicitly stated a role. Never default. */
  role?: string;
  chart?: ChartSlots;
  life?: LifeSlots;
  /** Natal Chart v1 — birthday / derived sun. Never user_rising. */
  user_birth_date?: string;
  user_birth_time?: string;
  user_birth_place?: string;
  user_sun?: string;
  chart_source?: ChartSource;
};

export type AffectionSlotInput = {
  streakDays?: number;
  relationship?: string;
};

export type ExtractOpts = {
  /** Named pose command already resolved (false = kiss / unmapped). */
  lastChoice?: PoseId | "kiss" | string | false | null;
};

const NAME_STOP = new Set(
  "the person talking you user rai star idol she he they someone anyone cameraman director".split(
    " ",
  ),
);

/** Her lore bio — never seed these as conversation topics. */
export const HER_BIO_TOPIC_RE =
  /\b(fukuoka|osaka|libra|parents?|abroad)\b/i;

const MOOD_WORD =
  "tired|exhausted|sleepy|sad|down|happy|excited|anxious|stressed|lonely|ok|okay|fine|good|great|cozy|hype|mad|angry|soft|shy|hurt|sick|bored|chill";

const DATE_CONTEXT_RE =
  /\b(meet|meeting|date night|\ba date\b|see you|hang out|hangout|concert|show|lunch|dinner|coffee|schedule|come over|pick you up|call me at|let'?s go)\b/i;

const WEEKDAY_RE =
  /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const DATE_NUM_RE = /\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/i;

const MONTH_DATE_RE =
  /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\.|\b)\s+\d{1,2}(?:st|nd|rd|th)?)\b/i;

const TIME_RE = /\b((?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\d{1,2}:\d{2})\b/i;

const LIFE_STOP_RE =
  /\b(stop (?:listening|playing)|not playing(?: anymore)?|session over|end (?:the )?session|life session off)\b/i;

function clip(value: string, max: number): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd();
}

function cleanToken(value: string): string {
  return value.replace(/[.,!;:?~]+$/g, "").replace(/\s+/g, " ").trim();
}

export function emptySlots(): MemorySlotState {
  return {};
}

function compactChart(chart?: ChartSlots): ChartSlots | undefined {
  if (!chart) return undefined;
  const next: ChartSlots = {};
  if (chart.date?.trim()) next.date = clip(chart.date, 40);
  if (chart.time?.trim()) next.time = clip(chart.time, 24);
  if (chart.place?.trim()) next.place = clip(chart.place, 48);
  return next.date || next.time || next.place ? next : undefined;
}

function compactLife(life?: LifeSlots): LifeSlots | undefined {
  if (!life) return undefined;
  if (life.on === false) return undefined;
  const now_playing = life.now_playing?.trim() ? clip(life.now_playing, 48) : undefined;
  const mood_tag = life.mood_tag?.trim() ? clip(life.mood_tag, 24) : undefined;
  if (!life.on && !now_playing && !mood_tag) return undefined;
  if (!life.on) return undefined;
  return { on: true, now_playing, mood_tag };
}

/** Merge a patch into current slots without inventing empty keys. */
export function applySlotPatch(current: MemorySlotState, patch: MemorySlotState): MemorySlotState {
  const chart = compactChart({ ...current.chart, ...patch.chart });
  let life: LifeSlots | undefined;
  if (patch.life && patch.life.on === false) {
    life = undefined;
  } else {
    life = compactLife({
      on: patch.life?.on ?? current.life?.on ?? false,
      now_playing: patch.life?.now_playing ?? current.life?.now_playing,
      mood_tag: patch.life?.mood_tag ?? current.life?.mood_tag,
    });
  }

  const next: MemorySlotState = { ...current };
  if (patch.name !== undefined) next.name = patch.name.trim() || undefined;
  if (patch.mood !== undefined) next.mood = patch.mood.trim() || undefined;
  if (patch.last_topic !== undefined) next.last_topic = patch.last_topic.trim() || undefined;
  if (patch.last_choice !== undefined) next.last_choice = patch.last_choice.trim() || undefined;
  if (patch.role !== undefined) next.role = patch.role.trim() || undefined;
  if (patch.chart !== undefined) next.chart = chart;
  else next.chart = compactChart(current.chart);
  next.life = life;

  if (patch.user_birth_date !== undefined) {
    next.user_birth_date = patch.user_birth_date.trim() || undefined;
  }
  if (patch.user_birth_time !== undefined) {
    next.user_birth_time = patch.user_birth_time.trim() || undefined;
  }
  if (patch.user_birth_place !== undefined) {
    next.user_birth_place = patch.user_birth_place.trim() || undefined;
  }
  if (patch.user_sun !== undefined) {
    next.user_sun = patch.user_sun.trim() || undefined;
  }
  if (patch.chart_source !== undefined) {
    next.chart_source = patch.chart_source;
  }

  if (!next.name) delete next.name;
  if (!next.mood) delete next.mood;
  if (!next.last_topic) delete next.last_topic;
  if (!next.last_choice) delete next.last_choice;
  if (!next.role) delete next.role;
  if (!next.chart) delete next.chart;
  if (!next.life) delete next.life;
  if (!next.user_birth_date) delete next.user_birth_date;
  if (!next.user_birth_time) delete next.user_birth_time;
  if (!next.user_birth_place) delete next.user_birth_place;
  if (!next.user_sun) delete next.user_sun;
  if (!next.chart_source) delete next.chart_source;
  return next;
}

export function extractName(text: string): string | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  const m = cleaned.match(
    /(?:my name is|i(?:'m| am) called|call me|their name is|name is)\s+([A-Za-z][\w'-]{1,24})/i,
  );
  const raw = m?.[1];
  if (!raw) return undefined;
  const name = cleanToken(raw);
  if (!name || NAME_STOP.has(name.toLowerCase())) return undefined;
  if (/^(cameraman|director|photographer)$/i.test(name)) return undefined;
  return name;
}

export function extractRole(text: string): string | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  if (/\b(?:i(?:'m| am) not (?:your |the )?|don'?t (?:call me|make me)(?: your)?)\b/i.test(cleaned)) {
    return undefined;
  }
  const m = cleaned.match(
    /\b(?:my role is|i(?:'m| am) your|call me your|i(?:'m| am) the)\s+([A-Za-z][\w' -]{1,32})/i,
  );
  if (!m?.[1]) return undefined;
  const role = cleanToken(m[1].split(/[,.]/)[0] ?? "");
  if (!role) return undefined;
  const first = role.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (["one", "person", "type", "thing", "same", "only", "best", "kind"].includes(first)) {
    return undefined;
  }
  if (role.length > 40) return undefined;
  return clip(role, 40);
}

/** True when the user explicitly rejected a defaulted role. */
export function clearsRole(text: string): boolean {
  return /\b(?:i(?:'m| am) not (?:your |the )?(?:cameraman|director|photographer)|don'?t (?:call me|make me)(?: your)?(?: a)? ?(?:cameraman|director))\b/i.test(
    text,
  );
}

export function extractMood(text: string): string | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const m = cleaned.match(
    new RegExp(
      String.raw`\bi(?:'m| am| feel(?:ing)?)\s+(?:really |so |pretty |kinda |kind of |a bit |a little )?(${MOOD_WORD})\b`,
      "i",
    ),
  );
  if (m?.[1]) return m[1].toLowerCase();
  const alt = cleaned.match(/\bin a (\w+) mood\b/i);
  if (alt?.[1] && new RegExp(`^(${MOOD_WORD})$`, "i").test(alt[1])) {
    return alt[1].toLowerCase();
  }
  return undefined;
}

function isGreetingOnly(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!~.]+$/g, "");
  return /^(hi|hey|hello|yo|sup|good morning|good evening|just got here|i'?m here)$/i.test(t);
}

function compactTopic(text: string): string | undefined {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t || isGreetingOnly(t)) return undefined;
  const named = namedPoseFromText(t);
  if (named !== null && t.split(/\s+/).length <= 4) return undefined;
  t = t.replace(/^(please )?remember (that |this )?/i, "");
  t = clip(t, 72);
  if (!t) return undefined;
  // Never seed her lore bio as the topic from a short dump.
  if (HER_BIO_TOPIC_RE.test(t) && t.split(/\s+/).length <= 4) return undefined;
  return t;
}

function extractChart(text: string): ChartSlots | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!DATE_CONTEXT_RE.test(cleaned)) return undefined;
  const chart: ChartSlots = {};
  const weekday = cleaned.match(WEEKDAY_RE);
  const numbered = cleaned.match(DATE_NUM_RE);
  const month = cleaned.match(MONTH_DATE_RE);
  if (month?.[1]) chart.date = cleanToken(month[1]);
  else if (numbered?.[1]) chart.date = numbered[1];
  else if (weekday?.[1]) chart.date = weekday[1].toLowerCase();

  const time = cleaned.match(TIME_RE);
  if (time?.[1]) chart.time = cleanToken(time[1].replace(/^at\s+/i, ""));

  const place = cleaned.match(/\b(?:at|in|near)\s+([A-Z][\w'. -]{1,40}?)(?:[.!,]|$)/);
  if (place?.[1]) {
    const p = cleanToken(place[1]);
    if (p && !/^(the|a|an)$/i.test(p) && !WEEKDAY_RE.test(p)) chart.place = p;
  }
  return compactChart(chart);
}

function extractLife(text: string, current?: LifeSlots): LifeSlots | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (LIFE_STOP_RE.test(cleaned)) return { on: false };

  const playing = cleaned.match(
    /\b(?:now playing|i(?:'m| am) listening to|listening to)\s+(.+?)(?:[.!]|$)/i,
  );
  const watching = cleaned.match(/\b(?:i(?:'m| am) (?:watching|playing))\s+(.+?)(?:[.!]|$)/i);
  const raw = playing?.[1] ?? watching?.[1];
  let now_playing: string | undefined;
  if (raw) {
    const clipPlay = clip(cleanToken(raw), 48);
    if (clipPlay && !/^(along|with you|it|this|that)$/i.test(clipPlay)) {
      now_playing = clipPlay;
    }
  }

  const sessionOn = Boolean(current?.on) || Boolean(now_playing);
  let mood_tag: string | undefined;
  if (sessionOn) {
    const tag = cleaned.match(
      /\b(?:mood(?: tag)?|vibe)\s*(?:is|:)?\s*([A-Za-z][\w-]{1,20})/i,
    );
    if (tag?.[1]) mood_tag = tag[1].toLowerCase();
    else {
      const mood = extractMood(cleaned);
      if (mood && now_playing) mood_tag = mood;
    }
  }

  if (!sessionOn) return undefined;
  if (now_playing || mood_tag) {
    return compactLife({
      on: true,
      now_playing: now_playing ?? current?.now_playing,
      mood_tag: mood_tag ?? current?.mood_tag,
    });
  }
  return undefined;
}

export function extractSlotsFromUserText(
  text: string,
  opts: ExtractOpts = {},
  current: MemorySlotState = {},
): MemorySlotState {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return {};

  const patch: MemorySlotState = {};
  const name = extractName(cleaned);
  if (name) patch.name = name;

  const mood = extractMood(cleaned);
  if (mood) patch.mood = mood;

  if (clearsRole(cleaned)) patch.role = "";
  else {
    const role = extractRole(cleaned);
    if (role) patch.role = role;
  }

  const chart = extractChart(cleaned);
  if (chart) patch.chart = chart;

  const life = extractLife(cleaned, current.life);
  if (life) patch.life = life;

  let lastChoice: string | undefined;
  if (opts.lastChoice === false) lastChoice = "kiss";
  else if (typeof opts.lastChoice === "string" && opts.lastChoice.trim()) {
    lastChoice = opts.lastChoice.trim();
  } else {
    const named = namedPoseFromText(cleaned);
    if (named === false) lastChoice = "kiss";
    else if (named) lastChoice = named;
  }
  if (lastChoice) patch.last_choice = lastChoice;

  const topic = compactTopic(cleaned);
  if (topic) patch.last_topic = topic;

  return patch;
}

export type MemoryItemLike = { text: string };

/** Fill empty name/role from prior freeform facts — never invent. */
export function migrateItemsToSlots(
  items: MemoryItemLike[],
  slots: MemorySlotState,
): MemorySlotState {
  let next = { ...slots };
  if (!next.name) {
    for (const item of items) {
      const name = extractName(item.text);
      if (name) {
        next = applySlotPatch(next, { name });
        break;
      }
    }
  }
  if (!next.role) {
    for (const item of items) {
      const role = extractRole(item.text);
      if (role) {
        next = applySlotPatch(next, { role });
        break;
      }
    }
  }
  return next;
}

function line(key: string, value: string | undefined): string | null {
  const v = value?.replace(/\s+/g, " ").trim();
  if (!v) return null;
  return `${key}: ${v}`;
}

/**
 * Compact MEMORY FACTS block for the grok-4-latest system message.
 * Empty / unknown slots are omitted. No bio topic list.
 */
export function formatMemoryFacts(
  slots: MemorySlotState,
  affection: AffectionSlotInput = {},
): string {
  const lines: string[] = [];
  const push = (key: string, value: string | undefined) => {
    const row = line(key, value);
    if (row) lines.push(row);
  };

  push("name", slots.name);
  push("mood", slots.mood);
  push("last_topic", slots.last_topic);
  push("last_choice", slots.last_choice);

  const streak =
    typeof affection.streakDays === "number" && affection.streakDays >= 2
      ? `${affection.streakDays} days`
      : undefined;
  push("streak", streak);
  push("relationship", affection.relationship);

  push("role", slots.role);

  const chart = compactChart(slots.chart);
  if (chart) {
    push("date", chart.date);
    push("time", chart.time);
    push("place", chart.place);
  }

  push("user_birth_date", slots.user_birth_date);
  push("user_birth_time", slots.user_birth_time);
  push("user_birth_place", slots.user_birth_place);
  push("user_sun", slots.user_sun);
  push("chart_source", slots.chart_source);
  // user_rising is never sent in v1.

  const life = compactLife(slots.life);
  if (life?.on) {
    push("now_playing", life.now_playing);
    push("mood_tag", life.mood_tag);
  }

  if (!lines.length) return "";
  return `MEMORY FACTS\n${lines.join("\n")}`;
}

/** Voice card first; filled slots only after it. */
export function composeGrokSystem(voiceCard: string, factsBlock?: string | null): string {
  const extra = factsBlock?.trim();
  if (!extra) return voiceCard;
  return `${voiceCard}\n\n${extra}`;
}
