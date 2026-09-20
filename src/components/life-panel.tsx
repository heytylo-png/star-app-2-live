import { useEffect, useState } from "react";
import { NowPlayingBar } from "@/components/now-playing-bar";
import { SpotifyLifePlayer } from "@/components/spotify-life-player";
import { Button } from "@/components/ui/button";
import { localDateKey } from "@/lib/chart";
import { clockTimeZone } from "@/lib/clock";
import { useHerMusicStore } from "@/lib/her-music-store";
import { lockHerDailyMood, requestLifeSuggestions, shouldRefreshSuggestions } from "@/lib/her-suggest";
import type { LifeSlots } from "@/lib/life";
import { useMemoryStore } from "@/lib/memory-store";
import type { SpotifyPlaybackApi } from "@/lib/use-spotify-playback";

type LifePanelProps = {
  life?: LifeSlots;
  onSetTitle: (title: string) => void;
  onStop: () => void;
  onPlayTitle: (title: string) => void;
  spotify: SpotifyPlaybackApi;
};

/**
 * Life pane — optional Spotify + paste Set/Stop + her suggestions / lists.
 * Mood tag is hers for the day (read-only). Chat stays clean.
 */
export function LifePanel({ life, onSetTitle, onStop, onPlayTitle, spotify }: LifePanelProps) {
  const sessionOn = Boolean(life?.on);
  const playlist = life?.daily_playlist ?? [];
  const mood = life?.mood_tag;
  const moodToday = Boolean(life?.mood_date && life.mood_tag);
  const suggestions = useHerMusicStore((s) => s.suggestions);
  const lists = useHerMusicStore((s) => s.lists);
  const askedDate = useHerMusicStore((s) => s.asked_date);
  const timezone = useMemoryStore((s) => s.slots.timezone);
  const [openList, setOpenList] = useState<string | null>(null);

  useEffect(() => {
    lockHerDailyMood(life);
  }, [life]);

  useEffect(() => {
    const tz = clockTimeZone(timezone);
    const today = localDateKey(new Date(), tz);
    if (!shouldRefreshSuggestions({ today, sessionOn, askedDate })) return;
    let cancelled = false;
    void requestLifeSuggestions({ today, life }).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [sessionOn, askedDate, timezone, life]);

  return (
    <section
      id="star-pane-life"
      role="tabpanel"
      aria-labelledby="star-tab-life"
      className="mx-3 mb-1 mt-auto max-h-[min(36rem,74%)] min-h-0 overflow-y-auto rounded-xl bg-elevated/88 px-4 py-3 shadow-[var(--shadow-border)] backdrop-blur-[2px] sm:mx-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xl leading-tight">Life</p>
        <p className="text-xs text-muted" aria-label="Her mood for the day">
          {moodToday && mood ? (
            <>
              Today · <span className="font-medium text-fg">{mood}</span>
            </>
          ) : (
            "Mood later"
          )}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Music only. Her mood is hers for the day — wording tint only.
      </p>

      <div className="mt-3 space-y-3">
        <SpotifyLifePlayer spotify={spotify} />
        <NowPlayingBar
          sessionOn={sessionOn}
          nowPlaying={life?.now_playing}
          moodTag={moodToday ? mood : undefined}
          onSetTitle={onSetTitle}
          onStop={onStop}
          className="mx-0 mb-0 max-w-none rounded-md bg-bg px-2 shadow-none"
        />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Her suggestion</p>
        <p className="mt-0.5 text-xs text-muted">
          {sessionOn || askedDate
            ? "Her pick for the Daily list. Playing it is a track change."
            : "On when a session is on, or when you ask her."}
        </p>
        {suggestions.length ? (
          <ul className="mt-2 space-y-2">
            {suggestions.map((row) => (
              <li key={row.title} className="rounded-md bg-bg px-2.5 py-2">
                <p className="text-sm leading-snug text-fg">{row.title}</p>
                {row.note ? <p className="mt-0.5 text-xs text-muted">{row.note}</p> : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 -ml-2"
                  disabled={spotify.busy}
                  onClick={() => onPlayTitle(row.title)}
                >
                  Play suggestion
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Quiet. Ask her, or start a session.</p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Daily list</p>
        {playlist.length ? (
          <ul className="mt-1.5 space-y-1">
            {playlist.map((title) => (
              <li key={title} className="truncate text-sm text-muted">
                {title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">Quiet for now. She does not recite this.</p>
        )}
        <p className="mt-1 text-[0.65rem] text-subtle">
          {playlist.length} stored · never announced
        </p>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Her lists</p>
        <p className="mt-0.5 text-xs text-muted">
          Hers. Titles only. Play still goes through Spotify if connected.
        </p>
        <ul className="mt-2 space-y-2">
          {lists.map((list) => {
            const open = openList === list.id;
            return (
              <li key={list.id} className="rounded-md bg-bg px-2.5 py-2">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenList(open ? null : list.id)}
                  className="flex w-full items-baseline justify-between gap-2 text-left"
                >
                  <span className="font-medium text-sm text-fg">{list.name}</span>
                  <span className="text-[0.65rem] text-subtle">{list.tracks.length}</span>
                </button>
                {open ? (
                  <ul className="mt-2 space-y-1.5">
                    {list.tracks.map((title) => (
                      <li key={title} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm text-muted">{title}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={spotify.busy}
                          onClick={() => onPlayTitle(title)}
                        >
                          Play
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
