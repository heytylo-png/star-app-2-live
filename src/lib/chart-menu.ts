/**
 * Chart chrome is a compact menu on the Chart tab, same open/close idea as Life.
 * First tap on Chart opens it. Outside, Escape, a second tap, or leaving the tab closes it.
 * Opening the menu does not ask Chat or the brain for a reading.
 */

import { chartTimeZone, localDateKey, sunFromBirthDate, sunFromMonthDay } from "./chart.ts";
import type { ShellTab } from "./shell.ts";
import { MOON_PHASE_LABELS, TROPICAL_SIGN_ORDER, type MoonPhaseLabel, type SkyFacts } from "./sky.ts";

export type ChartMenuState = {
  tab: ShellTab;
  open: boolean;
  callActive: boolean;
};

export type ChartMenuAction =
  | { type: "select-tab"; tab: ShellTab }
  | { type: "toggle-chart" }
  | { type: "outside" }
  | { type: "escape" }
  | { type: "call"; active: boolean };

export function reduceChartMenu(state: ChartMenuState, action: ChartMenuAction): ChartMenuState {
  switch (action.type) {
    case "select-tab":
      if (action.tab !== "chart") {
        return { tab: action.tab, open: false, callActive: state.callActive };
      }
      return { tab: "chart", open: !state.callActive, callActive: state.callActive };
    case "toggle-chart":
      if (state.callActive) {
        return { tab: "chart", open: false, callActive: true };
      }
      if (state.tab !== "chart") {
        return { tab: "chart", open: true, callActive: false };
      }
      return { ...state, open: !state.open };
    case "outside":
    case "escape":
      return { ...state, open: false };
    case "call":
      return {
        ...state,
        callActive: action.active,
        open: action.active ? false : state.open,
      };
    default:
      return state;
  }
}

/** User's sun only, from the saved sign or the saved birth date. Her sign stays off this row. */
export function chartMenuSun(opts: { userSun?: string | null; birthDate?: string | null }): string | null {
  const stored = opts.userSun?.replace(/\s+/g, " ").trim();
  if (stored) return stored;
  return sunFromBirthDate(opts.birthDate) ?? null;
}

/** One short row for the sun in the sky today. Not her natal sign, not a reading. */
export function chartMenuTodaySunLine(sign?: string | null): string {
  const sun = sign?.replace(/\s+/g, " ").trim();
  return sun ? `Sun · ${sun}` : "Sun · —";
}

const MOON_SYNODIC_DAYS = 29.530588853;
/** 2000-01-06 18:14 UTC, a new moon. Offline phase only — not the ephemeris. */
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14, 0);

function hashReading(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function pickReading<T>(bank: readonly T[], seed: string): T {
  return bank[hashReading(seed) % bank.length]!;
}

function clipReadingLine(value: string, max = 72): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd();
}

/** Device-date moon phase when astronomy-engine did not return sky facts. */
export function offlineMoonPhase(dateKey: string): MoonPhaseLabel | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  if (!Number.isFinite(utc)) return null;
  const days = (utc - KNOWN_NEW_MOON_UTC) / 86400000;
  const age = ((days % MOON_SYNODIC_DAYS) + MOON_SYNODIC_DAYS) % MOON_SYNODIC_DAYS;
  const bin = Math.round((age / MOON_SYNODIC_DAYS) * 8) % 8;
  return MOON_PHASE_LABELS[bin] ?? null;
}

function offlineSunSign(dateKey: string): string | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return sunFromMonthDay(Number(match[2]), Number(match[3])) ?? null;
}

