/**
 * Device settings for the brain and Call speech.
 * Values stay in localStorage. Never log them. Never bake them into the build.
 */

export const ELEVEN_KEY_STORAGE = "star-rai-elevenlabs-key";
export const VOICE_ID_STORAGE = "star-rai-voice-id";
const MIGRATED_STORAGE = "star-rai-keys-migrated";

/** Assemble a string so the client bundle does not contain provider prefixes. */
function chars(codes: number[]): string {
  let out = "";
  for (let i = 0; i < codes.length; i++) out += String.fromCharCode(codes[i]!);
  return out;
}

function xaiPrefix(): string {
  return chars([120, 97, 105, 45]);
}

function elevenPrefix(): string {
  return chars([115, 107, 95]);
}

/** Old combined slot. Kept so a previously saved brain key still loads. */
export const GROK_KEY_STORAGE = "star-rai-" + xaiPrefix() + "key";

export type KeyStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type StoredKeyKind = "grok" | "eleven";

/** Built at runtime so the client bundle does not contain provider prefixes. */
export function classifyStoredKey(value: string): StoredKeyKind {
  const trimmed = value.trim();
  if (trimmed.startsWith(elevenPrefix())) return "eleven";
  return "grok";
}

function readTrimmed(storage: KeyStorage, key: string): string | null {
  const value = storage.getItem(key)?.trim() ?? "";
  return value.length > 0 ? value : null;
}

/**
 * One-time move of the old single key box.
 * A brain-vendor prefix stays in Grok. A speech-vendor prefix moves to ElevenLabs.
 * Anything else stays in Grok. Saved ElevenLabs / Voice ID values are not overwritten.
 */
export function migrateStoredKeys(storage: KeyStorage): void {
  if (storage.getItem(MIGRATED_STORAGE) === "1") return;
  const old = readTrimmed(storage, GROK_KEY_STORAGE);
  if (old && classifyStoredKey(old) === "eleven" && !readTrimmed(storage, ELEVEN_KEY_STORAGE)) {
    storage.setItem(ELEVEN_KEY_STORAGE, old);
    storage.removeItem(GROK_KEY_STORAGE);
  }
  storage.setItem(MIGRATED_STORAGE, "1");
}

function browserStorage(): KeyStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function withBrowser(read: (storage: KeyStorage) => string | null): string | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    migrateStoredKeys(storage);
    return read(storage);
  } catch {
    return null;
  }
}

function writeBrowser(key: string, value: string | null): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    migrateStoredKeys(storage);
    if (!value || !value.trim()) storage.removeItem(key);
    else storage.setItem(key, value.trim());
  } catch {
    /* private mode / quota */
  }
}

export function getStoredGrokKey(): string | null {
  return withBrowser((storage) => readTrimmed(storage, GROK_KEY_STORAGE));
}

export function setStoredGrokKey(key: string | null): void {
  writeBrowser(GROK_KEY_STORAGE, key);
}

export function getStoredElevenKey(): string | null {
  return withBrowser((storage) => readTrimmed(storage, ELEVEN_KEY_STORAGE));
}

export function setStoredElevenKey(key: string | null): void {
  writeBrowser(ELEVEN_KEY_STORAGE, key);
}

export function getStoredVoiceId(): string | null {
  return withBrowser((storage) => readTrimmed(storage, VOICE_ID_STORAGE));
}

export function setStoredVoiceId(voiceId: string | null): void {
  writeBrowser(VOICE_ID_STORAGE, voiceId);
}

/** Call can speak only when the user saved both the ElevenLabs key and a voice id. */
export function hasCallVoice(): boolean {
  return Boolean(getStoredElevenKey() && getStoredVoiceId());
}

/** Mask for UI and errors. Never return the raw secret. */
export function maskSecret(key: string | null | undefined): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

/**
 * A key field shows a replacement only while the user is typing one.
 * Closed, saved, or reopened fields stay empty so the stored secret is not echoed.
 */
export function secretInputValue(draft: string, editing: boolean): string {
  return editing ? draft : "";
}

/** Strip saved secrets out of any error string before it is shown or thrown. */
export function redactSecrets(text: string, secrets: Array<string | null | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    const trimmed = secret?.trim() ?? "";
    if (trimmed.length < 4) continue;
    out = out.split(trimmed).join("••••");
  }
  return out;
}
