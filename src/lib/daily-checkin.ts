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
  | { post: true; date: string; line: string; band: CheckInBand; lineId: string };

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

const CHECKIN_STORED =
  /^(\d{4}-\d{2}-\d{2})(?:\|((?:morning|afternoon|evening|late):\d+))?$/;

function readCheckIn(read: (key: string) => string | null): { date: string | null; lineId: string | null } {
  try {
    const match = read(CHECKIN_DATE_KEY)?.trim().match(CHECKIN_STORED);
    if (!match) return { date: null, lineId: null };
    return { date: match[1] ?? null, lineId: match[2] ?? null };
  } catch {
    return { date: null, lineId: null };
  }
}

export function loadCheckInDate(read: (key: string) => string | null): string | null {
  return readCheckIn(read).date;
}

export function loadCheckInLineId(read: (key: string) => string | null): string | null {
  return readCheckIn(read).lineId;
}

export function saveCheckInDate(
  date: string,
  write: (key: string, value: string) => void,
  lineId?: string | null,
): void {
  write(CHECKIN_DATE_KEY, lineId ? `${date}|${lineId}` : date);
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
  return gist.replace(/\s+/g, " ").trim();
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
  /\b(?:ex|abusers?|abused|abusive|abuse|therapists?|doctors?|dr|counsell?ors?|dealers?|bosses?|co[- ]?workers?|self[- ]?harm(?:ing)?|suicid(?:e|al)|cutting|drugs?|cocaine|heroin|meth|fentanyl|overdose|opioids?|narcotics?|drinks?|drinking|drunk|alcohol(?:ic)?s?|beer|wine|liquor|booze|black\s*outs?|whiskey|vodka|died|dead|rehab|prison|assaulted|assaults?|passed\s+away)\b|kill(?:ed|ing)?\s+(?:myself|themselves|himself|herself)/i;

/** Vocatives and role-words. Not a given name, in any casing. */
const WORD_NAMES = new Set(
  `mom mum mommy mummy mama mother dad daddy papa father god jesus christ lord
   baby babe honey sweetie darling hun dear dude bro sis bruh buddy pal
   nobody someone somebody anyone anybody everybody everyone`.split(/\s+/),
);

const CAPITAL_NAME = /^[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?$/;

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

/**
 * Allowlisted subject, then "name is" / "is named", then a name, then nothing.
 * One trailing . or ! is allowed. Anything after the name is not.
 * The name is one or two capitalised words of letters only.
 */
function namedFact(gist: string): { subject: string; name: string } | null {
  const text = cleanGist(gist).replace(/[.!]$/, "").trim();
  const match = text.match(/^(.*)\s+(?:name is|is named)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)$/i);
  const name = match?.[2] ?? "";
  if (!match || !CAPITAL_NAME.test(name)) return null;
  return { subject: match[1] ?? "", name };
}

function wordName(name: string): boolean {
  return name.split(/\s+/).some((word) => WORD_NAMES.has(word.toLowerCase()));
}

function capitalName(raw: string | undefined): string | null {
  const kept: string[] = [];
  for (const word of (raw ?? "").trim().split(/\s+/)) {
    if (!/^[A-Z][A-Za-z]*$/.test(word)) break;
    kept.push(word);
    if (kept.length === 2) break;
  }
  return kept.length ? kept.join(" ") : null;
}

const SELF_NAME_PATTERNS = [
  /\byour name is\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
  /\b(?:they|you) go by\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
  /\bcalled\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
  /\bi['’]m\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
  /\bi am\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
  /\bname:\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
  /\bmy name is\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
  /\b(?:the )?user'?s name is\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi,
];

/** Names the gist gives the user, not a pet or a friend. */
export function checkInSelfNames(gist: string): string[] {
  const text = cleanGist(gist);
  const found: string[] = [];
  for (const pattern of SELF_NAME_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const name = capitalName(match[1]);
      if (name) found.push(name);
    }
  }
  const bare = text.match(/^their name is\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
  const own = capitalName(bare?.[1]);
  if (own) found.push(own);
  return found;
}

/** The user's own name, from a self-name gist. */
export function checkInUserName(gist: string): string | null {
  return checkInSelfNames(gist)[0] ?? null;
}

/**
 * Profile name for the check-in. A slot copied from a pet, friend, or sibling
 * fact is not the user — "Their cat's name is Miso" must not block Miso.
 * A "my name is" / "user's name" gist still counts, and so does a profile
 * name that no allowlisted fact explains.
 */
export function checkInSpokenUserName(
  profileName: string | null | undefined,
  gists: readonly string[],
): string | null {
  const profile = profileName?.trim() ?? "";
  if (!profile) return null;
  const key = profile.toLowerCase();
  if (gists.some((gist) => checkInSelfNames(gist).some((name) => name.toLowerCase() === key))) return profile;
  const copied = gists.some((gist) => {
    const cleaned = cleanGist(gist);
    if (!cleaned || CHECKIN_STOP_RE.test(cleaned)) return false;
    const named = namedFact(cleaned);
    return Boolean(named && relation(named.subject) && named.name.toLowerCase() === key);
  });
  return copied ? null : profile;
}

function blockedNames(gists: readonly string[], profileName?: string | null): Set<string> {
  const names = new Set<string>();
  const profile = profileName?.trim();
  if (profile) names.add(profile.toLowerCase());
  for (const gist of gists) {
    for (const own of checkInSelfNames(gist)) names.add(own.toLowerCase());
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
  if (!named || !relation(named.subject) || wordName(named.name)) return null;
  const blocked = new Set((userNames ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (blocked.has(named.name.toLowerCase())) return null;
  return `Tell ${named.name} I said hi.`;
}

function chooseBandLine(
  band: CheckInBand,
  date: string,
  avoidLineId?: string | null,
): { id: string; text: string } {
  const rows = CHECKIN_LINES[band];
  let index = rotate(`${date}:${band}`, rows.length);
  if (avoidLineId === `${band}:${index}`) index = (index + 1) % rows.length;
  return { id: `${band}:${index}`, text: rows[index]! };
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
  avoidLineId?: string | null,
): string {
  const band = checkInBand(now.hour);
  const base = chooseBandLine(band, date, avoidLineId).text;
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
  /** Profile name. Self-name gists are read from memory as well. */
  userName?: string | null;
  /** Yesterday's time-of-day line, so today does not repeat it. */
  lastLineId?: string | null;
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
  const band = checkInBand(clock.hour);
  const chosen = chooseBandLine(band, date, input.lastLineId);
  return {
    post: true,
    date,
    band,
    lineId: chosen.id,
    line: composeCheckInLine(clock, date, input.memoryGists ?? [], input.userName, input.lastLineId),
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