function readingLines(lines: string[]): string {
  return lines
    .map((line) => clipReadingLine(line))
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

/**
 * Silent Chart-menu note. Local templates only — no Grok, no speech.
 * Same date and same facts always return the same lines. Another date rotates them.
 */
export function composeChartAstronomyReading(opts: {
  dateKey: string;
  sky?: Pick<SkyFacts, "sunSignToday" | "moonSignToday" | "moonPhase" | "notableAspect"> | null;
}): string {
  const dateKey = opts.dateKey.trim();
  const sky = opts.sky;
  const sun = sky?.sunSignToday?.replace(/\s+/g, " ").trim() || "";
  const moon = sky?.moonSignToday?.replace(/\s+/g, " ").trim() || "";
  const phase = sky?.moonPhase?.replace(/\s+/g, " ").trim() || "";
  const aspect = sky?.notableAspect?.replace(/\s+/g, " ").trim() || "";
  if (!sun && !moon && !phase) {
    const fallbackSun = offlineSunSign(dateKey);
    const fallbackPhase = offlineMoonPhase(dateKey);
    const seed = `${dateKey}|offline`;
    const lead =
      fallbackSun && fallbackPhase
        ? pickReading(
            [
              `${fallbackSun} sun. ${fallbackPhase}. Local guess.`,
              `${fallbackSun} sun, ${fallbackPhase}. Sky's quiet.`,
              `${fallbackPhase}. ${fallbackSun} sun. That's all.`,
            ],
            `${seed}|lead`,
          )
        : fallbackSun
          ? `${fallbackSun} sun. Phase didn't land.`
          : fallbackPhase
            ? `${fallbackPhase}. Sun sign didn't land.`
            : "Sky's offline. Nothing useful.";
    return readingLines([
      lead,
      pickReading(
        ["Offline. Not inventing it.", "No sky feed. Back to you.", "Local only. Not a lecture."],
        `${seed}|close`,
      ),
    ]);
  }

  const seed = `${dateKey}|${sun}|${moon}|${phase}`;
  const lines: string[] = [];
  if (sun && moon) {
    lines.push(
      pickReading(
        [`${sun} sun, ${moon} moon.`, `${sun} sun. ${moon} moon.`, `${moon} moon under ${sun}.`],
        `${seed}|lead`,
      ),
    );
  } else if (sun) {
    lines.push(`${sun} sun. I'm not listing the rest.`);
  } else if (moon) {
    lines.push(`${moon} moon. Sun's quiet.`);
  }
  if (phase) {
    lines.push(
      pickReading(
        [`${phase}. Don't sprint it.`, `${phase}. Keep it short.`, `${phase}. Not a speech.`],
        `${seed}|phase`,
      ),
    );
  }
  if (aspect && lines.length < 3) lines.push(aspect);
  else if (lines.length < 2) {
    lines.push(
      pickReading(
        ["One glance. Back to you.", "Sky moved. Still you.", "Not a lecture."],
        `${seed}|close`,
      ),
    );
  } else if (lines.length < 3 && hashReading(`${seed}|extra`) % 2 === 0) {
    lines.push(pickReading(["One glance. Back to you.", "Sky moved. Still you.", "Not a lecture."], `${seed}|close`));
  }
  return readingLines(lines);
}

const SIGN_NAMES = TROPICAL_SIGN_ORDER.join("|");
const SUN_SIGN_RE = new RegExp(`\\b(${SIGN_NAMES})\\s+sun\\b`, "i");
const UNDER_SIGN_RE = new RegExp(`\\bunder\\s+(${SIGN_NAMES})\\b`, "i");

/** Notes kept with the day being written: that day and the 13 before it. */
export const CHART_NOTE_KEEP_DAYS = 14;

function canonicalSign(raw: string | null | undefined): string | null {
  const cleaned = raw?.replace(/\s+/g, " ").trim() ?? "";
  if (!cleaned) return null;
  return TROPICAL_SIGN_ORDER.find((sign) => sign.toLowerCase() === cleaned.toLowerCase()) ?? null;
}

/**
 * Sun sign named in a saved reading. "Libra sun" and "moon under Libra" both count.
 * "Sun's sitting…" is an aspect line, not a sign.
 */
export function chartReadingSunSign(text: string | null | undefined): string | null {
  const note = text ?? "";
  const named = note.match(SUN_SIGN_RE);
  if (named?.[1]) return canonicalSign(named[1]);
  const under = note.match(UNDER_SIGN_RE);
  if (under?.[1]) return canonicalSign(under[1]);
  return null;
}

/** A blank live sun, or a note that never names one, still matches. */
export function chartReadingMatchesSun(note: string | null | undefined, liveSun?: string | null): boolean {
  const live = canonicalSign(liveSun);
  if (!live) return true;
  const cached = chartReadingSunSign(note);
  if (!cached) return true;
  return cached === live;
}

/** Show the saved line only while its sun sign still agrees with the live row. */
export function shownChartReading(
  cached: string | null | undefined,
  fresh: string,
  liveSun?: string | null,
): string {
  const note = cached?.trim() ?? "";
  if (note && chartReadingMatchesSun(note, liveSun)) return note;
  return fresh;
}

function readingDateUtc(key: string): number | null {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(utc)) return null;
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return utc;
}

/**
 * Drop notes older than 14 days relative to todayKey, and drop keys that are not dates.
 * A future date stays. The same object comes back when nothing was removed.
 */
