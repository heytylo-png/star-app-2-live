import { useState } from "react";
import { Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SpotifyPlaybackApi } from "@/lib/use-spotify-playback";

type SpotifyLifePlayerProps = {
  spotify: SpotifyPlaybackApi;
};

/**
 * Life-tab Spotify chrome only. Chat stays clean.
 * Fail soft: missing Client ID still shows Connect + setup hint.
 */
export function SpotifyLifePlayer({ spotify }: SpotifyLifePlayerProps) {
  const [query, setQuery] = useState("");

  return (
    <div className="rounded-md bg-bg px-3 py-2.5">
      <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Spotify</p>
      <p className="mt-0.5 text-xs text-muted">
        Optional. Web Playback needs Premium. Chat is never blocked.
      </p>

      {!spotify.connected ? (
        <div className="mt-2 space-y-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void spotify.connect()}
            disabled={spotify.connecting}
          >
            {spotify.connecting ? "Connecting…" : "Connect Spotify"}
          </Button>
          {spotify.clientIdMissing || spotify.error === spotify.setupHint ? (
            <p className="text-xs leading-relaxed text-muted">{spotify.setupHint}</p>
          ) : spotify.error ? (
            <p className="text-xs leading-relaxed text-danger">{spotify.error}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-muted">
              {spotify.displayName ? (
                <>
                  <span className="text-fg">{spotify.displayName}</span>
                  {spotify.premium ? " · Premium" : " · Free"}
                </>
              ) : (
                "Connected"
              )}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={spotify.disconnect}>
              Disconnect
            </Button>
          </div>

          {spotify.premiumMessage ? (
            <p role="status" className="text-xs leading-relaxed text-danger">
              {spotify.premiumMessage}
            </p>
          ) : null}

          {spotify.premium ? (
            <>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={spotify.paused ? "Play" : "Pause"}
                  onClick={() => void spotify.togglePlay()}
                  disabled={spotify.busy}
                >
                  {spotify.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </Button>
                <p className="min-w-0 flex-1 truncate text-sm text-fg">
                  {spotify.title || "Nothing on this device yet"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void spotify.transfer()}
                  disabled={spotify.busy || !spotify.deviceId}
                >
                  Transfer
                </Button>
              </div>

              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = query.trim();
                  if (!next) return;
                  void spotify.playQuery(next);
                  setQuery("");
                }}
              >
                <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
                <input
                  type="search"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Search Spotify"
                  placeholder="Search and play"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
                />
                <Button type="submit" variant="ghost" size="sm" disabled={!query.trim() || spotify.busy}>
                  Play
                </Button>
              </form>
            </>
          ) : null}

          {spotify.error && spotify.error !== spotify.premiumMessage ? (
            <p className="text-xs leading-relaxed text-danger">{spotify.error}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
