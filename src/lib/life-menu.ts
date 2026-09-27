/**
 * Life chrome is a compact menu on the Life tab, not a second page.
 * First arrival stays closed so the desk clip is the screen.
 * Re-tapping Life, outside, Escape, or leaving for Chat / Chart / Call closes it.
 *
 * The current track is one row. Spotify playback stores "Artist - Title"
 * (and a uri) while suggestions and the daily list often store the short
 * title or "Title - Artist". Matching is by track id/uri first, then by
 * a normalized title, so the same song cannot sit under Stop and again
 * under Her Suggestion or Daily.
 */

import type { ShellTab } from "./shell.ts";
import { formatSpotifyTrackTitle, type SpotifyTrack } from "./spotify.ts";

export type LifeTrackRef = {
  title?: string | null;
  /** Spotify track uri or id. Uri wins when both exist. */
  id?: string | null;
  /** Live player: false while audio is playing. Omitted means "this is current". */
  paused?: boolean;
};

const SMART_SINGLE = /[\u2018\u2019\u2032\u0060]/g;
const SMART_DOUBLE = /[\u201C\u201D\u2033\u00AB\u00BB]/g;

function plainQuotes(value: string): string {
  return value.replace(SMART_SINGLE, "'").replace(SMART_DOUBLE, '"');
}

