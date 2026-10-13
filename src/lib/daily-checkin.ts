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

/** A chat beat inside this window means the day is already underway. */
export const CHECKIN_QUIET_MS = 2 * 60 * 60 * 1000;

function allMessages(threads: readonly CheckInThread[]): CheckInMessage[] {
  const out: CheckInMessage[] = [];
  for (const thread of threads) {
    for (const message of thread.messages ?? []) out.push(message);
  }
  return out;
}

function userMessages(threads: readonly CheckInThread[]): CheckInMessage[] {
  return allMessages(threads).filter((message) => message.role === "user");
}

function cleanGist(gist: string): string {
  return gist.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "").trim();
}

/** Pet, friend, or sibling. Anything else is not hers to bring up. */
const ALLOWED_SUBJECTS = new Set([
  "pet",
  "cat",
  "dog",
  "friend",
  "best friend",
  "sibling",
  "brother",
  "sister",
]);

/**
 * Hard stop, anywhere in the gist. Short tokens stay whole words so a name
 * like Alex or Andrew is not caught by "ex" or "dr".
 */
const CHECKIN_STOP_RE =
  /\b(?:ex|abusers?|abused|abusive|abuse|therapists?|doctors?|dr|counsell?ors?|dealers?|bosses?|co[- ]?workers?|self[- ]?harm(?:ing)?|suicid(?:e|al)|cutting|drugs?|cocaine|heroin|meth|fentanyl|overdose|opioids?|narcotics?|drinks?|drinking|drunk|alcohol(?:ic)?s?|beer|wine|liquor|booze|black\s*outs?|whiskey|vodka)\b|kill(?:ing)?\s+(?:myself|themselves|himself|herself)/i;

const USER_NAME_RE =
  /^(?:my|their|the user'?s|user'?s) name is\s+([A-Za-z][\w'-]{1,24})\b/i;

function relation(subject: string): string | null {
  const text = subject
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/'s\b/g, "")
    .replace(/^(?:their|the|my|our|your|her|his|a|an)\s+/, "")
    .trim();
  return ALLOWED_SUBJECTS.has(text) ? text : null;
}

function namedFact(gist: string): { subject: string; name: string } | null {
  const cleaned = cleanGist(gist);
  const nameIs = cleaned.match(/^(.*?)\s+name is\s+([A-Za-z][\w'-]{1,24})\b/i);
  if (nameIs) return { subject: nameIs[1] ?? "", name: nameIs[2] ?? "" };
  const isNamed = cleaned.match(/^(.*?)\s+is named\s+([A-Za-z][\w'-]{1,24})\b/i);
  if (isNamed) return { subject: isNamed[1] ?? "", name: isNamed[2] ?? "" };
  return null;
}

/** The user's own name, from "my name is" / "user's name" / a bare "Their name is". */
export function checkInUserName(gist: string): string | null {
  const match = cleanGist(gist).match(USER_NAME_RE);
  return match?.[1] ?? null;
}

function blockedNames(gists: readonly string[], profileName?: string | null): Set<string> {
  const names = new Set<string>();
  const profile = profileName?.trim();
  if (profile) names.add(profile.toLowerCase());
  for (const gist of gists) {
    const own = checkInUserName(gist);
    if (own) names.add(own.toLowerCase());
  }
  return names;
}

/**
 * "Tell Miso I said hi." only for an allowlisted pet, friend, or sibling.
 * The name keeps the casing stored in the gist. No other memory is spoken.
 */
export function checkInMemoryLine(
  gist: string,
  userNames?: readonly string[] | null,
): string | null {
  const cleaned = cleanGist(gist);
  if (!cleaned || CHECKIN_STOP_RE.test(cleaned)) return null;
  const named = namedFact(cleaned);
  if (!named || !relation(named.subject)) return null;
  const blocked = new Set((userNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (blocked.has(named.name.toLowerCase())) return null;
  return `Tell ${named.name} I said hi.`;
}

function bandLine(band: CheckInBand, date: string): string {
  const rows = CHECKIN_LINES[band];
  return rows[rotate(`${date}:${band}`, rows.length)]!;
}

function recentMessage(threads: readonly CheckInThread[], nowMs: number): boolean {
  for (const message of allMessages(threads)) {
    if (message.createdAt == null) continue;
    if (nowMs - message.createdAt <= CHECKIN_QUIET_MS) return true;
  }
  return false;
}

/** Clock filter drops an off-hour memory clause and leaves the band line. */
export function composeCheckInLine(
  now: ClockNow,
  date: string,
  gists: readonly string[],
  profileName?: string | null,
): string {
  const band = checkInBand(now.hour);
  const base = bandLine(band, date);
  const opts = { now, recentText: "", askedTime: false as const };
  const plain = filterClockSpokenLine(base, opts) || base;
  const blocked = blockedNames(gists, profileName);
  const spoken = gists
    .map((gist) => checkInMemoryLine(gist, [...blocked]))
    .filter((line): line is string => Boolean(line));
  if (!spoken.length) return plain;
  const memory = spoken[rotate(`${date}:gist`, spoken.length)]!;
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
  /** Profile name. A "my name is" / "user's name" gist is read from the gists. */
  userName?: string | null;
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
  if (recentMessage(input.threads, now.getTime())) return { post: false };
  return {
    post: true,
    date,
    band: checkInBand(clock.hour),
    line: composeCheckInLine(clock, date, input.memoryGists ?? [], input.userName),
  };
}

/**
 * One evaluation per page load. A later call start, call end, or other
 * state change passes `tried: true` and inserts nothing.
 */
export function settleDailyCheckIn(
  tried: boolean,
  input: Parameters<typeof planDailyCheckIn>[0],
): { tried: true; plan: CheckInPlan } {
  if (tried) return { tried: true, plan: { post: false } };
  return { tried: true, plan: planDailyCheckIn(input) };
}

export function checkInLineIsInBand(line: string, band: CheckInBand): boolean {
  const lower = line.toLowerCase();
  if (band !== "late" && CLOCK_BANNED_NIGHT.some((phrase) => lower.includes(phrase))) return false;
  if (band !== "morning" && CLOCK_BANNED_MORNING.some((phrase) => lower.includes(phrase))) return false;
  return true;
}
