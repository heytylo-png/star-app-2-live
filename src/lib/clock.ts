/**
 * Clock / NOW — compact device-local fact for grok-4-latest.
 * SoT: artifacts/star-rai-clock.txt
 *
 * Time is a fact, not a topic. She is States-side with the user unless
 * they set another zone. Do not invent Fukuoka / Japan local as her "where I am."
 */

import type { EmotionId, PoseId } from "./rai.ts";

export const CLOCK_TZ_FALLBACK = "America/Chicago";

export const CLOCK_BANDS = ["night", "morning", "afternoon", "evening"] as const;
export type ClockBand = (typeof CLOCK_BANDS)[number];

export type ClockNow = {
  weekday: string;
  /** Local hour 0–23 in `timeZone`. */
  hour: number;
  /** Local minute 0–59 in `timeZone`. */
  minute: number;
  /** ISO-8601 local wall time with numeric offset, computed at call time. */
  localNow: string;
  timeZone: string;
  tzLabel: string;
  band: ClockBand;
};

export type ClockTurnKind = "none" | "ask_time";

export type ClockTurn = {
  kind: ClockTurnKind;
  localOnly: boolean;
  factsBlock: string;
  now: ClockNow;
};

export type ClockAct = {
  emotion: EmotionId;
  pose?: PoseId;
  line: string;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const US_ZONE_ALIASES: Record<string, string> = {
  eastern: "America/New_York",
  et: "America/New_York",
  est: "America/New_York",
  edt: "America/New_York",
  central: "America/Chicago",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  mountain: "America/Denver",
  mt: "America/Denver",
  mst: "America/Denver",
  mdt: "America/Denver",
  pacific: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  alaska: "America/Anchorage",
  hawaii: "Pacific/Honolulu",
  hst: "Pacific/Honolulu",
  utc: "UTC",
  gmt: "UTC",
};

export function isUsableTimeZone(tz: string | null | undefined): boolean {
  const value = tz?.trim();
  if (!value) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Device IANA zone, optional explicit override, else America/Chicago. Never invent Fukuoka. */
export function clockTimeZone(override?: string | null): string {
  if (override && isUsableTimeZone(override)) return override.trim();
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isUsableTimeZone(tz)) return tz.trim();
  } catch {
    /* ignore */
  }
  return CLOCK_TZ_FALLBACK;
}

export function hourBand(hour: number): ClockBand {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h <= 5) return "night";
  if (h <= 11) return "morning";
  if (h <= 17) return "afternoon";
  return "evening";
}

function part(
  now: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  type: Intl.DateTimeFormatPartTypes,
): string {
  const row = new Intl.DateTimeFormat("en-US", { timeZone, ...options })
    .formatToParts(now)
    .find((p) => p.type === type);
  return row?.value ?? "";
}

function localHour(now: Date, timeZone: string): number {
  const raw = part(now, timeZone, { hour: "numeric", hourCycle: "h23" }, "hour");
  let hour = Number.parseInt(raw, 10);
  if (!Number.isFinite(hour)) {
    const fallback = Number.parseInt(
      part(now, timeZone, { hour: "2-digit", hour12: false }, "hour"),
      10,
    );
    hour = Number.isFinite(fallback) ? fallback : 0;
  }
  if (hour === 24) hour = 0;
  return ((hour % 24) + 24) % 24;
}

