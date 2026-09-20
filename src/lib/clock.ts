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

export function readLocalNow(now: Date = new Date(), timeZone: string = clockTimeZone()): ClockNow {
  const tz = isUsableTimeZone(timeZone) ? timeZone.trim() : CLOCK_TZ_FALLBACK;
  const hour = localHour(now, tz);
  const weekdayRaw = part(now, tz, { weekday: "long" }, "weekday");
  const weekday = WEEKDAYS.find((d) => d.toLowerCase() === weekdayRaw.toLowerCase()) ?? weekdayRaw;
  const tzLabel =
    part(now, tz, { hour: "numeric", timeZoneName: "short" }, "timeZoneName") || tz;
  return {
    weekday: weekday || "Saturday",
    hour,
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

/**
 * Compact CLOCK block for every grok-4-latest system message.
 * Standing fact — not a speech topic dump.
 */
export function formatClockFactsBlock(now: ClockNow): string {
  const tz = now.tzLabel && now.tzLabel !== now.timeZone ? `${now.timeZone} (${now.tzLabel})` : now.timeZone;
  return [
    "CLOCK",
    `weekday: ${now.weekday}`,
    `hour: ${now.hour}`,
    `tz: ${tz}`,
    `band: ${now.band}`,
    "with_user: true",
    "",
    "Fact only — not a topic. She is in this zone with the user. Do not invent Fukuoka / Japan local.",
    `"What time is it where you are?" → this hour, one beat.`,
    `Stock "mornings drag" / "late nights thinking about you" only if band matches (morning / night) or they brought up sleep.`,
  ].join("\n");
}

const CLOCK_ASK_RE =
  /\b(?:what(?:'?s| is) the time|what time is it|time (?:is it )?where you are)\b/i;

const MEETUP_TIME_RE = /\b(meet|meeting|schedule|lunch|dinner|call me at|see you at)\b/i;

/** True for "what time is it (where you are)?" — not meetup scheduling. */
export function isClockAsk(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (!CLOCK_ASK_RE.test(t)) return false;
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
    line: `${spokenClockHour(turn.now.hour)}.`,
  };
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
