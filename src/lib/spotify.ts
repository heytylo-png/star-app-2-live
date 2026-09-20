/**
 * Spotify Web Playback — Authorization Code with PKCE (SPA-safe).
 * Client ID from VITE_SPOTIFY_CLIENT_ID only. Never a client secret.
 * Tokens live in localStorage / sessionStorage. Fail soft if unset.
 */

export const SPOTIFY_TOKEN_STORAGE = "star-rai-spotify";
export const SPOTIFY_PKCE_STORAGE = "star-rai-spotify-pkce";

export const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_URL = "https://api.spotify.com/v1";
export const SPOTIFY_SDK_URL = "https://sdk.scdn.co/spotify-player.js";

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
] as const;

export const SPOTIFY_PAGES_REDIRECT = "https://heytylo-png.github.io/star-app-2-live/";
export const SPOTIFY_LOCALHOST_REDIRECT = "http://localhost:5173/star-app-2-live/";
export const SPOTIFY_LOCALHOST_IP_REDIRECT = "http://127.0.0.1:5173/star-app-2-live/";

const TITLE_MAX = 48;
const VERIFIER_LENGTH = 64;
const REFRESH_SKEW_MS = 60_000;

export type SpotifyTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type?: string;
};

export type SpotifyPkcePending = {
  verifier: string;
  state: string;
  redirectUri: string;
};

export type SpotifyMe = {
  id: string;
  display_name?: string;
  product?: string;
};

export type SpotifyTrack = {
  id?: string;
  uri: string;
  name: string;
  artists?: { name: string }[];
};

export type SpotifyCallbackResult =
  | { consumed: false }
  | { consumed: true; ok: true }
  | { consumed: true; ok: false; error: string };

export type SpotifyLoginResult =
  | { ok: true; url: string }
  | { ok: false; reason: "missing_client_id" | "storage" };

export type SpotifyStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function readViteEnv(): { VITE_SPOTIFY_CLIENT_ID?: string; BASE_URL?: string } {
  try {
    return (import.meta.env ?? {}) as { VITE_SPOTIFY_CLIENT_ID?: string; BASE_URL?: string };
  } catch {
    return {};
  }
}

export function spotifyClientId(env: { VITE_SPOTIFY_CLIENT_ID?: string } = readViteEnv()): string {
  const raw = env.VITE_SPOTIFY_CLIENT_ID;
  return typeof raw === "string" ? raw.trim() : "";
}

export function spotifyClientIdMissing(env?: { VITE_SPOTIFY_CLIENT_ID?: string }): boolean {
  return !spotifyClientId(env);
}

/** Exact redirect URI for this origin + Vite base (trailing slash). */
export function spotifyRedirectUri(opts: {
  origin?: string;
  base?: string;
} = {}): string {
  const origin =
    opts.origin ??
    (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost:5173");
  const envBase = readViteEnv().BASE_URL;
  const raw = opts.base ?? (typeof envBase === "string" && envBase ? envBase : "/star-app-2-live/");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const suffix = path.endsWith("/") ? path : `${path}/`;
  return `${origin.replace(/\/$/, "")}${suffix}`;
}

export function recommendedSpotifyRedirects(): string[] {
  return [SPOTIFY_PAGES_REDIRECT, SPOTIFY_LOCALHOST_REDIRECT, SPOTIFY_LOCALHOST_IP_REDIRECT];
}

export function randomUrlSafe(length = VERIFIER_LENGTH, bytes?: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const buf = bytes ?? crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[buf[i % buf.length]! % alphabet.length];
  }
  return out;
}

export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : bytesToBase64(view);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToBase64(view: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < view.length; i += 3) {
    const a = view[i] ?? 0;
    const b = i + 1 < view.length ? view[i + 1]! : undefined;
    const c = i + 2 < view.length ? view[i + 2]! : undefined;
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += chars[(triple >> 18) & 63];
    out += chars[(triple >> 12) & 63];
    out += b === undefined ? "=" : chars[(triple >> 6) & 63];
    out += c === undefined ? "=" : chars[triple & 63];
  }
  return out;
}

