/**
 * Chart v1 — sun + date only. SoT: artifacts/star-chart-v1.txt
 *
 * Once-per-local-day uses the browser IANA timezone
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`), falling back to
 * America/Chicago when that is empty or throws.
 *
 * HER_* constants stay in code / the CHART request block. They are never
 * written into MEMORY FACTS or dumped as a spoken topic list.
 */

import type { EmotionId, PoseId } from "./rai.ts";
import { namedPoseFromText } from "./rai.ts";
import type { MemorySlotState } from "./memory-slots.ts";

/** In-code only. Never serialize into MEMORY FACTS. */
export const HER_CHART = {
  birth_date: "2000-09-29",
  birth_time: "03:33",
  birth_place: "Fukuoka",
  her_sun: "Libra",
} as const;

export const CHART_TZ_FALLBACK = "America/Chicago";

export const CHART_TINT_POSES = [
  "content",
  "think",
  "smug",
  "tired",
  "talk",
  "idle",
] as const satisfies readonly PoseId[];

export type ChartTintPose = (typeof CHART_TINT_POSES)[number];

export type ChartSource = "setup" | "chat";

export type ChartTurnKind =
  | "none"
  | "ask_sign"
  | "ask_birthday"
  | "ask_origin"
  | "ask_need_birthday"
  | "diary"
  | "daily";

export type ChartTurn = {
  kind: ChartTurnKind;
  /** True when this turn should skip Grok and speak from the local brain. */
  localOnly: boolean;
  dateKey?: string;
  diaryText?: string;
  tintPose?: ChartTintPose;
  factsBlock?: string;
  userSun?: string;
  lastTopic?: string;
};

export type ResolveChartTurnInput = {
  userText: string;
  /** Chat completion is in flight (user sent from Chat). Never a page-load timer. */
  chatOpen: boolean;
  userSun?: string;
  lastTopic?: string;
  mood?: string;
  alreadyFiredDate?: string | null;
  askedBirthday?: boolean;
  existingDiary?: string | null;
  now?: Date;
  timeZone?: string;
};

const SIGNS = [
  "Capricorn",
  "Aquarius",
  "Pisces",
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
] as const;

export type SunSign = (typeof SIGNS)[number];

const SIGN_SET = new Set<string>(SIGNS.map((s) => s.toLowerCase()));

