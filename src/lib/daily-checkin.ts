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

function cleanGist(gist: string): string {
  return gist.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "").trim();
}

/** One stored fact for the day. Empty when she has nothing to mention. */
export function checkInGist(gists: readonly string[], date: string): string | null {
  const clean = gists.map(cleanGist).filter(Boolean);
  if (!clean.length) return null;
  return clean[rotate(`${date}:gist`, clean.length)]!;
}

const NAME_STOP = new Set(
  "the person talking you user rai star idol she he they someone anyone their them".split(" "),
);

function properName(raw: string): string | null {
  const name = raw.trim();
  if (!/^[A-Za-z][\w'-]{1,24}$/.test(name)) return null;
  if (NAME_STOP.has(name.toLowerCase())) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** A liking phrase, lowercased so it can sit inside her sentence. */
function likePhrase(raw: string): string | null {
  const phrase = cleanGist(raw).toLowerCase();
  if (phrase.length < 2 || phrase.length > 48) return null;
  if (!/^[a-z0-9]/.test(phrase)) return null;
  return phrase;
}

/**
 * A memory only when the gist matches a known shape.
 * A name becomes "Tell Ada I said hi." A liking becomes "Still into quiet tea?"
 * Anything else is left unsaid.
 */
export function checkInMemoryLine(gist: string): string | null {
  const cleaned = cleanGist(gist);
  if (!cleaned || /i remember/i.test(cleaned)) return null;
  if (/^they like\b/i.test(cleaned)) {
    const like = cleaned.match(/^they like\s+(.+)$/i);
    const phrase = like?.[1] ? likePhrase(like[1]) : null;
    return phrase ? `Still into ${phrase}?` : null;
  }
  const named =
    cleaned.match(/^(?:.+\s)?name is\s+([A-Za-z][\w'-]{1,24})\b/i) ??
    cleaned.match(/^(?:.+\s)?is named\s+([A-Za-z][\w'-]{1,24})\b/i);
  const name = named?.[1] ? properName(named[1]) : null;
  return name ? `Tell ${name} I said hi.` : null;
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
  const plain = filterClockSpokenLine(base, opts) || base;
  const gist = checkInGist(gists, date);
  const memory = gist ? checkInMemoryLine(gist) : null;
  if (!memory) return plain;
  const filtered = filterClockSpokenLine(`${base} ${memory}`, opts);
  const kept = filtered && filtered !== CLOCK_NEUTRAL_LINE && filtered.includes(memory);
  return kept ? filtered : plain;
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
