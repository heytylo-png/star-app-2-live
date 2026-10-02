/**
 * Chart chrome is a compact menu on the Chart tab, same open/close idea as Life.
 * First tap on Chart opens it. Outside, Escape, a second tap, or leaving the tab closes it.
 * Opening the menu does not ask Chat or the brain for a reading.
 */

import { sunFromBirthDate, sunFromMonthDay } from "./chart.ts";
import type { ShellTab } from "./shell.ts";
import { MOON_PHASE_LABELS, type MoonPhaseLabel, type SkyFacts } from "./sky.ts";

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

/**
 * Once per local day. A saved line for that date wins, even if the sky later differs.
 */
export function lockChartReading(
  cache: Record<string, string> | null | undefined,
  dateKey: string,
  text: string,
): Record<string, string> {
  const key = dateKey.trim();
  const current = cache ?? {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return current;
  if (current[key]?.trim()) return current;
  const line = text
    .split(/\n+/)
    .map((row) => row.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
  if (!line) return current;
  return { ...current, [key]: line };
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