/** Inclusive [startMd, endMd] with wrap for Capricorn. md = month * 100 + day. */
const SUN_RANGES: { sign: SunSign; start: number; end: number }[] = [
  { sign: "Capricorn", start: 1222, end: 119 },
  { sign: "Aquarius", start: 120, end: 218 },
  { sign: "Pisces", start: 219, end: 320 },
  { sign: "Aries", start: 321, end: 419 },
  { sign: "Taurus", start: 420, end: 520 },
  { sign: "Gemini", start: 521, end: 620 },
  { sign: "Cancer", start: 621, end: 722 },
  { sign: "Leo", start: 723, end: 822 },
  { sign: "Virgo", start: 823, end: 922 },
  { sign: "Libra", start: 923, end: 1022 },
  { sign: "Scorpio", start: 1023, end: 1121 },
  { sign: "Sagittarius", start: 1122, end: 1221 },
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DAY_MOOD_RE =
  /\b(today|tonight|this morning|this afternoon|this evening|mood|feeling|feel(?:ing)?|tired|exhausted|sleepy|rough day|good day|bad day|long day|how(?:'s| is) (?:your |the )?day)\b/i;

const PLANET_RE =
  /\b(mercury|venus|mars|jupiter|saturn|uranus|neptune|pluto|ascendant|rising|houses?|transit|conjunction)\b/i;

const READING_BAN_RE = /your reading for today is/i;

const HER_SIGN_RE =
  /\b(?:what(?:'s| is) your (?:sun )?sign|your (?:sun )?sign|your zodiac|are you an? libra|what sign are you)\b/i;

const HER_BIRTHDAY_RE =
  /\b(?:when(?:'s| is) your birthday|your birthday|when were you born|what(?:'s| is) your birthday)\b/i;

const HER_ORIGIN_RE =
  /\b(?:where are you from|where were you born|what(?:'s| is) your hometown|your hometown|which city are you from)\b/i;

const DIARY_RE =
  /\b(?:write (?:me |your |a |today'?s )?diary|show (?:me )?(?:your |the |today'?s )?diary|open (?:your |the )?diary|diary entry|today'?s diary|(?:your |the )?journal entry)\b/i;

const ASKED_CHART_RE =
  /\b(?:horoscope|sun sign|star sign|zodiac|compatibility|natal|birth chart|(?:today'?s|todays) (?:reading|stars|vibe)|reading for today|stars today|our signs|match(?:es)? (?:with you|our signs)|what(?:'s| is) my (?:sun )?sign|what sign am i)\b/i;

const NEED_BIRTHDAY_RE =
  /\b(?:match|compatible|compatibility|horoscope|today'?s reading|reading for today|what(?:'s| is) my (?:sun )?sign|what sign am i|our signs)\b/i;

const SIGN_TEASES = [
  "Don't make it a topic.",
  "Air. You're welcome.",
  "That's the glance.",
];

function clip(value: string, max: number): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd();
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function chartTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.trim()) return tz.trim();
  } catch {
    /* ignore */
  }
  return CHART_TZ_FALLBACK;
}

/** Local calendar date as YYYY-MM-DD in the Chart timezone. */
export function localDateKey(now: Date = new Date(), timeZone: string = chartTimeZone()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function mdFromParts(month: number, day: number): number {
  return month * 100 + day;
}

export function sunFromMonthDay(month: number, day: number): SunSign | undefined {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const md = mdFromParts(month, day);
  for (const row of SUN_RANGES) {
    if (row.start > row.end) {
      if (md >= row.start || md <= row.end) return row.sign;
    } else if (md >= row.start && md <= row.end) {
      return row.sign;
    }
  }
  return undefined;
}

/** Accepts YYYY-MM-DD, MM-DD, or MM/DD(/YYYY). Year ignored. */
export function sunFromBirthDate(raw: string | undefined | null): SunSign | undefined {
  const parsed = parseMonthDay(raw);
  if (!parsed) return undefined;
  return sunFromMonthDay(parsed.month, parsed.day);
}

export function parseMonthDay(
  raw: string | undefined | null,
): { month: number; day: number } | undefined {
  if (!raw) return undefined;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return undefined;

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { month: Number(iso[2]), day: Number(iso[3]) };

  const md = t.match(/^(\d{1,2})-(\d{1,2})$/);
  if (md) return { month: Number(md[1]), day: Number(md[2]) };

  const slash = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
  if (slash) return { month: Number(slash[1]), day: Number(slash[2]) };

  const named = t.match(
    /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.]?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[, ]+\d{2,4})?$/i,
  );
  if (named) {
    const month = MONTHS[named[1]!.toLowerCase()];
    if (month) return { month, day: Number(named[2]) };
  }
  return undefined;
}

export function normalizeBirthDate(raw: string): string | undefined {
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = parseMonthDay(raw);
  if (!parsed) return undefined;
  const mm = String(parsed.month).padStart(2, "0");
  const dd = String(parsed.day).padStart(2, "0");
  const year = raw.trim().match(/(\d{4})/);
  if (year && raw.trim().match(/^\d{4}-/)) return raw.trim();
  if (year && !raw.trim().match(/^\d{1,2}[-/]/)) {
    /* year at end of "March 5, 1994" */
    return `${year[1]}-${mm}-${dd}`;
  }
  const trailingYear = raw.trim().match(/[, ]+(\d{4})$/);
  if (trailingYear) return `${trailingYear[1]}-${mm}-${dd}`;
  const slashYear = raw.trim().match(/^\d{1,2}\/\d{1,2}\/(\d{4})$/);
  if (slashYear) return `${slashYear[1]}-${mm}-${dd}`;
  return `${mm}-${dd}`;
}

export function natalFromSetup(fields: {
  date: string;
  time?: string;
  place?: string;
}): MemorySlotState {
  const user_birth_date = normalizeBirthDate(fields.date);
  if (!user_birth_date) return {};
  const user_sun = sunFromBirthDate(user_birth_date);
  const next: MemorySlotState = {
    user_birth_date,
    chart_source: "setup",
  };
  if (user_sun) next.user_sun = user_sun;
  const time = fields.time?.trim();
  if (time) next.user_birth_time = clip(time, 24);
  const place = fields.place?.trim();
  if (place) next.user_birth_place = clip(place, 48);
  return next;
}

function statedSign(text: string): SunSign | undefined {
  const m = text.match(
    /\b(?:i(?:'m| am) an?\s+|my sun(?: sign)? is\s+|my (?:star )?sign is\s+)(capricorn|aquarius|pisces|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius)\b/i,
  );
  const raw = m?.[1]?.toLowerCase();
  if (!raw || !SIGN_SET.has(raw)) return undefined;
  return SIGNS.find((s) => s.toLowerCase() === raw);
}

/** Fill natal slots from explicit birthday / sun language. Never invent. Never rising. */
export function extractNatalFromUserText(
  text: string,
  current: MemorySlotState = {},
): MemorySlotState {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return {};
  const patch: MemorySlotState = {};

  const born = cleaned.match(
    /\b(?:my birthday is|i was born (?:on|in)|born on|birthday(?:'s| is))\s+(.+?)(?:[.!,]|$)/i,
  );
  if (born?.[1]) {
    const date = normalizeBirthDate(born[1]);
    if (date) {
      patch.user_birth_date = date;
      const sun = sunFromBirthDate(date);
      if (sun) patch.user_sun = sun;
      if (!current.chart_source) patch.chart_source = "chat";
    }
  }

  if (!patch.user_sun && !current.user_birth_date && !current.user_sun) {
    const sign = statedSign(cleaned);
    if (sign) {
      patch.user_sun = sign;
      if (!current.chart_source) patch.chart_source = "chat";
    }
  }

  return patch;
}

export function isDayOrMoodTopic(lastTopic?: string, mood?: string): boolean {
  if (mood?.trim()) return true;
  if (!lastTopic?.trim()) return false;
  return DAY_MOOD_RE.test(lastTopic);
}

export function isChartBannedLine(line: string): boolean {
  return READING_BAN_RE.test(line) || PLANET_RE.test(line);
}

export function pickChartTintPose(dateKey: string): ChartTintPose {
  const i = hashString(dateKey) % CHART_TINT_POSES.length;
  return CHART_TINT_POSES[i]!;
}

export function pickOriginCity(dateKey: string): "Fukuoka" | "Osaka" {
  return hashString(dateKey) % 2 === 0 ? "Fukuoka" : "Osaka";
}

export function pickSignTease(dateKey: string): string {
  return SIGN_TEASES[hashString(dateKey) % SIGN_TEASES.length]!;
}

/**
 * Compact CHART block appended after MEMORY FACTS on grok-4-latest when Chart fires.
 * her_sun lives here — not in standing MEMORY FACTS.
 */
export function formatChartFactsBlock(opts: {
  todayDate: string;
  userSun?: string;
  lastTopic?: string;
}): string {
  const lines = ["CHART", `today_date: ${opts.todayDate}`, `her_sun: ${HER_CHART.her_sun}`];
  if (opts.userSun?.trim()) lines.push(`user_sun: ${opts.userSun.trim()}`);
  if (opts.lastTopic?.trim()) lines.push(`last_topic: ${clip(opts.lastTopic, 72)}`);
  lines.push("");
  lines.push('Tint one line only. Never say "your reading for today is." Never list planets.');
  if (opts.userSun?.trim()) {
    lines.push("At most one you+me glance. Not a compatibility essay.");
  }
  lines.push("Prefer pose content|think|smug|tired|talk|idle. Never kiss.");
  return lines.join("\n");
}

export function detectChartIntent(userText: string): ChartTurnKind {
  const t = userText.replace(/\s+/g, " ").trim();
  if (!t) return "none";
  if (DIARY_RE.test(t)) return "diary";
  if (HER_SIGN_RE.test(t)) return "ask_sign";
  if (HER_BIRTHDAY_RE.test(t)) return "ask_birthday";
  if (HER_ORIGIN_RE.test(t)) return "ask_origin";
  if (NEED_BIRTHDAY_RE.test(t)) return "ask_need_birthday";
  if (ASKED_CHART_RE.test(t)) return "daily";
  return "none";
}

function isBarePoseCommand(text: string): boolean {
  const named = namedPoseFromText(text);
  if (named === null) return false;
  const tokens = text.trim().toLowerCase().replace(/[.!~]+$/g, "").split(/\s+/);
  return tokens.length <= 3 && !DAY_MOOD_RE.test(text) && !/\bi(?:'m| am| feel)\b/i.test(text);
}

function primarilyShort(text: string): boolean {
  return text.replace(/\s+/g, " ").trim().length <= 140;
}

export function composeDiaryEntry(opts: {
  todayDate: string;
  lastTopic?: string;
  userSun?: string;
  mood?: string;
}): string {
  const sentences: string[] = [`Quiet page for ${opts.todayDate}.`];
  if (opts.mood?.trim()) {
    sentences.push(`They sounded ${clip(opts.mood, 24)}.`);
  }
  if (opts.lastTopic?.trim()) {
    sentences.push(`Last beat: ${clip(opts.lastTopic, 48)}.`);
  }
  if (opts.userSun?.trim()) {
    sentences.push(`${opts.userSun} next to Libra air — one glance.`);
  } else {
    sentences.push("No birthday on file.");
  }
  sentences.push("Still here. Not a report.");
  const kept = sentences.slice(0, 5);
  while (kept.length < 3) kept.push("Short day.");
  return kept.join(" ");
}

function localDailyLine(userSun?: string, lastTopic?: string): string {
  if (userSun?.trim()) {
    const topic = lastTopic?.trim() ? clip(lastTopic, 40) : "what they said";
    return `${userSun} across Libra air — one glance, then ${topic}.`;
  }
  return "Day's got a tilt. Not a reading.";
}

export type ChartAct = {
  emotion: EmotionId;
  pose?: PoseId;
  line: string;
};

export function actForChartTurn(turn: ChartTurn): ChartAct | null {
  const dateKey = turn.dateKey ?? "";
  switch (turn.kind) {
    case "ask_sign":
      return {
        emotion: "smug",
        pose: "smug",
        line: `Libra. ${pickSignTease(dateKey)}`,
      };
    case "ask_birthday":
      return { emotion: "bratty", pose: "idle", line: "Sept 29." };
    case "ask_origin":
      return {
        emotion: "bratty",
        pose: "talk",
        line: `${pickOriginCity(dateKey)}. That's the city.`,
      };
    case "ask_need_birthday":
      return {
        emotion: "glance",
        pose: "think",
        line: "Tell me your birthday if you want that.",
      };
    case "diary":
      return {
        emotion: "soft",
        pose: "content",
        line: turn.diaryText ?? "Quiet page. Ask again if you want it written.",
      };
    case "daily":
      return {
        emotion: turn.userSun ? "smug" : "tired",
        pose: turn.tintPose ?? pickChartTintPose(dateKey),
        line: localDailyLine(turn.userSun, turn.lastTopic),
      };
    default:
      return null;
  }
}

export function resolveChartTurn(input: ResolveChartTurnInput): ChartTurn {
  const now = input.now ?? new Date();
  const tz = input.timeZone ?? chartTimeZone();
  const today = localDateKey(now, tz);
  const text = input.userText.replace(/\s+/g, " ").trim();
  const rawIntent = detectChartIntent(text);
  const short = primarilyShort(text);

  if (rawIntent === "diary") {
    const diaryText = input.existingDiary?.trim() || composeDiaryEntry({
      todayDate: today,
      lastTopic: input.lastTopic,
      userSun: input.userSun,
      mood: input.mood,
    });
    return { kind: "diary", localOnly: true, dateKey: today, diaryText };
  }

  if (short && rawIntent === "ask_sign") {
    return { kind: "ask_sign", localOnly: true, dateKey: today };
  }
  if (short && rawIntent === "ask_birthday") {
    return { kind: "ask_birthday", localOnly: true, dateKey: today };
  }
  if (short && rawIntent === "ask_origin") {
    return { kind: "ask_origin", localOnly: true, dateKey: today };
  }

  const askedChart = rawIntent === "ask_need_birthday" || rawIntent === "daily" || ASKED_CHART_RE.test(text);
  const needsDate = !input.userSun?.trim() && (rawIntent === "ask_need_birthday" || NEED_BIRTHDAY_RE.test(text));

  if (needsDate) {
    if (input.askedBirthday) {
      return { kind: "none", localOnly: false };
    }
    if (short || rawIntent === "ask_need_birthday") {
      return { kind: "ask_need_birthday", localOnly: true, dateKey: today };
    }
  }

  const fireBecauseAsked = askedChart && !needsDate;

  if (!fireBecauseAsked && isBarePoseCommand(text)) {
    return { kind: "none", localOnly: false, dateKey: today };
  }

  const already = input.alreadyFiredDate === today;
  if (already && !fireBecauseAsked) {
    return { kind: "none", localOnly: false };
  }

  if (!input.chatOpen && !fireBecauseAsked) {
    return { kind: "none", localOnly: false };
  }

  const mayDaily =
    fireBecauseAsked ||
    Boolean(input.userSun?.trim()) ||
    isDayOrMoodTopic(input.lastTopic, input.mood);

  if (!mayDaily) {
    return { kind: "none", localOnly: false };
  }

  if (!fireBecauseAsked && !input.chatOpen) {
    return { kind: "none", localOnly: false };
  }

  if (!fireBecauseAsked && already) {
    return { kind: "none", localOnly: false };
  }

  const tintPose = pickChartTintPose(today);
  return {
    kind: "daily",
    localOnly: false,
    dateKey: today,
    tintPose,
    userSun: input.userSun,
    lastTopic: input.lastTopic,
    factsBlock: formatChartFactsBlock({
      todayDate: today,
      userSun: input.userSun,
      lastTopic: input.lastTopic,
    }),
  };
}
