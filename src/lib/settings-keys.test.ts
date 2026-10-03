import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { describeGrokFailure, getStoredXaiKey } from "./grok.ts";
import {
  ELEVEN_KEY_STORAGE,
  GROK_KEY_STORAGE,
  VOICE_ID_STORAGE,
  classifyStoredKey,
  getStoredGrokKey,
  hasCallVoice,
  maskSecret,
  migrateStoredKeys,
  redactSecrets,
  secretInputValue,
  setStoredElevenKey,
  setStoredGrokKey,
  setStoredVoiceId,
  type KeyStorage,
} from "./settings-keys.ts";
import { elevenTtsPlan, requestElevenSpeech } from "./voice.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function memoryStorage(seed: Record<string, string> = {}): KeyStorage & { dump: () => Record<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

describe("settings keys", () => {
  it("keeps Grok, ElevenLabs, and Voice ID as three separate values", () => {
    const storage = memoryStorage();
    storage.setItem(GROK_KEY_STORAGE, "brain-only-value");
    storage.setItem(ELEVEN_KEY_STORAGE, "speech-only-value");
    storage.setItem(VOICE_ID_STORAGE, "voice-demo");
    migrateStoredKeys(storage);
    assert.equal(storage.getItem(GROK_KEY_STORAGE), "brain-only-value");
    assert.equal(storage.getItem(ELEVEN_KEY_STORAGE), "speech-only-value");
    assert.equal(storage.getItem(VOICE_ID_STORAGE), "voice-demo");
    assert.notEqual(storage.getItem(GROK_KEY_STORAGE), storage.getItem(ELEVEN_KEY_STORAGE));
  });

  it("migrates an xAI-looking key into Grok and an ElevenLabs-looking key into ElevenLabs", () => {
    const xai = memoryStorage({ [GROK_KEY_STORAGE]: "xai-user-key" });
    migrateStoredKeys(xai);
    assert.equal(xai.getItem(GROK_KEY_STORAGE), "xai-user-key");
    assert.equal(xai.getItem(ELEVEN_KEY_STORAGE), null);

    const eleven = memoryStorage({ [GROK_KEY_STORAGE]: "sk_user_key" });
    migrateStoredKeys(eleven);
    assert.equal(eleven.getItem(GROK_KEY_STORAGE), null);
    assert.equal(eleven.getItem(ELEVEN_KEY_STORAGE), "sk_user_key");

    const other = memoryStorage({ [GROK_KEY_STORAGE]: "plain-old-token" });
    migrateStoredKeys(other);
    assert.equal(other.getItem(GROK_KEY_STORAGE), "plain-old-token");
    assert.equal(other.getItem(ELEVEN_KEY_STORAGE), null);
    assert.equal(classifyStoredKey("xai-user-key"), "grok");
    assert.equal(classifyStoredKey("sk_user_key"), "eleven");
    assert.equal(classifyStoredKey("plain-old-token"), "grok");
  });

  it("does not clobber a voice id or a key saved after migration", () => {
    const storage = memoryStorage({
      [GROK_KEY_STORAGE]: "sk_old",
      [VOICE_ID_STORAGE]: "keep-this-voice",
    });
    migrateStoredKeys(storage);
    assert.equal(storage.getItem(VOICE_ID_STORAGE), "keep-this-voice");
    storage.setItem(GROK_KEY_STORAGE, "later-brain");
    migrateStoredKeys(storage);
    assert.equal(storage.getItem(GROK_KEY_STORAGE), "later-brain");
    assert.equal(storage.getItem(ELEVEN_KEY_STORAGE), "sk_old");
  });

  it("masks secrets and never leaves them in error text", () => {
    const secret = "sk_live_secret_value";
    assert.equal(maskSecret(secret), "••••alue");
    assert.equal(maskSecret("sk-test-1234"), "••••1234");
    assert.equal(maskSecret("sk-test-abcd"), "••••abcd");
    assert.doesNotMatch(maskSecret(secret), /sk_live/);
    assert.equal(secretInputValue("sk-test-1234", false), "");
    assert.equal(secretInputValue("sk-test-abcd", true), "sk-test-abcd");
    assert.doesNotMatch(maskSecret("sk-test-1234"), /sk-test/);
    const logged = redactSecrets(`xAI 401: ${secret} rejected`, [secret, "brain-key"]);
    assert.equal(logged.includes(secret), false);
    assert.match(logged, /••••/);
    const grokErr = describeGrokFailure(401, `unauthorized ${secret}`, secret);
    assert.equal(grokErr.message.includes(secret), false);
  });

  it("uses the Grok key for the brain and the ElevenLabs key plus voice id for TTS only", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 204 });
    };
    const plan = elevenTtsPlan("Catch this", "speech-only-value", "voice-demo");
    assert.ok(plan);
    assert.equal(plan.headers["xi-api-key"], "speech-only-value");
    assert.notEqual(plan.headers["xi-api-key"], "brain-only-value");
    assert.match(plan.url, /\/v1\/text-to-speech\/voice-demo$/);
    assert.equal(plan.url.includes("speech-only-value"), false);
    assert.equal(elevenTtsPlan("Catch this", "sk-test-5678", "sk-test-5678"), null);
    assert.doesNotMatch(plan.url, /voices\/add|voice-generation|voice-design|\/edit/);
    assert.equal(JSON.parse(plan.body).text, "Catch this");

    const sent = await requestElevenSpeech({
      text: "Catch this",
      key: "speech-only-value",
      voiceId: "voice-demo",
      fetchImpl,
    });
    assert.ok(sent);
    assert.equal(calls.length, 1);
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["xi-api-key"], "speech-only-value");
    assert.equal(headers.Authorization, undefined);

    calls.length = 0;
    assert.equal(await requestElevenSpeech({ text: "Hi", key: null, voiceId: "voice-demo", fetchImpl }), null);
    assert.equal(await requestElevenSpeech({ text: "Hi", key: "speech-only-value", voiceId: "", fetchImpl }), null);
    assert.equal(calls.length, 0);
    assert.equal(elevenTtsPlan("Hi", "speech-only-value", null), null);
    assert.equal(elevenTtsPlan("Hi", null, "voice-demo"), null);
  });

  it("shows last-4 masks and never puts a key in the speech URL", () => {
    assert.equal(maskSecret("sk-test-abcd"), "••••abcd");
    assert.equal(secretInputValue("sk-test-1234", false), "");
    assert.equal(secretInputValue("new-key", true), "new-key");
    assert.equal(elevenTtsPlan("Hi", "sk-test-5678", "sk-test-5678"), null);
    const plan = elevenTtsPlan("Hi", "sk-test-5678", "voice-test-abcd");
    assert.ok(plan);
    assert.equal(plan.headers["xi-api-key"], "sk-test-5678");
    assert.equal(plan.url.includes("sk-test-5678"), false);
    assert.equal(plan.url.endsWith("/voice-test-abcd"), true);
  });

  it("does not call the browser speech engine or ship a default voice id", () => {
    const voice = readFileSync(join(root, "src/lib/voice.ts"), "utf8");
    const settings = readFileSync(join(root, "src/lib/settings-keys.ts"), "utf8");
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    assert.doesNotMatch(voice, /speechSynthesis/);
    assert.doesNotMatch(voice, /voices\/add|voice-generation|voice-design/);
    assert.match(voice, /text-to-speech/);
    assert.doesNotMatch(voice, /xai-|sk_/);
    assert.doesNotMatch(settings, /xai-|sk_/);
    assert.match(app, /Grok \/ xAI key/);
    assert.match(app, /ElevenLabs key/);
    assert.match(app, /Voice ID/);
    assert.match(app, /secretInputValue\(xaiKeyDraft, grokEditing\)/);
    assert.match(app, /secretInputValue\(elevenKeyDraft, elevenEditing\)/);
    assert.match(app, /<span className="normal-case">\{xaiMask\}<\/span>/);
    assert.match(app, /<span className="normal-case">\{elevenMask\}<\/span>/);
    assert.doesNotMatch(app, /value=\{getStored(Xai|Grok|Eleven)Key/);
    assert.doesNotMatch(app, /setXaiKeyDraft\(getStored/);
    assert.doesNotMatch(app, /setElevenKeyDraft\(getStored/);
    assert.doesNotMatch(app, /astrology api|natal api key|horoscope api key/i);
    assert.doesNotMatch(app, /speechSynthesis/);
    for (const file of ["src/components/rai-app.tsx", "src/lib/voice.ts", "src/lib/stream-chat.ts", "src/lib/local-brain.ts"]) {
      assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /speechSynthesis/);
    }
    for (const file of ["src/lib/voice.ts", "src/lib/settings-keys.ts", "src/lib/grok.ts"]) {
      assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /console\.(log|debug|info|warn|error)/);
    }
  });
});

describe("browser key slots stay independent when storage exists", () => {
  it("reads Grok without returning the ElevenLabs key", () => {
    const memory = memoryStorage();
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memory });
    try {
      setStoredGrokKey("brain-only-value");
      setStoredElevenKey("speech-only-value");
      setStoredVoiceId("voice-demo");
      assert.equal(getStoredGrokKey(), "brain-only-value");
      assert.equal(getStoredXaiKey(), "brain-only-value");
      assert.notEqual(getStoredGrokKey(), "speech-only-value");
      assert.notEqual(getStoredXaiKey(), "speech-only-value");
      assert.equal(hasCallVoice(), true);
      setStoredVoiceId(null);
      assert.equal(hasCallVoice(), false);
      setStoredElevenKey(null);
      setStoredVoiceId("voice-demo");
      assert.equal(hasCallVoice(), false);
    } finally {
      if (previous) Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous });
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
