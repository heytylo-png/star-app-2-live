/**
 * Life v1 — music session only. SoT: artifacts/star-life-one-pager.txt
 *
 * Standing Life keys ride the same grok-4-latest MEMORY FACTS path as Chart
 * (filled + session on only). A LIFE instruction block is appended only on
 * a track change. Diary stays under Chart. No music login.
 */

import { detectChartIntent, localDateKey } from "./chart.ts";
import { namedPoseFromText, type EmotionId, type PoseId } from "./rai.ts";

export const LIFE_MOOD_TAGS = ["bratty", "smug", "tired", "soft"] as const;
export type LifeMoodTag = (typeof LIFE_MOOD_TAGS)[number];

export const LIFE_TINT_POSES = ["talk", "content", "smug", "tired", "wave"] as const satisfies readonly PoseId[];
export type LifeTintPose = (typeof LIFE_TINT_POSES)[number];

export const PLAYLIST_MIN = 4;
export const PLAYLIST_MAX = 8;

export type LifeSlots = {
  /** session_on — Life keys are omitted from MEMORY FACTS unless this is true. */
  on: boolean;
  now_playing?: string;
  mood_tag?: LifeMoodTag;
  /** 4–8 titles in local memory. Never recited. */
  daily_playlist?: string[];
  /** Local calendar date the playlist belongs to — not sent to Grok. */
  playlist_date?: string;
  /** Last track she already commented on — not sent to Grok. */
  commented_track?: string;
};

export type LifeTurnKind = "none" | "ask_listening" | "ask_empty" | "track_change" | "session_stop";

export type LifeTurn = {
  kind: LifeTurnKind;
  localOnly: boolean;
  nowPlaying?: string;
  playlist?: string[];
  moodTag?: LifeMoodTag;
  tintPose?: LifeTintPose;
  factsBlock?: string;
};

export type LifeAct = {
  emotion: EmotionId;
  pose?: PoseId;
  line: string;
};

