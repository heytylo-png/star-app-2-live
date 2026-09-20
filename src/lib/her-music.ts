/**
 * Star Rai's music taste — suggestions + her favorite lists.
 * Titles only. She owns the picks. Spotify is search/play, never her list store.
 */

import {
  compactPlaylist,
  isLifeMoodTag,
  type LifeMoodTag,
  type LifeSlots,
} from "./life.ts";

export const HER_MUSIC_STORE_KEY = "star-rai-her-music";
export const SUGGESTION_MAX = 3;
export const FAVORITE_LIST_MAX = 8;
export const FAVORITE_TRACK_MAX = 8;

export type LifeSuggestionSource = "local" | "grok";

export type LifeSuggestion = {
  title: string;
  note?: string;
  source: LifeSuggestionSource;
};

export type FavoriteList = {
  id: string;
  name: string;
  tracks: string[];
};

export type HerMusicState = {
  suggestions: LifeSuggestion[];
  suggestion_date?: string;
  asked_date?: string;
  lists: FavoriteList[];
};

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

function titleKey(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

export const HER_SEED_LISTS: readonly FavoriteList[] = [
  {
    id: "brat-hours",
    name: "Brat hours",
    tracks: [
      "NewJeans - Super Shy",
      "NewJeans - ETA",
      "LE SSERAFIM - Perfect Night",
      "IVE - After LIKE",
    ],
  },
  {
    id: "dont-skip",
    name: "Don't skip",
    tracks: [
      "NewJeans - Hype Boy",
      "LE SSERAFIM - ANTIFRAGILE",
      "aespa - Spicy",
      "NewJeans - How Sweet",
    ],
  },
  {
    id: "late-soft",
    name: "Late soft",
    tracks: [
      "NewJeans - Ditto",
      "NewJeans - Cool With You",
      "IU - Blueming",
      "Heize - We Don't Talk Together",
    ],
  },
] as const;

const EXTRA_CATALOG: readonly string[] = [
  "NewJeans - Attention",
  "NewJeans - OMG",
  "LE SSERAFIM - Eve, Psyche & The Bluebeard's Wife",
  "IVE - LOVE DIVE",
  "aespa - Drama",
  "IU - eight",
];

const NOTE_BANK: Record<LifeMoodTag, readonly string[]> = {
  bratty: ["Mine. Don't argue.", "That's the one. Keep up.", "Yeah. That energy."],
  smug: ["Taste. Obviously.", "I already knew.", "Don't make it a thing."],
  tired: ["Low lights. This one.", "Quiet enough.", "Don't skip. I'm tired."],
  soft: ["This one stays.", "Soft. That's the point.", "Leave it on."],
};

export function listIdForMood(mood?: LifeMoodTag): string {
  if (mood === "smug") return "dont-skip";
  if (mood === "tired" || mood === "soft") return "late-soft";
  return "brat-hours";
}

export function cleanTrackTitle(raw: string): string | undefined {
  const title = clip(raw.replace(/^["«]|["»]+$/g, ""), 48);
  if (!title || /^https?:\/\//i.test(title) || /^spotify:/i.test(title)) return undefined;
  if (/^(a song|a track|music|something|this|that)$/i.test(title)) return undefined;
  return title;
}

export function compactFavoriteTracks(list?: string[]): string[] {
  const compact = compactPlaylist(list) ?? [];
  return compact.slice(0, FAVORITE_TRACK_MAX);
}

export function seedFavoriteLists(): FavoriteList[] {
  return HER_SEED_LISTS.map((row) => ({
    id: row.id,
    name: row.name,
    tracks: [...row.tracks],
  }));
}

export function mergeHerLists(stored?: FavoriteList[]): FavoriteList[] {
  const seeds = seedFavoriteLists();
  if (!stored?.length) return seeds;
  const byId = new Map(stored.map((row) => [row.id, row]));
  const out: FavoriteList[] = seeds.map((seed) => {
    const have = byId.get(seed.id);
    if (!have) return seed;
    const tracks = compactFavoriteTracks([...(have.tracks ?? []), ...seed.tracks]);
    return {
      id: seed.id,
      name: clip(have.name || seed.name, 32) || seed.name,
      tracks: tracks.length ? tracks : seed.tracks,
    };
  });
  for (const row of stored) {
    if (seeds.some((s) => s.id === row.id)) continue;
    if (out.length >= FAVORITE_LIST_MAX) break;
    const tracks = compactFavoriteTracks(row.tracks);
    const name = clip(row.name || "Hers", 32);
    if (!row.id || !name || !tracks.length) continue;
    out.push({ id: clip(row.id, 32), name, tracks });
  }
  return out.slice(0, FAVORITE_LIST_MAX);
}

export function allHerTitles(lists: FavoriteList[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const title of list.tracks) {
      const key = titleKey(title);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(title);
    }
  }
  return out;
}

export function catalogForMood(lists: FavoriteList[], mood?: LifeMoodTag): string[] {
  const preferred = lists.find((row) => row.id === listIdForMood(mood))?.tracks ?? [];
  const rest = allHerTitles(lists).filter((t) => !preferred.some((p) => titleKey(p) === titleKey(t)));
  return [...preferred, ...rest, ...EXTRA_CATALOG];
}

function alreadyHeard(title: string, avoid: string[]): boolean {
  const key = titleKey(title);
  return avoid.some((a) => titleKey(a) === key);
}

export function pickLocalSuggestions(opts: {
  today: string;
  mood?: LifeMoodTag;
  lists?: FavoriteList[];
  avoid?: string[];
  count?: number;
}): LifeSuggestion[] {
  const lists = mergeHerLists(opts.lists);
  const mood = isLifeMoodTag(opts.mood) ? opts.mood : "bratty";
  const avoid = opts.avoid ?? [];
  const count = Math.min(SUGGESTION_MAX, Math.max(1, opts.count ?? 2));
  const pool = catalogForMood(lists, mood).filter((t) => !alreadyHeard(t, avoid));
  const source = pool.length ? pool : catalogForMood(lists, mood);
  const start = hashString(`${opts.today}|${mood}|${avoid.join(",")}`) % source.length;
  const out: LifeSuggestion[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < source.length && out.length < count; i++) {
    const title = source[(start + i) % source.length]!;
    const key = titleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const notes = NOTE_BANK[mood];
    out.push({
      title,
      note: notes[hashString(`${opts.today}|${title}`) % notes.length],
      source: "local",
    });
  }
  return out;
}

export function parseSuggestionPayload(raw: string): LifeSuggestion[] {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      suggestions?: unknown;
      title?: unknown;
    };
    const rows = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
      : parsed.title
        ? [{ title: parsed.title }]
        : [];
    const out: LifeSuggestion[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as { title?: unknown; note?: unknown };
      const title = typeof rec.title === "string" ? cleanTrackTitle(rec.title) : undefined;
      if (!title) continue;
      const key = titleKey(title);
      if (seen.has(key)) continue;
      seen.add(key);
      const note = typeof rec.note === "string" ? clip(rec.note, 48) : undefined;
      const item: LifeSuggestion = { title, source: "grok" };
      if (note) item.note = note;
      out.push(item);
      if (out.length >= SUGGESTION_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function applySuggestionGrokRaw(
  raw: string,
  local: LifeSuggestion[],
): LifeSuggestion[] {
  const parsed = parseSuggestionPayload(raw);
  return parsed.length ? parsed : local;
}

export function adoptHeardTitle(
  lists: FavoriteList[],
  title: string | undefined,
  mood?: LifeMoodTag,
): FavoriteList[] {
  const clean = title ? cleanTrackTitle(title) : undefined;
  if (!clean) return mergeHerLists(lists);
  const next = mergeHerLists(lists);
  if (allHerTitles(next).some((t) => titleKey(t) === titleKey(clean))) return next;
  const id = listIdForMood(mood);
  return next.map((row) => {
    if (row.id !== id) return row;
    return { ...row, tracks: compactFavoriteTracks([...row.tracks, clean]) };
  });
}

export function formatSuggestFactsBlock(opts: {
  today: string;
  life?: LifeSlots;
  lists: FavoriteList[];
}): string {
  const lines = ["LIFE", "ask: suggest", `today_date: ${opts.today}`];
  if (opts.life?.on) lines.push("session_on: true");
  if (opts.life?.now_playing) lines.push(`now_playing: ${opts.life.now_playing}`);
  if (opts.life?.mood_tag) lines.push(`mood_tag: ${opts.life.mood_tag}`);
  const names = opts.lists.map((row) => row.name).filter(Boolean);
  if (names.length) lines.push(`her_lists: ${names.join(" · ")}`);
  lines.push("");
  lines.push("She is picking 1–3 tracks she likes. Titles only.");
  lines.push('Return JSON: {"suggestions":[{"title":"Artist - Song","note":"short"}]}');
  lines.push("Notes: voice-card short. Not a DJ setlist. Do not recite daily_playlist.");
  lines.push("Do not invent Spotify playlist IDs. Never kiss.");
  return lines.join("\n");
}

export function shouldRefreshSuggestions(opts: {
  today: string;
  sessionOn: boolean;
  askedDate?: string;
}): boolean {
  return opts.sessionOn || opts.askedDate === opts.today;
}

export function emptyHerMusic(): HerMusicState {
  return { suggestions: [], lists: seedFavoriteLists() };
}

export function compactHerMusic(state?: Partial<HerMusicState>): HerMusicState {
  const lists = mergeHerLists(state?.lists);
  const suggestions = (state?.suggestions ?? [])
    .map((row) => {
      const title = cleanTrackTitle(row.title);
      if (!title) return undefined;
      const next: LifeSuggestion = {
        title,
        source: row.source === "grok" ? "grok" : "local",
      };
      if (row.note?.trim()) next.note = clip(row.note, 48);
      return next;
    })
    .filter((row): row is LifeSuggestion => Boolean(row))
    .slice(0, SUGGESTION_MAX);
  const out: HerMusicState = { suggestions, lists };
  if (state?.suggestion_date?.trim()) out.suggestion_date = state.suggestion_date.trim();
  if (state?.asked_date?.trim()) out.asked_date = state.asked_date.trim();
  return out;
}