export function pruneChartReadings(
  cache: Record<string, string> | null | undefined,
  todayKey: string,
  keepDays = CHART_NOTE_KEEP_DAYS,
): Record<string, string> {
  const current = cache ?? {};
  const today = readingDateUtc(todayKey.trim());
  if (today == null) return current;
  let changed = false;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    const utc = readingDateUtc(key);
    if (utc == null) {
      changed = true;
      continue;
    }
    const ageDays = Math.round((today - utc) / 86400000);
    if (ageDays >= keepDays) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : current;
}

function storedReading(text: string): string {
  return text
    .split(/\n+/)
    .map((row) => row.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}

/**
 * Once per local calendar day. The saved line wins while its sun sign still matches.
 * A sign change on that same date replaces the note. Writing also drops notes older than 14 days.
 */
export function lockChartReading(
  cache: Record<string, string> | null | undefined,
  dateKey: string,
  text: string,
  opts?: { liveSun?: string | null },
): Record<string, string> {
  const key = dateKey.trim();
  const current = cache ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return current;
  const existing = current[key]?.trim() ?? "";
  let next = current;
  if (!(existing && chartReadingMatchesSun(existing, opts?.liveSun))) {
    const line = storedReading(text);
    if (line && current[key] !== line) next = { ...current, [key]: line };
  }
  return pruneChartReadings(next, key);
}

const MAX_LOCAL_DATE_WAIT_MS = 26 * 60 * 60 * 1000;

/**
 * One wait until the next local calendar date. Not a poll.
 * The result is at least one second, and lands on or just after the date change.
 */
export function msUntilNextLocalDate(now: Date = new Date(), timeZone?: string): number {
  const tz = timeZone?.trim() || chartTimeZone();
  const startKey = localDateKey(now, tz);
  const start = now.getTime();
  let lo = start;
  let hi = start + MAX_LOCAL_DATE_WAIT_MS;
  if (localDateKey(new Date(hi), tz) === startKey) return MAX_LOCAL_DATE_WAIT_MS;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDateKey(new Date(mid), tz) === startKey) lo = mid;
    else hi = mid;
  }
  return Math.max(1000, hi - start);
}

/**
 * While the menu is open, a new local date shows that date's note.
 * The same date, or a closed menu, keeps the line already on screen.
 */
export function chartMenuReadingOnDateChange(opts: {
  open: boolean;
  previousDate: string;
  previousText: string;
  nextDate: string;
  fresh: string;
  liveSun?: string | null;
  cache: Record<string, string>;
}): { text: string; cache: Record<string, string> } {
  if (!opts.open || opts.previousDate === opts.nextDate) {
    return { text: opts.previousText, cache: opts.cache };
  }
  const cache = lockChartReading(opts.cache, opts.nextDate, opts.fresh, { liveSun: opts.liveSun });
  return {
    text: shownChartReading(cache[opts.nextDate], opts.fresh, opts.liveSun),
    cache,
  };
}

/** Last diary row. Empty pages stay a quiet line — opening Chart does not write one. */
export function chartMenuDiaryLine(entry?: { dateKey?: string | null; text?: string | null } | null): string {
  const text = entry?.text?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "No diary yet";
  const excerpt = chartDiaryExcerpt(text);
  if (!excerpt) return "No diary yet";
  const date = entry?.dateKey ? chartDiaryDateLabel(entry.dateKey) : "";
  return date ? `${date} · ${excerpt}` : excerpt;
}

export function chartDiaryExcerpt(text: string, max = 84): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

const DIARY_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Menu label only. The stored page does not repeat this date. */
export function chartDiaryDateLabel(dateKey: string): string {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateKey;
  const month = DIARY_MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || !day) return dateKey;
  return `${month} ${day}`;
}

/**
 * Visible Ask her line. Short. Diary and sky stay in the chart prompt, not this bubble.
 * A saved page with no sun asks what she wrote. Otherwise it's today's chart.
 */
export function chartAskDraft(entry?: { text?: string | null; userSun?: string | null } | null): string {
  const diary = entry?.text?.replace(/\s+/g, " ").trim();
  const sun = entry?.userSun?.replace(/\s+/g, " ").trim();
  if (diary && !sun) return "What did you write?";
  return "What's in my chart today?";
}

export function chartAskHandoff(entry?: { text?: string | null } | null): {
  tab: "chat";
  draft: string;
  sent: true;
} {
  return { tab: "chat", draft: chartAskDraft(entry), sent: true };
}
