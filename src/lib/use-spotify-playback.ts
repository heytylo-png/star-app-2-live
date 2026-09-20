import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginSpotifyLogin,
  clearSpotifyTokens,
  consumeSpotifyRedirect,
  fetchSpotifyMe,
  formatSpotifyTrackTitle,
  isSpotifyPremium,
  playSpotifyUris,
  premiumRequiredMessage,
  readSpotifyTokens,
  searchSpotifyTracks,
  SPOTIFY_SETUP_HINT,
  spotifyClientIdMissing,
  transferSpotifyPlayback,
  type SpotifyMe,
  type SpotifyTrack,
} from "./spotify.ts";
import {
  connectSpotifyPlayer,
  disconnectSpotifyPlayer,
  getSpotifyDeviceId,
  toggleSpotifyPlay,
  trackIdentity,
  type SpotifyPlayerState,
} from "./spotify-player.ts";

export type SpotifyPlaybackState = {
  clientIdMissing: boolean;
  setupHint: string;
  connected: boolean;
  connecting: boolean;
  displayName: string;
  premium: boolean;
  premiumMessage: string | null;
  error: string | null;
  deviceId: string | null;
  paused: boolean;
  title: string;
  busy: boolean;
  justConnected: boolean;
};

const EMPTY: SpotifyPlaybackState = {
  clientIdMissing: true,
  setupHint: SPOTIFY_SETUP_HINT,
  connected: false,
  connecting: false,
  displayName: "",
  premium: false,
  premiumMessage: null,
  error: null,
  deviceId: null,
  paused: true,
  title: "",
  busy: false,
  justConnected: false,
};

export function useSpotifyPlayback(opts: { onTrackChange?: (title: string) => void } = {}) {
  const onTrackChangeRef = useRef(opts.onTrackChange);
  useEffect(() => {
    onTrackChangeRef.current = opts.onTrackChange;
  }, [opts.onTrackChange]);
  const lastTrackRef = useRef("");
  const [state, setState] = useState<SpotifyPlaybackState>(() => ({
    ...EMPTY,
    clientIdMissing: spotifyClientIdMissing(),
    connected: Boolean(readSpotifyTokens()),
  }));

  const applyMe = useCallback((me: SpotifyMe | null, extra: Partial<SpotifyPlaybackState> = {}) => {
    const premium = isSpotifyPremium(me);
    setState((s) => ({
      ...s,
      connected: Boolean(me),
      displayName: me?.display_name || me?.id || "",
      premium,
      premiumMessage: premium
        ? null
        : "Spotify Premium is required for in-browser playback. Free-tier accounts can still paste a title on Life.",
      ...extra,
    }));
    return premium;
  }, []);

  const hydrate = useCallback(async () => {
    if (!readSpotifyTokens()) {
      setState((s) => ({
        ...s,
        clientIdMissing: spotifyClientIdMissing(),
        connected: false,
        displayName: "",
        premium: false,
        deviceId: null,
        title: "",
      }));
      return;
    }
    try {
      const me = await fetchSpotifyMe();
      const premium = applyMe(me, { error: null, connecting: false });
      if (!premium) return;
      await connectSpotifyPlayer({
        onReady: (deviceId) => {
          setState((s) => ({ ...s, deviceId, error: null }));
        },
        onState: (playerState: SpotifyPlayerState | null) => {
          if (!playerState) return;
          const track = playerState.track_window.current_track;
          const title = track ? formatSpotifyTrackTitle(track) : "";
          const id = trackIdentity(track);
          setState((s) => ({
            ...s,
            paused: playerState.paused,
            title: title || s.title,
          }));
          if (id && id !== lastTrackRef.current && title) {
            lastTrackRef.current = id;
            onTrackChangeRef.current?.(title);
          }
        },
        onAccountError: (message) => {
          setState((s) => ({
            ...s,
            premium: false,
            premiumMessage: premiumRequiredMessage(new Error(message)) ?? message,
          }));
        },
        onError: (message) => {
          setState((s) => ({ ...s, error: message }));
        },
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        connected: Boolean(readSpotifyTokens()),
        error: err instanceof Error ? err.message : "Spotify is unavailable.",
        connecting: false,
      }));
    }
  }, [applyMe]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const redirect = await consumeSpotifyRedirect();
      if (cancelled) return;
      if (redirect.consumed && !redirect.ok) {
        setState((s) => ({ ...s, error: redirect.error, connecting: false }));
      }
      if (redirect.consumed && redirect.ok) {
        setState((s) => ({ ...s, connected: true, error: null, justConnected: true }));
      }
      await hydrate();
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    const result = await beginSpotifyLogin({
      assign: (url) => {
        window.location.assign(url);
      },
    });
    if (!result.ok) {
      setState((s) => ({
        ...s,
        connecting: false,
        clientIdMissing: result.reason === "missing_client_id" || spotifyClientIdMissing(),
        error:
          result.reason === "missing_client_id"
            ? SPOTIFY_SETUP_HINT
            : "Could not start Spotify login. Try again.",
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectSpotifyPlayer();
    clearSpotifyTokens();
    lastTrackRef.current = "";
    setState({
      ...EMPTY,
      clientIdMissing: spotifyClientIdMissing(),
      connected: false,
    });
  }, []);

  const togglePlay = useCallback(async () => {
    if (!state.premium) return;
    setState((s) => ({ ...s, busy: true }));
    await toggleSpotifyPlay();
    setState((s) => ({ ...s, busy: false }));
  }, [state.premium]);

  const transfer = useCallback(async () => {
    const deviceId = state.deviceId || getSpotifyDeviceId();
    if (!deviceId || !state.premium) return;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await transferSpotifyPlayback(deviceId, true);
    } catch (err) {
      setState((s) => ({
        ...s,
        error: premiumRequiredMessage(err) ?? (err instanceof Error ? err.message : "Transfer failed."),
      }));
    } finally {
      setState((s) => ({ ...s, busy: false }));
    }
  }, [state.deviceId, state.premium]);

  const clearJustConnected = useCallback(() => {
    setState((s) => ({ ...s, justConnected: false }));
  }, []);

  const playQuery = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!q || !state.premium) return;
      const deviceId = state.deviceId || getSpotifyDeviceId();
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const tracks: SpotifyTrack[] = await searchSpotifyTracks(q);
        const first = tracks[0];
        if (!first) {
          setState((s) => ({ ...s, busy: false, error: "No Spotify tracks for that search." }));
          return;
        }
        if (!deviceId) {
          onTrackChangeRef.current?.(formatSpotifyTrackTitle(first));
          setState((s) => ({
            ...s,
            busy: false,
            title: formatSpotifyTrackTitle(first),
            error: "Player is still waking up. Title is set — tap Transfer when the device is ready.",
          }));
          return;
        }
        await playSpotifyUris(deviceId, [first.uri]);
        setState((s) => ({ ...s, title: formatSpotifyTrackTitle(first) }));
      } catch (err) {
        setState((s) => ({
          ...s,
          error: premiumRequiredMessage(err) ?? (err instanceof Error ? err.message : "Search play failed."),
        }));
      } finally {
        setState((s) => ({ ...s, busy: false }));
      }
    },
    [state.deviceId, state.premium],
  );

  return {
    ...state,
    connect,
    disconnect,
    togglePlay,
    transfer,
    playQuery,
    clearJustConnected,
  };
}

export type SpotifyPlaybackApi = ReturnType<typeof useSpotifyPlayback>;