export async function sha256Base64Url(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string; state: string }> {
  const verifier = randomUrlSafe(VERIFIER_LENGTH);
  const state = randomUrlSafe(32);
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge, state };
}

function memoryStorage(): SpotifyStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function localStore(): SpotifyStorage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* private mode */
  }
  return memoryStorage();
}

export function sessionStore(): SpotifyStorage {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    /* private mode */
  }
  return memoryStorage();
}

export function readSpotifyTokens(storage: SpotifyStorage = localStore()): SpotifyTokens | null {
  try {
    const raw = storage.getItem(SPOTIFY_TOKEN_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifyTokens>;
    if (typeof parsed.access_token !== "string" || !parsed.access_token.trim()) return null;
    if (typeof parsed.expires_at !== "number") return null;
    return {
      access_token: parsed.access_token,
      refresh_token: typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined,
      expires_at: parsed.expires_at,
      token_type: typeof parsed.token_type === "string" ? parsed.token_type : undefined,
    };
  } catch {
    return null;
  }
}

export function writeSpotifyTokens(tokens: SpotifyTokens, storage: SpotifyStorage = localStore()): void {
  try {
    storage.setItem(SPOTIFY_TOKEN_STORAGE, JSON.stringify(tokens));
  } catch {
    /* quota / private */
  }
}

export function clearSpotifyTokens(
  local: SpotifyStorage = localStore(),
  session: SpotifyStorage = sessionStore(),
): void {
  try {
    local.removeItem(SPOTIFY_TOKEN_STORAGE);
  } catch {
    /* ignore */
  }
  try {
    session.removeItem(SPOTIFY_PKCE_STORAGE);
  } catch {
    /* ignore */
  }
}

export function readPkcePending(storage: SpotifyStorage = sessionStore()): SpotifyPkcePending | null {
  try {
    const raw = storage.getItem(SPOTIFY_PKCE_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifyPkcePending>;
    if (!parsed.verifier || !parsed.state || !parsed.redirectUri) return null;
    return { verifier: parsed.verifier, state: parsed.state, redirectUri: parsed.redirectUri };
  } catch {
    return null;
  }
}

export function writePkcePending(pending: SpotifyPkcePending, storage: SpotifyStorage = sessionStore()): void {
  try {
    storage.setItem(SPOTIFY_PKCE_STORAGE, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
}

export function tokensNeedRefresh(tokens: SpotifyTokens, now = Date.now()): boolean {
  return tokens.expires_at - REFRESH_SKEW_MS <= now;
}

export function clipSpotifyTitle(value: string, max = TITLE_MAX): string {
  const t = value.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trimEnd();
}

/** Life-facing title — same "Artist - Title" shape paste already understands. */
export function formatSpotifyTrackTitle(track: Pick<SpotifyTrack, "name" | "artists">): string {
  const name = track.name?.replace(/\s+/g, " ").trim() || "Unknown track";
  const artist = track.artists?.[0]?.name?.replace(/\s+/g, " ").trim();
  return clipSpotifyTitle(artist ? `${artist} - ${name}` : name);
}

export function isSpotifyPremium(me: Pick<SpotifyMe, "product"> | null | undefined): boolean {
  return me?.product?.toLowerCase() === "premium";
}

export function parseSpotifyCallback(search: string): {
  code?: string;
  state?: string;
  error?: string;
} {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  const code = params.get("code")?.trim() || undefined;
  const state = params.get("state")?.trim() || undefined;
  const error = params.get("error")?.trim() || undefined;
  return { code, state, error };
}

export function stripSpotifyCallbackParams(href: string): string {
  try {
    const url = new URL(href, "https://heytylo-png.github.io");
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

export function buildSpotifyAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    code_challenge_method: "S256",
    code_challenge: opts.challenge,
    state: opts.state,
    scope: (opts.scopes ?? SPOTIFY_SCOPES).join(" "),
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export async function beginSpotifyLogin(opts: {
  env?: { VITE_SPOTIFY_CLIENT_ID?: string };
  origin?: string;
  base?: string;
  session?: SpotifyStorage;
  assign?: (url: string) => void;
}): Promise<SpotifyLoginResult> {
  const clientId = spotifyClientId(opts.env);
  if (!clientId) return { ok: false, reason: "missing_client_id" };
  try {
    const { verifier, challenge, state } = await createPkcePair();
    const redirectUri = spotifyRedirectUri({ origin: opts.origin, base: opts.base });
    writePkcePending({ verifier, state, redirectUri }, opts.session ?? sessionStore());
    const url = buildSpotifyAuthorizeUrl({ clientId, redirectUri, challenge, state });
    opts.assign?.(url);
    return { ok: true, url };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

async function postToken(
  body: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<SpotifyTokens> {
  const res = await fetchImpl(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Spotify token HTTP ${res.status}`);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + Math.max(30, json.expires_in ?? 3600) * 1000,
    token_type: json.token_type,
  };
}

export async function exchangeSpotifyCode(opts: {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  fetchImpl?: typeof fetch;
}): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.verifier,
  });
  return postToken(body, opts.fetchImpl);
}

export async function refreshSpotifyToken(opts: {
  refreshToken: string;
  clientId: string;
  fetchImpl?: typeof fetch;
}): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });
  const next = await postToken(body, opts.fetchImpl);
  return {
    ...next,
    refresh_token: next.refresh_token || opts.refreshToken,
  };
}

export async function getValidAccessToken(opts: {
  env?: { VITE_SPOTIFY_CLIENT_ID?: string };
  local?: SpotifyStorage;
  fetchImpl?: typeof fetch;
  now?: number;
} = {}): Promise<string | null> {
  const clientId = spotifyClientId(opts.env);
  const local = opts.local ?? localStore();
  const tokens = readSpotifyTokens(local);
  if (!tokens) return null;
  if (!tokensNeedRefresh(tokens, opts.now ?? Date.now())) return tokens.access_token;
  if (!tokens.refresh_token || !clientId) return tokens.access_token;
  try {
    const next = await refreshSpotifyToken({
      refreshToken: tokens.refresh_token,
      clientId,
      fetchImpl: opts.fetchImpl,
    });
    writeSpotifyTokens(next, local);
    return next.access_token;
  } catch {
    return tokens.access_token;
  }
}

export async function consumeSpotifyRedirect(opts: {
  search?: string;
  href?: string;
  env?: { VITE_SPOTIFY_CLIENT_ID?: string };
  local?: SpotifyStorage;
  session?: SpotifyStorage;
  fetchImpl?: typeof fetch;
  replaceUrl?: (path: string) => void;
} = {}): Promise<SpotifyCallbackResult> {
  const search =
    opts.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const parsed = parseSpotifyCallback(search);
  if (!parsed.code && !parsed.error) return { consumed: false };

  const clean =
    opts.href ??
    (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}${window.location.hash}` : "/");
  opts.replaceUrl?.(stripSpotifyCallbackParams(clean));

  if (parsed.error) {
    return { consumed: true, ok: false, error: parsed.error === "access_denied" ? "Spotify login was cancelled." : parsed.error };
  }

  const pending = readPkcePending(opts.session ?? sessionStore());
  const clientId = spotifyClientId(opts.env);
  if (!pending || !clientId || !parsed.code) {
    return { consumed: true, ok: false, error: "Spotify login expired. Try Connect again." };
  }
  if (parsed.state && parsed.state !== pending.state) {
    return { consumed: true, ok: false, error: "Spotify login state mismatch. Try Connect again." };
  }

  try {
    const tokens = await exchangeSpotifyCode({
      code: parsed.code,
      verifier: pending.verifier,
      redirectUri: pending.redirectUri,
      clientId,
      fetchImpl: opts.fetchImpl,
    });
    writeSpotifyTokens(tokens, opts.local ?? localStore());
    try {
      (opts.session ?? sessionStore()).removeItem(SPOTIFY_PKCE_STORAGE);
    } catch {
      /* ignore */
    }
    return { consumed: true, ok: true };
  } catch (err) {
    return {
      consumed: true,
      ok: false,
      error: err instanceof Error ? err.message : "Spotify token exchange failed.",
    };
  }
}

export async function spotifyFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: {
    env?: { VITE_SPOTIFY_CLIENT_ID?: string };
    local?: SpotifyStorage;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const token = await getValidAccessToken(opts);
  if (!token) throw new Error("Not connected to Spotify.");
  const url = path.startsWith("http") ? path : `${SPOTIFY_API_URL}${path}`;
  const res = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; reason?: string; status?: number };
  };
  if (!res.ok) {
    const reason = json.error?.reason || json.error?.message || `Spotify HTTP ${res.status}`;
    const err = new Error(reason) as Error & { status?: number; reason?: string };
    err.status = res.status;
    err.reason = json.error?.reason;
    throw err;
  }
  return json;
}

export async function fetchSpotifyMe(opts?: {
  env?: { VITE_SPOTIFY_CLIENT_ID?: string };
  local?: SpotifyStorage;
  fetchImpl?: typeof fetch;
}): Promise<SpotifyMe> {
  return spotifyFetch<SpotifyMe>("/me", {}, opts);
}

export async function searchSpotifyTracks(
  query: string,
  opts?: {
    env?: { VITE_SPOTIFY_CLIENT_ID?: string };
    local?: SpotifyStorage;
    fetchImpl?: typeof fetch;
  },
): Promise<SpotifyTrack[]> {
  const q = query.replace(/\s+/g, " ").trim();
  if (!q) return [];
  const data = await spotifyFetch<{ tracks?: { items?: SpotifyTrack[] } }>(
    `/search?${new URLSearchParams({ q, type: "track", limit: "5" }).toString()}`,
    {},
    opts,
  );
  return (data.tracks?.items ?? []).filter((t) => t?.uri && t.name);
}

export async function transferSpotifyPlayback(
  deviceId: string,
  play: boolean,
  opts?: {
    env?: { VITE_SPOTIFY_CLIENT_ID?: string };
    local?: SpotifyStorage;
    fetchImpl?: typeof fetch;
  },
): Promise<void> {
  await spotifyFetch(
    "/me/player",
    { method: "PUT", body: JSON.stringify({ device_ids: [deviceId], play }) },
    opts,
  );
}

export async function playSpotifyUris(
  deviceId: string,
  uris: string[],
  opts?: {
    env?: { VITE_SPOTIFY_CLIENT_ID?: string };
    local?: SpotifyStorage;
    fetchImpl?: typeof fetch;
  },
): Promise<void> {
  await spotifyFetch(
    `/me/player/play?${new URLSearchParams({ device_id: deviceId }).toString()}`,
    { method: "PUT", body: JSON.stringify({ uris }) },
    opts,
  );
}

export function premiumRequiredMessage(error: unknown): string | null {
  if (!error) return null;
  const reason =
    typeof error === "object" && error && "reason" in error
      ? String((error as { reason?: string }).reason ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error);
  const blob = `${reason} ${message}`.toLowerCase();
  if (
    blob.includes("premium") ||
    blob.includes("restriction_violated") ||
    reason === "PREMIUM_REQUIRED"
  ) {
    return "Spotify Premium is required for in-browser playback. Free-tier accounts can still paste a title on Life.";
  }
  return null;
}

export const SPOTIFY_SETUP_HINT =
  "Create a Spotify Developer app, add the Pages redirect URI, then rebuild with VITE_SPOTIFY_CLIENT_ID. No client secret. See README.";
