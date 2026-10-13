/**
 * Daily check-in. One local chat beat on the first open of a calendar day.
 * Clock bands pick the line. No network, no speech, no pose.
 */

import {
  CLOCK_BANNED_MORNING,
  CLOCK_BANNED_NIGHT,
  CLOCK_NEUTRAL_LINE,
  clockTimeZone,
  filterClockSpokenLine,
  hourBand,
  readLocalNow,
  type ClockNow,
} from "./clock.ts";

export const CHECKIN_DATE_KEY = "star-rai-checkin";

export type CheckInBand = "morning" | "afternoon" | "evening" | "late";

export const CHECKIN_LINES: Record<CheckInBand, readonly string[]> = {
  morning: ["Morning. You made it.", "Hey. Day's on.", "You're here. Morning."],
  afternoon: ["Afternoon. Still around.", "Hey. Middle of the day.", "You dropped in. Hi."],
  evening: ["Evening. Come sit.", "Hey. Day's winding down.", "You're here. Evening."],
  late: ["You're up late.", "Late. I'm still here.", "Hey. Quiet hours."],
};

export type CheckInMessage = {
  role?: string;
  content?: string;
  createdAt?: number;
};

export type CheckInThread = {
  id?: string;
  messages?: readonly CheckInMessage[];
};

export type CheckInPlan =
  | { post: false }
  | { post: true; date: string; line: string; band: CheckInBand };

/** Morning 6–11, afternoon 12–17, evening 18–21, late night 22–23 and 0–5. */
export function checkInBand(hour: number): CheckInBand {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  if (h <= 5 || h >= 22) return "late";
  const band = hourBand(h);
  if (band === "morning" || band === "afternoon" || band === "evening") return band;
  return "late";
}

export function checkInDate(now: Date, timeZone: string): string {
  return readLocalNow(now, timeZone).localNow.slice(0, 10);
}

function dayStamp(createdAt: number, timeZone: string): string {
  return checkInDate(new Date(createdAt), timeZone);
}

function rotate(seed: string, length: number): number {
  let n = 0;
  for (const ch of seed) n = (Math.imul(n, 33) + ch.charCodeAt(0)) >>> 0;
  return length ? n % length : 0;
}

export function loadCheckInDate(read: (key: string) => string | null): string | null {
  try {
    const raw = read(CHECKIN_DATE_KEY)?.trim() ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveCheckInDate(date: string, write: (key: string, value: string) => void): void {
  write(CHECKIN_DATE_KEY, date);
}

function userMessages(threads: readonly CheckInThread[]): CheckInMessage[] {
  const out: CheckInMessage[] = [];
  for (const thread of threads) {
    for (const message of thread.messages ?? []) {
      if (message.role === "user") out.push(message);
    }
  }
  return out;
}

/** One stored fact, clipped. Empty when she has nothing to mention. */
export function checkInGist(gists: readonly string[], date: string): string | null {
  const clean = gists
    .map((gist) => gist.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "").trim())
    .filter(Boolean);
  if (!clean.length) return null;
  const gist = clean[rotate(`${date}:gist`, clean.length)]!;
  return gist.length > 60 ? `${gist.slice(0, 59).trimEnd()}…` : gist;
}

function bandLine(band: CheckInBand, date: string): string {
  const rows = CHECKIN_LINES[band];
  return rows[rotate(`${date}:${band}`, rows.length)]!;
}

/** Clock filter drops an off-hour memory clause and leaves the band line. */
export function composeCheckInLine(now: ClockNow, date: string, gists: readonly string[]): string {
  const band = checkInBand(now.hour);
  const base = bandLine(band, date);
  const opts = { now, recentText: "", askedTime: false as const };
  const plain = filterClockSpokenLine(base, opts);
  const gist = checkInGist(gists, date);
  if (!gist) return plain || base;
  const withGist = `${base} I remember — ${gist}.`;
  const filtered = filterClockSpokenLine(withGist, opts);
  const kept =
    filtered &&
    filtered !== CLOCK_NEUTRAL_LINE &&
    filtered.toLowerCase().includes(gist.slice(0, Math.min(12, gist.length)).toLowerCase());
  return kept ? filtered : plain || base;
}

export function planDailyCheckIn(input: {
  now?: Date;
  timeZone?: string | null;
  lastDate: string | null;
  threads: readonly CheckInThread[];
  callActive: boolean;
  birthdayCard: boolean;
  staleNotice: boolean;
  memoryGists?: readonly string[];
}): CheckInPlan {
  if (input.callActive || input.birthdayCard || input.staleNotice) return { post: false };
  const timeZone = clockTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const clock = readLocalNow(now, timeZone);
  const date = clock.localNow.slice(0, 10);
  if (input.lastDate === date) return { post: false };
  const sent = userMessages(input.threads);
  if (!sent.length) return { post: false };
  if (sent.some((message) => message.createdAt != null && dayStamp(message.createdAt, timeZone) === date)) {
    return { post: false };
  }
  return {
    post: true,
    date,
    band: checkInBand(clock.hour),
    line: composeCheckInLine(clock, date, input.memoryGists ?? []),
  };
}

export function checkInLineIsInBand(line: string, band: CheckInBand): boolean {
  const lower = line.toLowerCase();
  if (band !== "late" && CLOCK_BANNED_NIGHT.some((phrase) => lower.includes(phrase))) return false;
  if (band !== "morning" && CLOCK_BANNED_MORNING.some((phrase) => lower.includes(phrase))) return false;
  return true;
}
