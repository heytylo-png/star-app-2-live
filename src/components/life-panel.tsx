import { useEffect, useRef, type RefObject } from "react";
import { NowPlayingBar } from "@/components/now-playing-bar";
import { Button } from "@/components/ui/button";
import { localDateKey } from "@/lib/chart";
import { clockTimeZone } from "@/lib/clock";
import { useHerMusicStore } from "@/lib/her-music-store";
import { lockHerDailyMood, requestLifeSuggestions, shouldRefreshSuggestions } from "@/lib/her-suggest";
import { showLifeConnectMusic, type LifeSlots } from "@/lib/life";
import { useMemoryStore } from "@/lib/memory-store";
import type { SpotifyPlaybackApi } from "@/lib/use-spotify-playback";

type LifeMenuProps = {
  open: boolean;
  life?: LifeSlots;
  onStop: () => void;
  onPlayTitle: (title: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
  spotify: SpotifyPlaybackApi;
};

/**
 * Compact Life menu anchored to the Life tab.
 * The desk clip stays full-bleed behind it. Not a sheet.
 */
export function LifeMenu({ open, life, onStop, onPlayTitle, onClose, anchorRef, spotify }: LifeMenuProps) {
  const sessionOn = Boolean(life?.on);
  const playlist = life?.daily_playlist ?? [];
  const mood = life?.mood_tag;
  const moodToday = Boolean(life?.mood_date && life.mood_tag);
  const suggestions = useHerMusicStore((s) => s.suggestions);
  const askedDate = useHerMusicStore((s) => s.asked_date);
  const timezone = useMemoryStore((s) => s.slots.timezone);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      if (anchorRef?.current?.contains(node)) return;
      event.preventDefault();
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef]);

  if (!open) return null;

  return (
    <div
      id="star-life-menu"
      role="region"
      aria-labelledby="star-tab-life"
      className="life-menu"
    >
      <NowPlayingBar
        sessionOn={sessionOn}
        nowPlaying={life?.now_playing}
        onStop={onStop}
        className="mx-0 mb-1.5 max-w-none rounded-sm bg-bg px-2 py-1.5 shadow-none"
      />

      <p className="px-0.5 text-xs text-muted" aria-label="Her mood for the day">
        Today · <span className="font-medium text-fg">{moodToday && mood ? mood : "later"}</span>
      </p>

      {showLifeConnectMusic({
        connected: spotify.connected,
        sessionOn,
        nowPlaying: life?.now_playing,
      }) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-8 w-full justify-start px-1.5 text-xs"
          disabled={spotify.connecting}
          onClick={() => void spotify.connect()}
        >
          {spotify.connecting ? "Connecting…" : "Connect music"}
        </Button>
      ) : null}

      <div className="mt-2 border-t border-border pt-1.5">
        <p className="px-0.5 text-[0.65rem] tracking-wide text-subtle uppercase">Her suggestion</p>
        {suggestions.length ? (
          <ul className="mt-1 space-y-0.5">
            {suggestions.map((row) => (
              <li key={row.title}>
                <button
                  type="button"
                  className="w-full truncate rounded-sm px-1.5 py-1 text-left text-sm text-fg hover:bg-bg disabled:opacity-40"
                  disabled={spotify.busy}
                  onClick={() => onPlayTitle(row.title)}
                >
                  {row.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1.5 py-1 text-sm text-muted">Quiet</p>
        )}
      </div>

      <div className="mt-1.5 border-t border-border pt-1.5">
        <p className="px-0.5 text-[0.65rem] tracking-wide text-subtle uppercase">Daily</p>
        {playlist.length ? (
          <ul className="mt-1 space-y-0.5">
            {playlist.map((title) => (
              <li key={title} className="truncate px-1.5 text-sm text-muted">
                {title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1.5 py-1 text-sm text-muted">Quiet</p>
        )}
      </div>
    </div>
  );
}