function localField(now: Date, timeZone: string, field: "minute" | "second" | "year" | "month" | "day"): number {
  const options: Intl.DateTimeFormatOptions =
    field === "year"
      ? { year: "numeric" }
      : field === "month" || field === "day"
        ? { [field]: "2-digit" }
        : { [field]: "2-digit" };
  const raw = part(now, timeZone, options, field);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

function pad2(n: number): string {
  return String(Math.trunc(Math.abs(n))).padStart(2, "0");
}

/** Wall-clock ISO with the zone's numeric offset (`2026-09-23T08:00:00-05:00`). */
export function formatLocalNowIso(now: Date, timeZone: string): string {
  const year = localField(now, timeZone, "year");
  const month = localField(now, timeZone, "month");
  const day = localField(now, timeZone, "day");
  const hour = localHour(now, timeZone);
  const minute = ((localField(now, timeZone, "minute") % 60) + 60) % 60;
  const second = ((localField(now, timeZone, "second") % 60) + 60) % 60;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const diffMin = Math.round((asUtc - now.getTime()) / 60000);
  const sign = diffMin >= 0 ? "+" : "-";
  const abs = Math.abs(Number.isFinite(diffMin) ? diffMin : 0);
  const offset = `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${offset}`;
}

export function readLocalNow(now: Date = new Date(), timeZone: string = clockTimeZone()): ClockNow {
  const tz = isUsableTimeZone(timeZone) ? timeZone.trim() : CLOCK_TZ_FALLBACK;
  const hour = localHour(now, tz);
  const minute = ((localField(now, tz, "minute") % 60) + 60) % 60;
  const weekdayRaw = part(now, tz, { weekday: "long" }, "weekday");
  const weekday = WEEKDAYS.find((d) => d.toLowerCase() === weekdayRaw.toLowerCase()) ?? weekdayRaw;
  const tzLabel =
    part(now, tz, { hour: "numeric", timeZoneName: "short" }, "timeZoneName") || tz;
  return {
    weekday: weekday || "Saturday",
    hour,
    minute,
    localNow: formatLocalNowIso(now, tz),
    timeZone: tz,
    tzLabel,
    band: hourBand(hour),
  };
}

/** 12-hour spoken hour for the ask path — "1 AM", "12 PM". */
export function spokenClockHour(hour: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

/** 12-hour face with minutes — "8:00", "1:20", "12:05". */
export function spokenClockFace(hour: number, minute: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const m = ((Math.trunc(minute) % 60) + 60) % 60;
  const h12 = h % 12 || 12;
  return `${h12}:${pad2(m)}`;
}

/** One short handback after the hour. Not a time monologue. */
export function clockHandback(hour: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h <= 5 || h >= 22) return "You're up late.";
  if (h < 9) return "You're up early.";
  if (h <= 11) return "Morning.";
  return "You're here.";
}

/** Deterministic ask-path line. The hour is the device hour. */
export function spokenClockLine(now: ClockNow): string {
  return `It's ${spokenClockFace(now.hour, now.minute)} here. ${clockHandback(now.hour)}`;
}

/**
 * Compact CLOCK block for every grok-4-latest system message.
 * Standing fact — not a speech topic dump. Fresh at call time.
 */
export function formatClockFactsBlock(now: ClockNow): string {
  return [
    "CLOCK",
    `weekday: ${now.weekday}`,
    `hour: ${now.hour}`,
    `minute: ${now.minute}`,
    `local_now: ${now.localNow}`,
    `tz: ${now.timeZone}`,
    `tz_label: ${now.tzLabel}`,
    `band: ${now.band}`,
    "with_user: true",
    `spoken_time: ${spokenClockFace(now.hour, now.minute)}`,
    "",
    "Fact only — not a topic. She is in this zone with the user. Do not invent Fukuoka / Japan local.",
    "Do not open with the time. Do not greet with the hour. Time is not her personality.",
    "A tired pose is not a clock. Do not talk night or late just because the pose or emotion is tired.",
    "Only mention Japan time if they asked about Japan.",
    `"What time is it where you are?" / "what time is it" / "what time is it there" / "is it late there" → spoken_time, one beat, then hand it back.`,
    `Stock "mornings drag" / "late nights thinking about you" only if band matches (morning / night) or they brought up sleep.`,
    `Banned out of band: "mornings drag", "late nights", "late night", "just woke up", "up thinking about you", "can't sleep", "staying up".`,
    `Late-night / can't sleep / staying up only in night (0–5) or late evening (22–23). "just woke up" / "mornings drag" only in morning (6–11). Unless they brought up sleep, tired, or bed.`,
  ].join("\n");
}

const CLOCK_ASK_RE =
  /\b(?:what(?:'?s| is) the time(?: there)?|what time is it(?: there)?|time (?:is it )?where you are|is it late (?:there|where you are|for you))\b/i;

/** Japan / city time is their question, not the device-clock ask. */
const JAPAN_ASK_RE = /\b(?:japan|japanese|tokyo|osaka|fukuoka|jst)\b/i;

const MEETUP_TIME_RE = /\b(meet|meeting|schedule|lunch|dinner|call me at|see you at)\b/i;

/** True for "what time is it (where you are / there)?" — not meetup scheduling or a Japan ask. */
export function isClockAsk(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (!CLOCK_ASK_RE.test(t)) return false;
  if (JAPAN_ASK_RE.test(t)) return false;
  if (MEETUP_TIME_RE.test(t) && !/\bwhat time is it\b/i.test(t) && !/\bwhere you are\b/i.test(t)) {
    return false;
  }
  return true;
}

export function resolveClockTurn(input: {
  userText?: string;
  now?: Date;
  timeZone?: string | null;
}): ClockTurn {
  const now = readLocalNow(input.now ?? new Date(), clockTimeZone(input.timeZone));
  const factsBlock = formatClockFactsBlock(now);
  if (isClockAsk(input.userText ?? "")) {
    return { kind: "ask_time", localOnly: true, factsBlock, now };
  }
  return { kind: "none", localOnly: false, factsBlock, now };
}

export function actForClockTurn(turn: ClockTurn): ClockAct | null {
  if (turn.kind !== "ask_time") return null;
  return {
    emotion: "bratty",
    pose: "talk",
    line: spokenClockLine(turn.now),
  };
}

/**
 * Stock bits that talk night / sleep / waking.
 * Night bits are allowed only at 0–5 or 22–23.
 * Morning bits are allowed only at 6–11.
 * Either side is also allowed when the user brought up sleep, tired, or bed.
 * A tired pose or emotion is not that mention.
 */
export const CLOCK_BANNED_NIGHT = [
  "late nights",
  "late night",
  "late-night",
  "up thinking about you",
  "can't sleep",
  "cant sleep",
  "cannot sleep",
  "couldn't sleep",
  "couldnt sleep",
  "staying up",
  "stay up",
  "stayed up",
  "up all night",
] as const;

export const CLOCK_BANNED_MORNING = [
  "mornings drag",
  "morning drags",
  "mornings dragging",
  "just woke up",
  "just woken up",
] as const;

export const CLOCK_BANNED_PHRASES = [...CLOCK_BANNED_NIGHT, ...CLOCK_BANNED_MORNING] as const;

export const CLOCK_NEUTRAL_LINE = "Mm. I'm here.";

const USER_SLEEP_RE =
  /\b(?:sleep(?:y|ing|less)?|tired|bed|insomnia|woke|woken|exhausted|nap)\b/i;

function phrasePattern(phrases: readonly string[]): RegExp {
  const body = [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((phrase) =>
      phrase
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/'/g, "['’]")
        .replace(/\\-/g, "[\\s-]")
        .replace(/\s+/g, "\\s+"),
    )
    .join("|");
  return new RegExp(`(?:${body})`, "i");
}

const NIGHT_BIT_RE = phrasePattern(CLOCK_BANNED_NIGHT);
const MORNING_BIT_RE = phrasePattern(CLOCK_BANNED_MORNING);

/** Place + clock language. Bare "Fukuoka." is not a time claim. */
const JAPAN_TIME_RE =
  /\bJST\b|\b(?:Fukuoka|Osaka|Tokyo|Japan)\b[^.!?]{0,48}\b(?:time|hour|o'?clock|a\.?m\.?|p\.?m\.?|\d{1,2}:\d{2})\b|\b(?:time|hour|o'?clock|\d{1,2}:\d{2}|a\.?m\.?|p\.?m\.?)\b[^.!?]{0,48}\b(?:Fukuoka|Osaka|Tokyo|Japan|JST)\b/i;

const UNPROMPTED_CLOCK_RE =
  /^it'?s\s+\d{1,2}(?::\d{2})?(?:\s*(?:a\.?m\.?|p\.?m\.?))?\s+here\b/i;

export function userBroughtUpSleep(text: string): boolean {
  return USER_SLEEP_RE.test(text);
}

export function userAskedAboutJapan(text: string): boolean {
  return JAPAN_ASK_RE.test(text);
}

export function nightBitAllowed(hour: number, recentText: string): boolean {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h <= 5 || h >= 22) return true;
  return userBroughtUpSleep(recentText);
}

export function morningBitAllowed(hour: number, recentText: string): boolean {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h >= 6 && h <= 11) return true;
  return userBroughtUpSleep(recentText);
}

export function lineCarriesHour(line: string, hour: number): boolean {
  const h24 = ((Math.trunc(hour) % 24) + 24) % 24;
  const h12 = h24 % 12 || 12;
  if (new RegExp(`\\b0?${h12}:\\d{2}\\b`).test(line)) return true;
  const ap = h24 < 12 ? "a\\.?m\\.?" : "p\\.?m\\.?";
  return new RegExp(`\\b${h12}\\s*${ap}\\b`, "i").test(line);
}

function splitClauses(line: string): string[] {
  return line
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Post-filter for a spoken line.
 * Out-of-band stock bits lose that clause; an empty remainder falls back
 * to a neutral line. A time ask that misses the real hour, or that places
 * her in Japan without being asked, is replaced with the device clock line.
 */
export function filterClockSpokenLine(
  line: string,
  opts: { now: ClockNow; recentText?: string; askedTime?: boolean },
): string {
  const raw = line.replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const recent = opts.recentText ?? "";
  const asked = Boolean(opts.askedTime);
  const japanAsked = userAskedAboutJapan(recent);
  const exact = spokenClockLine(opts.now);

  if (asked && !japanAsked && (JAPAN_TIME_RE.test(raw) || !lineCarriesHour(raw, opts.now.hour))) {
    return exact;
  }

  const allowNight = nightBitAllowed(opts.now.hour, recent);
  const allowMorning = morningBitAllowed(opts.now.hour, recent);
  const kept = splitClauses(raw).filter((clause) => {
    if (!allowNight && NIGHT_BIT_RE.test(clause)) return false;
    if (!allowMorning && MORNING_BIT_RE.test(clause)) return false;
    if (!japanAsked && JAPAN_TIME_RE.test(clause)) return false;
    if (!asked && UNPROMPTED_CLOCK_RE.test(clause)) return false;
    return true;
  });

  if (!kept.length) return asked ? exact : CLOCK_NEUTRAL_LINE;
  const next = kept.join(" ");
  if (asked && !japanAsked && !lineCarriesHour(next, opts.now.hour)) return exact;
  return next;
}

/**
 * Explicit zone only ("my timezone is …" / "I'm on Pacific time").
 * Never invent from a city, Fukuoka lore, or "I live in …".
 */
export function extractTimezone(text: string): string | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;

  const iana = cleaned.match(
    /\b(?:my |our )?(?:time\s*zone|timezone) is\s+([A-Za-z_]+\/[A-Za-z0-9_+-]+)\b/i,
  );
  const ianaSet = cleaned.match(
    /\b(?:set|use) (?:my |our |the )?(?:time\s*zone|timezone) to\s+([A-Za-z_]+\/[A-Za-z0-9_+-]+)\b/i,
  );
  const rawIana = (iana?.[1] || ianaSet?.[1] || "").replace(/-/g, "_");
  if (rawIana && isUsableTimeZone(rawIana)) return rawIana;

  const onZone = cleaned.match(
    /\bi(?:'m| am) on ([A-Za-z]+(?:\s+[A-Za-z]+)?) time\b/i,
  );
  const aliasKey = onZone?.[1]?.toLowerCase().replace(/\s+/g, " ").trim();
  if (aliasKey && US_ZONE_ALIASES[aliasKey]) return US_ZONE_ALIASES[aliasKey];
  if (aliasKey === "japan" && isUsableTimeZone("Asia/Tokyo")) return "Asia/Tokyo";

  return undefined;
}
