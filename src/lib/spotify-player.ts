/**
 * Spotify Web Playback SDK loader + singleton player.
 * Fail soft: missing SDK / token / Premium never throws into Chat.
 */

import {
  SPOTIFY_SDK_URL,
  formatSpotifyTrackTitle,
  getValidAccessToken,
  type SpotifyTrack,
} from "./spotify.ts";

export type SpotifySdkPlayer = {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  addListener: (event: string, cb: (payload: never) => void) => boolean;
  removeListener: (event: string, cb?: (payload: never) => void) => boolean;
};

export type SpotifyPlayerState = {
  paused: boolean;
  track_window: {
    current_track: SpotifyTrack | null;
  };
};

type SpotifyNamespace = {
  Player: new (opts: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifySdkPlayer;
};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: SpotifyNamespace;
  }
}

type ReadyPayload = { device_id: string };

let sdkPromise: Promise<SpotifyNamespace | null> | null = null;
let player: SpotifySdkPlayer | null = null;
let lastDeviceId: string | null = null;

export function getSpotifyDeviceId(): string | null {
  return lastDeviceId;
}

export function getSpotifyPlayer(): SpotifySdkPlayer | null {
  return player;
}

export function loadSpotifySdk(loadScript: (src: string) => Promise<void> = injectScript): Promise<SpotifyNamespace | null> {
  if (typeof window !== "undefined" && window.Spotify?.Player) {
    return Promise.resolve(window.Spotify);
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const finish = () => resolve(window.Spotify ?? null);
    const previous = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      previous?.();
      finish();
    };
    if (window.Spotify?.Player) {
      finish();
      return;
    }
    loadScript(SPOTIFY_SDK_URL).catch(() => resolve(null));
    window.setTimeout(() => {
      if (window.Spotify?.Player) finish();
    }, 50);
  });
  return sdkPromise;
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Spotify SDK failed to load."));
    document.head.appendChild(el);
  });
}

export type SpotifyPlayerHandlers = {
  onReady?: (deviceId: string) => void;
  onState?: (state: SpotifyPlayerState | null) => void;
  onError?: (message: string) => void;
  onAccountError?: (message: string) => void;
};

export async function connectSpotifyPlayer(handlers: SpotifyPlayerHandlers = {}): Promise<string | null> {
  const sdk = await loadSpotifySdk();
  if (!sdk?.Player) return null;
  if (player && lastDeviceId) {
    handlers.onReady?.(lastDeviceId);
    return lastDeviceId;
  }

  const next = new sdk.Player({
    name: "Star Rai Life",
    volume: 0.7,
    getOAuthToken: (cb) => {
      void getValidAccessToken()
        .then((token) => {
          if (token) cb(token);
        })
        .catch(() => {
          /* fail soft */
        });
    },
  });

  next.addListener("ready", ((payload: ReadyPayload) => {
    lastDeviceId = payload.device_id;
    handlers.onReady?.(payload.device_id);
  }) as (payload: never) => void);

  next.addListener("not_ready", (() => {
    lastDeviceId = null;
  }) as (payload: never) => void);

  next.addListener("player_state_changed", ((state: SpotifyPlayerState | null) => {
    handlers.onState?.(state);
  }) as (payload: never) => void);

  next.addListener("initialization_error", ((e: { message?: string }) => {
    handlers.onError?.(e.message || "Spotify player failed to start.");
  }) as (payload: never) => void);
  next.addListener("authentication_error", ((e: { message?: string }) => {
    handlers.onError?.(e.message || "Spotify authentication expired.");
  }) as (payload: never) => void);
  next.addListener("account_error", ((e: { message?: string }) => {
    handlers.onAccountError?.(
      e.message || "Spotify Premium is required for in-browser playback.",
    );
  }) as (payload: never) => void);
  next.addListener("playback_error", ((e: { message?: string }) => {
    handlers.onError?.(e.message || "Spotify could not play that track.");
  }) as (payload: never) => void);

  const ok = await next.connect().catch(() => false);
  if (!ok) {
    handlers.onError?.("Spotify player did not connect. Playback stays off.");
    return null;
  }
  player = next;
  return lastDeviceId;
}

export function disconnectSpotifyPlayer(): void {
  try {
    player?.disconnect();
  } catch {
    /* ignore */
  }
  player = null;
  lastDeviceId = null;
}

export async function toggleSpotifyPlay(): Promise<void> {
  if (!player) return;
  await player.togglePlay().catch(() => {
    /* fail soft */
  });
}

export function trackIdentity(track: SpotifyTrack | null | undefined): string {
  if (!track) return "";
  return track.uri || track.id || formatSpotifyTrackTitle(track);
}
