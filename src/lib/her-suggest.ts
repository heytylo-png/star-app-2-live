/**
 * Life pane suggestions — local catalog first, optional Grok once per local day.
 * Never posts to Chat. Fail soft. $0 / offline when there is no key.
 */

import { localDateKey } from "./chart.ts";
import { clockTimeZone, readLocalNow } from "./clock.ts";
import { getStoredXaiKey, streamGrok } from "./grok.ts";
import {
  applySuggestionGrokRaw,
  formatSuggestFactsBlock,
  pickLocalSuggestions,
  shouldRefreshSuggestions,
  type LifeSuggestion,
} from "./her-music.ts";
import { useHerMusicStore } from "./her-music-store.ts";
import { herDailyMoodPatch, type LifeMoodTag, type LifeSlots } from "./life.ts";
import { useMemoryStore } from "./memory-store.ts";
import { computeSkyFacts } from "./sky.ts";

const SUGGEST_ASK = "Life/suggest";

const inflight = new Map<string, Promise<LifeSuggestion[]>>();

export function localLifeSuggestions(opts: {
  today: string;
  life?: LifeSlots;
  lists?: ReturnType<typeof useHerMusicStore.getState>["lists"];
}): LifeSuggestion[] {
  return pickLocalSuggestions({
    today: opts.today,
    mood: opts.life?.mood_tag,
    lists: opts.lists ?? useHerMusicStore.getState().lists,
    avoid: [
      ...(opts.life?.daily_playlist ?? []),
      ...(opts.life?.now_playing ? [opts.life.now_playing] : []),
    ],
  });
}

/**
 * Local immediately. If an xAI key exists, try the same Grok path with a
 * Life/suggest ask. Fail / CORS / timeout / empty → local.
 */
export async function requestLifeSuggestions(opts: {
  today: string;
  life?: LifeSlots;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<LifeSuggestion[]> {
  const store = useHerMusicStore.getState();
  if (
    !opts.force &&
    store.suggestion_date === opts.today &&
    store.suggestions.length
  ) {
    return store.suggestions;
  }

  const local = localLifeSuggestions({
    today: opts.today,
    life: opts.life,
    lists: store.lists,
  });
  store.saveSuggestions(opts.today, local);
  if (!getStoredXaiKey()) return local;

  const key = `${opts.today}:${opts.force ? "ask" : "day"}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = (async () => {
    try {
      let raw = "";
      await streamGrok(
        {
          messages: [{ role: "user", content: SUGGEST_ASK }],
          systemExtra: formatSuggestFactsBlock({
            today: opts.today,
            life: opts.life,
            lists: store.lists,
          }),
        },
        (delta) => {
          raw += delta;
        },
        opts.signal,
      );
      const next = applySuggestionGrokRaw(raw, local);
      useHerMusicStore.getState().saveSuggestions(opts.today, next);
      return next;
    } catch {
      return local;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, pending);
  return pending;
}

export { shouldRefreshSuggestions };

export function moodForAdopt(life?: LifeSlots): LifeMoodTag | undefined {
  return life?.mood_tag;
}

/** Lock her mood tag once for the local day. Safe to call often. */
export function lockHerDailyMood(life?: LifeSlots, fromMusicComment = false): string {
  const mem = useMemoryStore.getState();
  const tz = clockTimeZone(mem.slots.timezone);
  const today = localDateKey(new Date(), tz);
  const patch = herDailyMoodPatch({
    life: life ?? mem.slots.life,
    today,
    band: readLocalNow(new Date(), tz).band,
    sky: computeSkyFacts(),
    chatMood: mem.slots.mood,
    lastTopic: mem.slots.last_topic,
    fromMusicComment,
  });
  if (patch) mem.patchSlots({ life: patch });
  return today;
}
