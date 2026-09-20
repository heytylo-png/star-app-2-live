import { NowPlayingBar } from "@/components/now-playing-bar";
import { SpotifyLifePlayer } from "@/components/spotify-life-player";
import { LIFE_MOOD_TAGS, type LifeMoodTag, type LifeSlots } from "@/lib/life";
import { useMemoryStore } from "@/lib/memory-store";
import type { SpotifyPlaybackApi } from "@/lib/use-spotify-playback";
import { cn } from "@/lib/utils";

type LifePanelProps = {
  life?: LifeSlots;
  onSetTitle: (title: string) => void;
  onStop: () => void;
  spotify: SpotifyPlaybackApi;
};

/**
 * Life pane — optional Spotify + paste Set/Stop + quiet daily list + mood tag.
 * Login never required. Comments still land in Chat, not here.
 */
export function LifePanel({ life, onSetTitle, onStop, spotify }: LifePanelProps) {
  const sessionOn = Boolean(life?.on);
  const playlist = life?.daily_playlist ?? [];
  const mood = life?.mood_tag;

  function setMood(tag: LifeMoodTag) {
    if (!sessionOn) return;
    useMemoryStore.getState().patchSlots({
      life: { on: true, mood_tag: tag },
    });
  }

  return (
    <section
      id="star-pane-life"
      role="tabpanel"
      aria-labelledby="star-tab-life"
      className="mx-3 mb-1 mt-auto max-h-[min(32rem,68%)] min-h-0 overflow-y-auto rounded-xl bg-elevated/88 px-4 py-3 shadow-[var(--shadow-border)] backdrop-blur-[2px] sm:mx-4"
    >
      <p className="font-display text-xl leading-tight">Life</p>
      <p className="mt-0.5 text-xs text-muted">
        Music only. Connect Spotify or paste a title. Session stays on in the background.
      </p>

      <div className="mt-3 space-y-3">
        <SpotifyLifePlayer spotify={spotify} />
        <NowPlayingBar
          sessionOn={sessionOn}
          nowPlaying={life?.now_playing}
          moodTag={mood}
          onSetTitle={onSetTitle}
          onStop={onStop}
          className="mx-0 mb-0 max-w-none rounded-md bg-bg px-2 shadow-none"
        />
      </div>

      <div className="mt-1">
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
        <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Mood tag</p>
        <p className="mt-0.5 text-xs text-muted">
          {sessionOn ? "Tints wording only." : "On after Set — not a new personality."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {LIFE_MOOD_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              disabled={!sessionOn}
              aria-pressed={mood === tag}
              onClick={() => setMood(tag)}
              className={cn(
                "h-8 rounded-full px-3 text-xs shadow-[var(--shadow-border)] transition-colors duration-150",
                mood === tag ? "bg-fg text-accent-fg" : "bg-bg text-muted hover:text-fg",
                !sessionOn && "opacity-40",
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