/** Decorations off, artist dash kept, so "Artist - Title" can still be split. */
function prepLifeTitle(value: string): string {
  let s = plainQuotes(value).replace(/\s+/g, " ").trim().toLowerCase();
  s = s.replace(/^["']+|["']+$/g, "").trim();
  let prev = "";
  while (s && s !== prev) {
    prev = s;
    s = stripTitleDecorations(s);
  }
  return s;
}

function stripTitleDecorations(value: string): string {
  return value
    .replace(/\s+-\s+remastered\b.*$/i, "")
    .replace(/\s*\((?:feat\.?|ft\.?|featuring)\b[^)]*\)\s*$/i, "")
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match key: lowercase, trimmed, collapsed whitespace, plain quotes,
 * trailing (feat. …) / […] / " - Remastered …" removed, then one
 * trailing " - Artist".
 */
export function normalizeLifeTitle(value: string): string {
  const stripped = prepLifeTitle(value).replace(/\s+-\s+[^-]+$/, "").trim();
  return stripTitleDecorations(stripped);
}

function titleSegments(value: string): string[] {
  return value
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Same song title, ignoring artist order, feat. credits, and remaster tags. */
export function lifeTitlesMatch(a: string, b: string): boolean {
  const preppedA = prepLifeTitle(a);
  const preppedB = prepLifeTitle(b);
  if (!preppedA || !preppedB) return false;
  if (preppedA === preppedB) return true;

  const normA = normalizeLifeTitle(a);
  const normB = normalizeLifeTitle(b);
  // "Bags - Clairo" and "Bags" share a canonical title.
  // Two different "Artist - Title" strings must not match just because
  // both strip down to the artist.
  if (normA && normA === normB && (normA === preppedA || normA === preppedB)) return true;

  const segmentsA = titleSegments(preppedA);
  const segmentsB = titleSegments(preppedB);
  if (segmentsA.length === 1 && segmentsB.length >= 2 && segmentsB.includes(segmentsA[0]!)) return true;
  if (segmentsB.length === 1 && segmentsA.length >= 2 && segmentsA.includes(segmentsB[0]!)) return true;
  if (
    segmentsA.length >= 2 &&
    segmentsA.length === segmentsB.length &&
    [...segmentsA].sort().join("\0") === [...segmentsB].sort().join("\0")
  ) {
    return true;
  }
  return false;
}

function bareTrackId(id: string): string {
  return id.trim().replace(/^spotify:track:/i, "");
}

function sameTrackId(a: string, b: string): boolean {
  const left = bareTrackId(a);
  const right = bareTrackId(b);
  return Boolean(left) && left === right;
}

export function lifeTracksMatch(a: LifeTrackRef, b: LifeTrackRef): boolean {
  const idA = a.id?.trim() ?? "";
  const idB = b.id?.trim() ?? "";
  if (idA && idB) return sameTrackId(idA, idB);
  const titleA = a.title?.trim() ?? "";
  const titleB = b.title?.trim() ?? "";
  if (!titleA || !titleB) return false;
  return lifeTitlesMatch(titleA, titleB);
}

function asRef(value: string | LifeTrackRef | null | undefined): LifeTrackRef {
  if (!value) return {};
  if (typeof value === "string") return { title: value };
  return value;
}

function displayTitle(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasTitle(ref: LifeTrackRef): boolean {
  return Boolean(displayTitle(ref.title));
}

/**
 * Live Spotify wins while it is actually playing. Otherwise the local
 * session title, then the title kept after Stop, then a paused player.
 */
function pickDisplayedTrack(spotify: LifeTrackRef, local: LifeTrackRef, last: LifeTrackRef): LifeTrackRef {
  const active = hasTitle(spotify) && spotify.paused !== true ? spotify : null;
  const chosen = active ?? (hasTitle(local) ? local : hasTitle(last) ? last : hasTitle(spotify) ? spotify : null);
  if (!chosen) return {};
  const title = displayTitle(chosen.title);
  let id = chosen.id?.trim() ?? "";
  if (!id) {
    for (const ref of [spotify, local, last]) {
      const other = ref.id?.trim() ?? "";
      const otherTitle = displayTitle(ref.title);
      if (other && otherTitle && lifeTitlesMatch(otherTitle, title)) {
        id = other;
        break;
      }
    }
  }
  return { title, id: id || undefined, paused: chosen.paused };
}

function take(
  list: Array<string | LifeTrackRef> | undefined,
  blocked: LifeTrackRef[],
): { titles: string[]; refs: LifeTrackRef[] } {
  const refs: LifeTrackRef[] = [];
  const titles: string[] = [];
  for (const raw of list ?? []) {
    const ref = asRef(raw);
    const title = displayTitle(ref.title);
    if (!title) continue;
    const current: LifeTrackRef = { title, id: ref.id?.trim() || undefined };
    if (blocked.some((row) => lifeTracksMatch(row, current))) continue;
    if (refs.some((row) => lifeTracksMatch(row, current))) continue;
    refs.push(current);
    titles.push(title);
  }
  return { titles, refs };
}

/**
 * One title, one place. The current track — from Spotify playback, the
 * local session, or the last track kept after Stop — stays in the top row.
 * Suggestions claim a title before Daily, and neither list repeats it.
 */
export function lifeMenuTracks(opts: {
  nowPlaying?: string | LifeTrackRef | null;
  /** Live Web Playback / currently_playing, even when local memory lags. */
  spotify?: LifeTrackRef | null;
  /** Title kept after Stop. Same field as now playing when the session is off. */
  lastPlayed?: string | LifeTrackRef | null;
  suggestions?: Array<string | LifeTrackRef>;
  daily?: Array<string | LifeTrackRef>;
}): { nowPlaying: string | null; suggestions: string[]; daily: string[] } {
  const spotify = asRef(opts.spotify);
  const local = asRef(opts.nowPlaying);
  const last = asRef(opts.lastPlayed);
  const display = pickDisplayedTrack(spotify, local, last);
  const blocked = [display, spotify, local, last].filter(
    (ref) => (hasTitle(ref) || Boolean(ref.id?.trim())) && (display.title || display.id) && lifeTracksMatch(ref, display),
  );

  const suggestions = take(opts.suggestions, blocked);
  const daily = take(opts.daily, [...blocked, ...suggestions.refs]);
  return {
    nowPlaying: display.title || null,
    suggestions: suggestions.titles,
    daily: daily.titles,
  };
}

type PlaybackTrack = {
  id?: string;
  uri?: string;
  name?: string;
  artists?: { name?: string }[];
};

/**
 * One current-track ref from either Spotify shape the phone actually sends:
 * Web API currently_playing (`item` + `is_playing`) or the Web Playback
 * player state (`track_window.current_track` + `paused`).
 */
export function lifeTrackFromPlayback(payload: unknown): LifeTrackRef | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as {
    is_playing?: boolean;
    paused?: boolean;
    item?: PlaybackTrack | null;
    track_window?: { current_track?: PlaybackTrack | null };
  };
  const fromApi = "item" in row || "is_playing" in row;
  const track = fromApi ? row.item : row.track_window?.current_track;
  if (!track || typeof track !== "object") return null;
  const name = track.name?.replace(/\s+/g, " ").trim();
  if (!name) return null;
  const spotifyTrack: SpotifyTrack = {
    name,
    uri: track.uri || (track.id ? `spotify:track:${track.id}` : name),
    id: track.id,
    artists: track.artists?.flatMap((artist) => (artist.name ? [{ name: artist.name }] : [])),
  };
  const title = formatSpotifyTrackTitle(spotifyTrack);
  const id = (track.uri || track.id || "").trim();
  const paused = fromApi ? row.is_playing === false : Boolean(row.paused);
  return { title, id: id || undefined, paused };
}

export type LifeMenuState = {
  tab: ShellTab;
  open: boolean;
  callActive: boolean;
};

export type LifeMenuAction =
  | { type: "select-tab"; tab: ShellTab }
  | { type: "toggle-life" }
  | { type: "outside" }
  | { type: "escape" }
  | { type: "call"; active: boolean };

export function reduceLifeMenu(state: LifeMenuState, action: LifeMenuAction): LifeMenuState {
  switch (action.type) {
    case "select-tab":
      return { tab: action.tab, open: false, callActive: state.callActive };
    case "toggle-life":
      if (state.tab !== "life" || state.callActive) {
        return { tab: "life", open: false, callActive: state.callActive };
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
