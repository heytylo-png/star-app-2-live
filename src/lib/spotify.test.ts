import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTrackTitle, resolveLifeTurn } from "./life.ts";
import {
  SPOTIFY_PAGES_REDIRECT,
  SPOTIFY_SETUP_HINT,
  SPOTIFY_SCOPES,
  SPOTIFY_TOKEN_STORAGE,
  beginSpotifyLogin,
  buildSpotifyAuthorizeUrl,
  clipSpotifyTitle,
  consumeSpotifyRedirect,
  formatSpotifyTrackTitle,
  isSpotifyPremium,
  parseSpotifyCallback,
  premiumRequiredMessage,
  recommendedSpotifyRedirects,
  spotifyClientId,
  spotifyClientIdMissing,
  spotifyRedirectUri,
  stripSpotifyCallbackParams,
  tokensNeedRefresh,
  writeSpotifyTokens,
  type SpotifyStorage,
} from "./spotify.ts";
import { trackIdentity } from "./spotify-player.ts";

function memoryStore(seed: Record<string, string> = {}): SpotifyStorage {
  const map = new Map(Object.entries(seed));
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

describe("Spotify env + redirect", () => {
  it("does not invent a client id and treats missing as a setup hint", () => {
    assert.equal(spotifyClientId({}), "");
    assert.equal(spotifyClientId({ VITE_SPOTIFY_CLIENT_ID: "   " }), "");
    assert.equal(spotifyClientIdMissing({}), true);
    assert.equal(spotifyClientId({ VITE_SPOTIFY_CLIENT_ID: "abc123" }), "abc123");
    assert.match(SPOTIFY_SETUP_HINT, /VITE_SPOTIFY_CLIENT_ID/);
    assert.match(SPOTIFY_SETUP_HINT, /No client secret/);
  });

  it("uses Pages and localhost redirect URIs with a trailing slash", () => {
    assert.equal(
      spotifyRedirectUri({ origin: "https://heytylo-png.github.io", base: "/star-app-2-live/" }),
      SPOTIFY_PAGES_REDIRECT,
    );
    assert.equal(
      spotifyRedirectUri({ origin: "http://localhost:5173", base: "/star-app-2-live/" }),
      "http://localhost:5173/star-app-2-live/",
    );
    assert.ok(recommendedSpotifyRedirects().includes(SPOTIFY_PAGES_REDIRECT));
    assert.ok(recommendedSpotifyRedirects().some((u) => u.includes("localhost")));
  });

  it("builds a PKCE authorize URL with no client secret", () => {
    const url = buildSpotifyAuthorizeUrl({
      clientId: "abc123",
      redirectUri: SPOTIFY_PAGES_REDIRECT,
      challenge: "challenge",
      state: "st",
    });
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://accounts.spotify.com");
    assert.equal(parsed.searchParams.get("client_id"), "abc123");
    assert.equal(parsed.searchParams.get("response_type"), "code");
    assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
    assert.equal(parsed.searchParams.get("code_challenge"), "challenge");
    assert.equal(parsed.searchParams.get("redirect_uri"), SPOTIFY_PAGES_REDIRECT);
    assert.ok(SPOTIFY_SCOPES.every((s) => parsed.searchParams.get("scope")?.includes(s)));
    assert.doesNotMatch(url, /client_secret/);
  });

  it("fails soft when Connect is tapped without a client id", async () => {
    const result = await beginSpotifyLogin({ env: {}, session: memoryStore() });
    assert.deepEqual(result, { ok: false, reason: "missing_client_id" });
  });
});

describe("Spotify callback + tokens", () => {
  it("parses and strips OAuth query params without touching other search", () => {
    assert.deepEqual(parseSpotifyCallback("?code=abc&state=s1"), { code: "abc", state: "s1", error: undefined });
    assert.deepEqual(parseSpotifyCallback("error=access_denied"), {
      code: undefined,
      state: undefined,
      error: "access_denied",
    });
    assert.equal(
      stripSpotifyCallbackParams("/star-app-2-live/?v=1&code=abc&state=s1"),
      "/star-app-2-live/?v=1",
    );
  });

  it("is a no-op when the URL is not a Spotify callback", async () => {
    const result = await consumeSpotifyRedirect({
      search: "?v=559ee4e",
      env: { VITE_SPOTIFY_CLIENT_ID: "abc" },
      local: memoryStore(),
      session: memoryStore(),
    });
    assert.deepEqual(result, { consumed: false });
  });

  it("exchanges a PKCE code and stores tokens in localStorage only", async () => {
    const local = memoryStore();
    const session = memoryStore({
      "star-rai-spotify-pkce": JSON.stringify({
        verifier: "verifier",
        state: "st",
        redirectUri: SPOTIFY_PAGES_REDIRECT,
      }),
    });
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      assert.match(body, /grant_type=authorization_code/);
      assert.match(body, /code_verifier=verifier/);
      assert.match(body, /client_id=abc123/);
      assert.doesNotMatch(body, /client_secret/);
      return {
        ok: true,
        json: async () => ({
          access_token: "tok",
          refresh_token: "ref",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      } as Response;
    }) as typeof fetch;

    const result = await consumeSpotifyRedirect({
      search: "?code=from-spotify&state=st",
      href: "/star-app-2-live/?code=from-spotify&state=st",
      env: { VITE_SPOTIFY_CLIENT_ID: "abc123" },
      local,
      session,
      fetchImpl,
      replaceUrl: (path) => {
        assert.equal(path, "/star-app-2-live/");
      },
    });
    assert.deepEqual(result, { consumed: true, ok: true });
    const stored = JSON.parse(local.getItem(SPOTIFY_TOKEN_STORAGE) ?? "null") as { access_token: string };
    assert.equal(stored.access_token, "tok");
    assert.equal(session.getItem("star-rai-spotify-pkce"), null);
  });

  it("refreshes when the access token is near expiry", () => {
    assert.equal(tokensNeedRefresh({ access_token: "x", expires_at: Date.now() + 5_000 }), true);
    assert.equal(tokensNeedRefresh({ access_token: "x", expires_at: Date.now() + 10 * 60_000 }), false);
  });

  it("keeps tokens readable after write", () => {
    const local = memoryStore();
    writeSpotifyTokens({ access_token: "a", refresh_token: "b", expires_at: 9 }, local);
    assert.match(local.getItem(SPOTIFY_TOKEN_STORAGE) ?? "", /"access_token":"a"/);
  });
});

describe("now playing + Premium", () => {
  it("formats Artist - Title for Life ingest", () => {
    assert.equal(
      formatSpotifyTrackTitle({ name: "Super Shy", artists: [{ name: "NewJeans" }] }),
      "NewJeans - Super Shy",
    );
    assert.equal(formatSpotifyTrackTitle({ name: "ETA" }), "ETA");
    assert.ok(clipSpotifyTitle("x".repeat(80)).length <= 48);
    assert.equal(parseTrackTitle(`I'm listening to ${formatSpotifyTrackTitle({
      name: "Super Shy",
      artists: [{ name: "NewJeans" }],
    })}`), "NewJeans - Super Shy");
  });

  it("treats a Spotify title as one Life comment per track change", () => {
    const title = formatSpotifyTrackTitle({ name: "ETA", artists: [{ name: "NewJeans" }] });
    const first = resolveLifeTurn({
      userText: `I'm listening to ${title}`,
      before: undefined,
      after: { on: true, now_playing: title },
    });
    assert.equal(first.kind, "track_change");
    assert.match(first.factsBlock ?? "", /session_on: true/);
    assert.match(first.factsBlock ?? "", /now_playing: NewJeans - ETA/);

    const same = resolveLifeTurn({
      userText: "still here",
      before: { on: true, now_playing: title, commented_track: title },
      after: { on: true, now_playing: title, commented_track: title },
    });
    assert.equal(same.kind, "none");
  });

  it("identifies the same track across pause/resume", () => {
    const track = { uri: "spotify:track:abc", name: "Super Shy", artists: [{ name: "NewJeans" }] };
    assert.equal(trackIdentity(track), "spotify:track:abc");
    assert.equal(trackIdentity(track), trackIdentity({ ...track, name: "Super Shy" }));
  });

  it("names Premium vs free-tier clearly", () => {
    assert.equal(isSpotifyPremium({ product: "premium" }), true);
    assert.equal(isSpotifyPremium({ product: "free" }), false);
    assert.match(
      premiumRequiredMessage({ reason: "PREMIUM_REQUIRED", message: "Restriction" }) ?? "",
      /Premium is required/,
    );
    assert.equal(premiumRequiredMessage(new Error("network down")), null);
  });
});