const LIFE_STOP_RE =
  /\b(stop (?:listening|playing)|not playing(?: anymore)?|session over|end (?:the )?session|life session off|music(?:'s| is)? off|stop the music|done listening|turn(?: the)? music off)\b/i;

const LISTENING_ASK_RE =
  /\b(what(?:'s| is| are) (?:you|she|we) listen(?:ing)? to|what(?:'s| is) (?:on|playing)|what(?:'s| is) this (?:song|track)|now playing\??$|what song)\b/i;

const TITLE_PREFIX_RE =
  /\b(?:now playing|now playing:|i(?:'m| am) listening to|listening to|put(?:ting)? on|queue(?:ing)?|this (?:one(?:'s| is)|song(?:'s| is)|track(?:'s| is))|track:|song:|now:)\s+/i;

const LIFE_MOOD_RE = new RegExp(`\\b(${LIFE_MOOD_TAGS.join("|")})\\b`, "i");

const GREETING_RE =
  /^(hi|hey|hello|yo|sup|good morning|good evening|good night|just got here|i'?m here|morning)[.!~]*$/i;

function clip(value: string, max: number): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd();
}

function cleanToken(value: string): string {
  return value.replace(/^["'«]|["'»]+$/g, "").replace(/[.,!;:?~]+$/g, "").replace(/\s+/g, " ").trim();
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

export function isLifeMoodTag(value: unknown): value is LifeMoodTag {
  return typeof value === "string" && (LIFE_MOOD_TAGS as readonly string[]).includes(value);
}

export function isLifeStop(text: string): boolean {
  return LIFE_STOP_RE.test(text.replace(/\s+/g, " ").trim());
}

export function isListeningAsk(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return LISTENING_ASK_RE.test(t);
}

function isBarePoseCommand(text: string): boolean {
  const named = namedPoseFromText(text);
  if (named === null) return false;
  const tokens = text.trim().toLowerCase().replace(/[.!~]+$/g, "").split(/\s+/);
  return tokens.length <= 3;
}

function stripTitleJunk(raw: string): string {
  return clip(
    cleanToken(
      raw
        .replace(/\b(?:by|from)\s+[A-Z][\w'. -]{1,32}$/i, (m) => m)
        .replace(/\s+\((?:official(?: video)?|lyrics?|audio|live)\)\s*$/i, ""),
    ),
    48,
  );
}

function rejectTitle(title: string): boolean {
  if (!title) return true;
  if (/^(along|with you|it|this|that|something|music|a song|a track)$/i.test(title)) return true;
  if (/^https?:\/\//i.test(title)) return true;
  if (GREETING_RE.test(title)) return true;
  // Bare pose/kiss commands are not titles. "Super Shy" may contain "shy".
  const tokens = title.toLowerCase().split(/\s+/);
  if (tokens.length === 1 && namedPoseFromText(title) !== null) return true;
  if (
    /^(middle[\s_-]*finger|three[\s_-]*quarter.*|finger-front|point at me|turn away)$/i.test(title)
  ) {
    return true;
  }
  if (detectChartIntent(title) !== "none") return true;
  return false;
}

/** Artist - Title paste (both sides look like names, not a sentence). */
export function parseArtistTitle(text: string): string | undefined {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{2,40}?)\s+[-–—]\s+(.{2,48})$/);
  if (!m?.[1] || !m?.[2]) return undefined;
  const left = cleanToken(m[1]);
  const right = cleanToken(m[2]);
  if (!left || !right) return undefined;
  if (/^(i|i'm|im|we|they|it)$/i.test(left)) return undefined;
  if (/\b(because|since|when|if|and then)\b/i.test(t)) return undefined;
  const joined = clip(`${left} - ${right}`, 48);
  return rejectTitle(joined) ? undefined : joined;
}

export function parseQuotedTitle(text: string): string | undefined {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^["«](.+?)["»]$/) || t.match(/^'(.+?)'$/);
  if (!m?.[1]) return undefined;
  const title = stripTitleJunk(m[1]);
  return rejectTitle(title) ? undefined : title;
}

/**
 * Pull a track title from chat. Affordance-forced titles skip the
 * “looks like a title” guards (caller passes { forced: true }).
 */
export function parseTrackTitle(text: string, opts: { forced?: boolean } = {}): string | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  if (isLifeStop(cleaned) || isListeningAsk(cleaned)) return undefined;
  if (!opts.forced && isBarePoseCommand(cleaned)) return undefined;
  if (!opts.forced && detectChartIntent(cleaned) !== "none") return undefined;
  if (!opts.forced && GREETING_RE.test(cleaned)) return undefined;

  const prefixed = cleaned.match(
    new RegExp(`${TITLE_PREFIX_RE.source}(.+?)(?:[.!]|$)`, "i"),
  );
  if (prefixed?.[1]) {
    const title = stripTitleJunk(prefixed[1]);
    return rejectTitle(title) ? undefined : title;
  }

  const quoted = parseQuotedTitle(cleaned);
  if (quoted) return quoted;

  const dashed = parseArtistTitle(cleaned);
  if (dashed) return dashed;

  if (opts.forced) {
    const title = stripTitleJunk(cleaned);
    return title && !/^https?:\/\//i.test(title) ? title : undefined;
  }
  return undefined;
}

export function extractLifeMoodTag(text: string): LifeMoodTag | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const tagged = cleaned.match(
    /\b(?:mood(?: tag)?|vibe)\s*(?:is|:)?\s*(bratty|smug|tired|soft)\b/i,
  );
  if (tagged?.[1] && isLifeMoodTag(tagged[1].toLowerCase())) {
    return tagged[1].toLowerCase() as LifeMoodTag;
  }
  const feeling = cleaned.match(
    /\b(?:i(?:'m| am| feel(?:ing)?)|in a)\s+(?:really |so |pretty |kinda |kind of |a bit |a little )?(bratty|smug|tired|soft)\b/i,
  );
  if (feeling?.[1] && isLifeMoodTag(feeling[1].toLowerCase())) {
    return feeling[1].toLowerCase() as LifeMoodTag;
  }
  const lone = cleaned.match(LIFE_MOOD_RE);
  if (lone?.[1] && /mood|vibe|feeling/i.test(cleaned) && isLifeMoodTag(lone[1].toLowerCase())) {
    return lone[1].toLowerCase() as LifeMoodTag;
  }
  return undefined;
}

export function compactPlaylist(list?: string[]): string[] | undefined {
  if (!list?.length) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = clip(cleanToken(raw), 48);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (!out.length) return undefined;
  return out.slice(-PLAYLIST_MAX);
}

export function playlistForPrompt(list?: string[]): string | undefined {
  const compact = compactPlaylist(list);
  if (!compact || compact.length < PLAYLIST_MIN) return undefined;
  return compact.join(" · ");
}

export function accumulatePlaylist(
  current: string[] | undefined,
  title: string | undefined,
  today: string,
  playlistDate?: string,
): { daily_playlist?: string[]; playlist_date?: string } {
  if (playlistDate && playlistDate !== today) {
    return title ? { daily_playlist: compactPlaylist([title]), playlist_date: today } : { playlist_date: today };
  }
  const merged = compactPlaylist([...(current ?? []), ...(title ? [title] : [])]);
  return {
    daily_playlist: merged,
    playlist_date: merged ? today : playlistDate,
  };
}

/** Merge a Life patch. Stop keeps the daily playlist locally. */
export function applyLifePatch(current: LifeSlots | undefined, patch?: LifeSlots): LifeSlots | undefined {
  if (!patch) return persistLife(current);
  const today = patch.playlist_date ?? current?.playlist_date;

  if (patch.on === false) {
    const playlist = compactPlaylist(patch.daily_playlist ?? current?.daily_playlist);
    if (!playlist) return undefined;
    return {
      on: false,
      daily_playlist: playlist,
      playlist_date: today,
    };
  }

  const title = patch.now_playing?.trim() || current?.now_playing;
  const acc = accumulatePlaylist(
    compactPlaylist(patch.daily_playlist ?? current?.daily_playlist),
    patch.now_playing?.trim() && patch.now_playing !== current?.now_playing ? patch.now_playing : undefined,
    patch.playlist_date ?? current?.playlist_date ?? localDateKey(),
    current?.playlist_date,
  );

  const next: LifeSlots = {
    on: patch.on ?? current?.on ?? false,
    now_playing: title?.trim() ? clip(title, 48) : undefined,
    mood_tag: patch.mood_tag ?? current?.mood_tag,
    daily_playlist: acc.daily_playlist,
    playlist_date: acc.playlist_date,
    commented_track: patch.commented_track ?? current?.commented_track,
  };

  return persistLife(next);
}

function persistLife(life?: LifeSlots): LifeSlots | undefined {
  if (!life) return undefined;
  const playlist = compactPlaylist(life.daily_playlist);
  const now_playing = life.now_playing?.trim() ? clip(life.now_playing, 48) : undefined;
  const mood_tag = isLifeMoodTag(life.mood_tag) ? life.mood_tag : undefined;
  if (!life.on && !playlist) return undefined;
  if (!life.on) {
    return {
      on: false,
      daily_playlist: playlist,
      playlist_date: life.playlist_date,
    };
  }
  const next: LifeSlots = { on: true };
  if (now_playing) next.now_playing = now_playing;
  if (mood_tag) next.mood_tag = mood_tag;
  if (playlist) next.daily_playlist = playlist;
  if (life.playlist_date) next.playlist_date = life.playlist_date;
  if (life.commented_track) next.commented_track = life.commented_track;
  return next;
}

/** Prompt-facing Life — session off or empty → omit. */
export function compactLifeForPrompt(life?: LifeSlots): LifeSlots | undefined {
  if (!life?.on) return undefined;
  const now_playing = life.now_playing?.trim() ? clip(life.now_playing, 48) : undefined;
  const mood_tag = isLifeMoodTag(life.mood_tag) ? life.mood_tag : undefined;
  const daily_playlist =
    compactPlaylist(life.daily_playlist)?.length &&
    (compactPlaylist(life.daily_playlist)?.length ?? 0) >= PLAYLIST_MIN
      ? compactPlaylist(life.daily_playlist)
      : undefined;
  if (!now_playing && !mood_tag && !daily_playlist) {
    return { on: true };
  }
  return { on: true, now_playing, mood_tag, daily_playlist };
}

/** Lines for MEMORY FACTS (no heading). Empty when session is off. */
export function formatLifeMemoryLines(life?: LifeSlots): string[] {
  const compact = compactLifeForPrompt(life);
  if (!compact?.on) return [];
  const lines: string[] = ["session_on: true"];
  if (compact.now_playing) lines.push(`now_playing: ${compact.now_playing}`);
  const list = playlistForPrompt(compact.daily_playlist);
  if (list) lines.push(`daily_playlist: ${list}`);
  if (compact.mood_tag) lines.push(`mood_tag: ${compact.mood_tag}`);
  return lines;
}

/**
 * Compact LIFE block appended after MEMORY FACTS on grok-4-latest
 * when the track changes. Playlist is not dumped here.
 */
export function formatLifeFactsBlock(opts: {
  nowPlaying: string;
  moodTag?: LifeMoodTag;
}): string {
  const lines = ["LIFE", "session_on: true", `now_playing: ${clip(opts.nowPlaying, 48)}`];
  if (opts.moodTag) lines.push(`mood_tag: ${opts.moodTag}`);
  lines.push("");
  lines.push("One comment on this track change. Voice card length (1–2 short sentences).");
  lines.push("Prefer pose talk|content|smug|tired|wave. Never kiss.");
  lines.push("Do not recite daily_playlist. Do not announce a setlist or concert.");
  lines.push("Mood tag tints wording only — not a new personality. Do not dump her bio.");
  return lines.join("\n");
}

export function extractLifePatch(
  text: string,
  current?: LifeSlots,
  opts: { forcedTitle?: string; now?: Date } = {},
): LifeSlots | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const today = localDateKey(opts.now);
  if (opts.forcedTitle?.trim()) {
    const title = parseTrackTitle(opts.forcedTitle, { forced: true });
    if (title) {
      return {
        on: true,
        now_playing: title,
        mood_tag: extractLifeMoodTag(cleaned),
        playlist_date: today,
      };
    }
  }
  if (!cleaned) return undefined;
  if (isLifeStop(cleaned)) return { on: false };

  const title = parseTrackTitle(cleaned);
  const mood = extractLifeMoodTag(cleaned);
  const sessionOn = Boolean(current?.on) || Boolean(title);
  if (!sessionOn) return undefined;

  if (title) {
    return {
      on: true,
      now_playing: title,
      mood_tag: mood,
      playlist_date: today,
    };
  }
  if (mood) {
    return { on: true, mood_tag: mood, playlist_date: current?.playlist_date ?? today };
  }
  return undefined;
}

export function pickLifeTintPose(seed: string): LifeTintPose {
  return LIFE_TINT_POSES[hashString(seed) % LIFE_TINT_POSES.length]!;
}

export function resolveLifeTurn(input: {
  userText: string;
  before?: LifeSlots;
  after?: LifeSlots;
}): LifeTurn {
  const text = input.userText.replace(/\s+/g, " ").trim();
  if (detectChartIntent(text) !== "none") {
    return { kind: "none", localOnly: false };
  }

  const after = input.after;
  const before = input.before;
  const playlist = compactPlaylist(after?.daily_playlist ?? before?.daily_playlist);
  const nowPlaying = after?.now_playing?.trim() || undefined;
  const hasBeat = Boolean(nowPlaying || playlist?.length);

  if (isListeningAsk(text)) {
    if (hasBeat) {
      return {
        kind: "ask_listening",
        localOnly: true,
        nowPlaying,
        playlist,
        moodTag: after?.mood_tag,
        tintPose: pickLifeTintPose(nowPlaying ?? playlist?.[0] ?? "ask"),
      };
    }
    return { kind: "ask_empty", localOnly: true, tintPose: "talk" };
  }

  if (isLifeStop(text) && before?.on) {
    return { kind: "session_stop", localOnly: true, tintPose: "wave" };
  }

  const changed =
    Boolean(after?.on && nowPlaying) &&
    nowPlaying !== before?.now_playing?.trim() &&
    nowPlaying !== after?.commented_track;

  if (changed && nowPlaying) {
    const tintPose = pickLifeTintPose(nowPlaying);
    return {
      kind: "track_change",
      localOnly: false,
      nowPlaying,
      playlist,
      moodTag: after?.mood_tag,
      tintPose,
      factsBlock: formatLifeFactsBlock({
        nowPlaying,
        moodTag: after?.mood_tag,
      }),
    };
  }

  return { kind: "none", localOnly: false };
}

function clipTitleForLine(title: string): string {
  return clip(title, 32);
}

export function actForLifeTurn(turn: LifeTurn): LifeAct | null {
  const pose = turn.tintPose ?? "talk";
  const mood = turn.moodTag;
  const emotion: EmotionId = mood === "soft" || mood === "tired" || mood === "smug" || mood === "bratty" ? mood : "bratty";

  switch (turn.kind) {
    case "ask_empty":
      return {
        emotion: "bratty",
        pose: "talk",
        line: "Nothing's on. I'm not inventing a concert.",
      };
    case "ask_listening": {
      if (turn.nowPlaying) {
        return {
          emotion,
          pose,
          line: `That — ${clipTitleForLine(turn.nowPlaying)}. That's what's on~`,
        };
      }
      return {
        emotion: "smug",
        pose: "content",
        line: "A few tracks in my head. Not a setlist.",
      };
    }
    case "session_stop":
      return { emotion: "soft", pose: "wave", line: "Music's off. Chat stays~" };
    case "track_change": {
      const title = turn.nowPlaying ? clipTitleForLine(turn.nowPlaying) : "that one";
      const lines: Record<LifeTintPose, string> = {
        talk: `${title}. Yeah, that one~`,
        content: `${title}. Fine. That's on :3`,
        smug: `${title}. Taste. Don't make it a thing :3`,
        tired: `${title}. That's what's playing~`,
        wave: `${title}. Caught it. Next~`,
      };
      return { emotion, pose, line: lines[pose] ?? lines.talk };
    }
    default:
      return null;
  }
}

/** True when last_topic should skip a Life-only command. */
export function isLifeOnlyCommand(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isLifeStop(t) && t.split(/\s+/).length <= 8) return true;
  if (isListeningAsk(t)) return true;
  return false;
}
