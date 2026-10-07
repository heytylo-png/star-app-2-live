import { getStoredElevenKey, getStoredVoiceId } from "./settings-keys.ts";

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let timeBins: Uint8Array<ArrayBuffer> | null = null;
type SpeakAudio = {
  crossOrigin: string;
  src: string;
  pause: () => void;
  play: () => Promise<void>;
  addEventListener: (type: string, listener: () => void, options?: { once?: boolean }) => void;
};

let current: SpeakAudio | null = null;
let raf = 0;
let elementSource: { disconnect: () => void } | null = null;

/** A suspended context must not stall the line. Past this, play outside the graph. */
export const AUDIO_RESUME_TIMEOUT_MS = 250;

export type SpeakEnv = {
  key?: string | null;
  voiceId?: string | null;
  fetchImpl?: typeof fetch;
  context?: () => {
    state: string;
    resume: () => Promise<void>;
    createMediaElementSource: (audio: SpeakAudio) => { connect: (node: unknown) => void; disconnect: () => void };
  };
  Audio?: new (src?: string) => SpeakAudio;
};

export type SpeakHooks = {
  /** Fires on the audio element's `playing` event. */
  onPlaying?: (info: { analyserOk: boolean }) => void;
  /** One RMS sample per animation frame while the element is playing. */
  onSample?: (sample: { rms: number; analyserOk: boolean }) => void;
  /** ended, pause, error, or abort. Mouth and speaking stop here. */
  onStop?: () => void;
  /** Tests only. Production callers leave this unset. */
  env?: SpeakEnv;
};

const ELEVEN_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/";

export type ElevenTtsPlan = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

/** Longest first so `^_^` wins over `^^` and `:-)` wins over `:)`. */
const EMOTICON_TOKENS = [
  ">_<",
  ">.<",
  ">.>",
  "<.<",
  "^_^",
  "^.^",
  "T_T",
  "-_-",
  "o_o",
  "O_O",
  ";_;",
  "</3",
  ":-3",
  ":-D",
  ":-P",
  ":-p",
  ":-O",
  ":-o",
  ":-)",
  ":-(",
  ";-)",
  ":')",
  ":'(",
  "xD",
  "XD",
  "xP",
  "XP",
  "TwT",
  "^^",
  ":3",
  ":D",
  ":P",
  ":p",
  ":O",
  ":o",
  ";)",
  ";P",
  ";p",
  ":)",
  ":(",
  ":/",
  ":\\",
  ":|",
  "=)",
  "=(",
  "=D",
  "B)",
  "8)",
  "owo",
  "uwu",
  "OwO",
  "UwU",
].sort((a, b) => b.length - a.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EMOTICON_RE = new RegExp(
  `(?:^|(?<=\\s|[([{"'.,!?]))(?:${EMOTICON_TOKENS.map(escapeRegExp).join("|")})(?=$|\\s|[.,!?;:)"'\\]])`,
  "gi",
);

const EMOJI_RE =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\uFE0E)?)*|\p{Emoji_Modifier}|\uFE0F|\uFE0E|\u200D/gu;

const TIME_OR_RATIO_RE = /\d{1,4}:\d{1,4}/g;

function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, " ");
}

function stripEmoticonTokens(text: string): string {
  return text.replace(EMOTICON_RE, " ");
}

function parenIsKaomoji(inner: string): boolean {
  const core = inner.trim();
  if (!core) return true;
  if (/^\d{1,4}:\d{1,4}$/.test(core)) return false;
  const withoutFaces = stripEmoticonTokens(stripEmoji(core))
    .replace(/(?<!\/)<3{1,3}(?!3)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const words = withoutFaces.match(/\p{L}+/gu) ?? [];
  if (words.some((word) => !/^(owo|uwu|xd)$/i.test(word))) return false;
  if (/\p{N}/u.test(withoutFaces) && words.length === 0) return false;
  return true;
}

function stripParenKaomoji(text: string): string {
  return text.replace(/(\(|（)([^()（）\n]{0,48})(\)|）)/g, (full, _open, inner: string) =>
    parenIsKaomoji(inner) ? " " : full,
  );
}

function stripActionAsterisks(text: string): string {
  return text.replace(/\*([^*\n]{1,40})\*/g, (full, inner: string) => {
    const body = inner.trim();
    if (!/[A-Za-z]/.test(body)) return full;
    if (/[.!?]/.test(body)) return full;
    return " ";
  });
}

/**
 * `<3`, `<33`, and `<333` are the word "love" when they sit in the sentence.
 * A heart that only trails punctuation (`Night! <3`) is dropped.
 * `</3` is not a heart and is stripped later with the other emoticons.
 */
function speakHearts(text: string): string {
  const dropped = text.replace(/([.!?])(?:\s+(?<!\/)<3{1,3}(?!3))+(?=\s*$)/g, "$1");
  return dropped.replace(/(?<!\/)(?:^|(?<=\s))<3{1,3}(?!3)(?=$|\s|[.,!?;:)"'\]])/g, " love ");
}

function collapseSpeech(text: string): string {
  const collapsed = text
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s*\)|（\s*）/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(collapsed)) return "";
  return collapsed.replace(/^[,\s]+|[,\s]+$/g, "").trim();
}

/**
 * Text safe to send to speech. Emoticons, kaomoji, emoji, and *actions* go.
 * A mid-line `<3` is spoken as "love". The chat bubble keeps the original line.
 * Times and ratios stay. Empty string means there is nothing to speak.
 */
export function speechTextForTts(text: string): string {
  const saved: string[] = [];
  let out = speakHearts(stripActionAsterisks(stripParenKaomoji(stripEmoji(text))));
  out = out.replace(TIME_OR_RATIO_RE, (match) => {
    const token = `\uE000${saved.length}\uE000`;
    saved.push(match);
    return token;
  });
  out = stripEmoticonTokens(out);
  out = out.replace(/\uE000(\d+)\uE000/g, (_full, index: string) => saved[Number(index)] ?? "");
  return collapseSpeech(out);
}

function ensureContext() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    analyser.connect(ctx.destination);
    bins = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    timeBins = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
  }
  return ctx;
}

/** Call from a user gesture so AudioContext can resume. */
export function unlockVoice() {
  try {
    ensureContext();
  } catch {
    /* ignore */
  }
}

function releaseElementSource() {
  const source = elementSource;
  elementSource = null;
  try {
    source?.disconnect();
  } catch {
    /* already torn down */
  }
}

export function stopVoice() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  releaseElementSource();
  const audio = current;
  if (!audio) return;
  audio.pause();
  audio.src = "";
  if (current === audio) current = null;
}

function sampleAmplitude() {
  if (!analyser || !bins) return 0;
  analyser.getByteFrequencyData(bins);
  let sum = 0;
  const n = Math.min(bins.length, 40);
  for (let i = 0; i < n; i++) sum += bins[i]!;
  return Math.min(1, (sum / n / 255) * 1.65);
}

/** Time-domain RMS, 0..1. Unsmoothed so a syllable can move the mouth inside a frame. */
function sampleRms() {
  if (!analyser || !timeBins) return 0;
  analyser.getByteTimeDomainData(timeBins);
  let sum = 0;
  const n = timeBins.length;
  for (let i = 0; i < n; i++) {
    const x = (timeBins[i]! - 128) / 128;
    sum += x * x;
  }
  return Math.min(1, Math.sqrt(sum / n));
}

async function attachAnalyser(
  audio: SpeakAudio,
  signal: AbortSignal | undefined,
  audioCtx: {
    state: string;
    resume: () => Promise<void>;
    createMediaElementSource: (audio: SpeakAudio) => { connect: (node: unknown) => void; disconnect: () => void };
  },
): Promise<boolean> {
  if (signal?.aborted) return false;
  try {
    if (audioCtx.state === "suspended") {
      await Promise.race([
        audioCtx.resume().catch(() => {}),
        new Promise<void>((resolve) => setTimeout(resolve, AUDIO_RESUME_TIMEOUT_MS)),
      ]);
    }
    if (signal?.aborted || audioCtx.state !== "running" || !analyser) return false;
    const source = audioCtx.createMediaElementSource(audio);
    try {
      source.connect(analyser);
    } catch (err) {
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      throw err;
    }
    elementSource = source;
    return true;
  } catch {
    return false;
  }
}

/**
 * Plan a single text-to-speech request.
 * Empty key or empty voice id returns null — no invented voice, no other endpoint.
 */
export function elevenTtsPlan(
  text: string,
  key: string | null | undefined,
  voiceId: string | null | undefined,
): ElevenTtsPlan | null {
  const trimmedKey = key?.trim() ?? "";
  const id = voiceId?.trim() ?? "";
  const line = speechTextForTts(text);
  if (!trimmedKey || !id || !line) return null;
  // A key pasted into the voice id would land in the URL. Refuse the request.
  if (id.includes(trimmedKey)) return null;
  const url = ELEVEN_TTS_URL + encodeURIComponent(id);
  if (url.includes(trimmedKey) || url.includes(encodeURIComponent(trimmedKey))) return null;
  return {
    url,
    headers: {
      "xi-api-key": trimmedKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: line }),
  };
}

export async function requestElevenSpeech(opts: {
  text: string;
  key: string | null | undefined;
  voiceId: string | null | undefined;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<Response | null> {
  const plan = elevenTtsPlan(opts.text, opts.key, opts.voiceId);
  if (!plan) return null;
  const fetchImpl = opts.fetchImpl ?? fetch;
  return fetchImpl(plan.url, {
    method: "POST",
    headers: plan.headers,
    body: plan.body,
    signal: opts.signal,
  });
}

function isAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/**
 * Speak `text` with the saved ElevenLabs key and voice id.
 * Missing either value, or a failed request, ends quietly — the bubble already has the line.
 */
export async function speak(
  text: string,
  onAmp: (value: number) => void,
  signal?: AbortSignal,
  hooks?: SpeakHooks,
): Promise<"played" | "silent"> {
  stopVoice();
  const key = hooks?.env && "key" in hooks.env ? hooks.env.key : getStoredElevenKey();
  const voiceId = hooks?.env && "voiceId" in hooks.env ? hooks.env.voiceId : getStoredVoiceId();
  if (!elevenTtsPlan(text, key, voiceId)) {
    onAmp(0);
    return "silent";
  }

  let heard = false;
  try {
    const res = await requestElevenSpeech({
      text,
      key,
      voiceId,
      signal,
      fetchImpl: hooks?.env?.fetchImpl,
    });
    if (!res?.ok) {
      onAmp(0);
      return "silent";
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const AudioCtor = hooks?.env?.Audio ?? Audio;
    const audio = new AudioCtor(url) as SpeakAudio;
    audio.crossOrigin = "anonymous";
    current = audio;
    const audioCtx = hooks?.env?.context ? hooks.env.context() : ensureContext();
    const analyserOk = await attachAnalyser(audio, signal, audioCtx as Parameters<typeof attachAnalyser>[2]);

    let smooth = 0;
    let live = false;
    const tick = () => {
      if (!live) return;
      const rms = sampleRms();
      hooks?.onSample?.({ rms, analyserOk: true });
      const raw = sampleAmplitude();
      smooth = smooth * 0.7 + raw * 0.3;
      onAmp(smooth);
      if (!live) return;
      raf = requestAnimationFrame(tick);
    };

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        live = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        releaseElementSource();
        onAmp(0);
        URL.revokeObjectURL(url);
        if (current === audio) current = null;
        hooks?.onStop?.();
        resolve();
      };
      audio.addEventListener(
        "playing",
        () => {
          if (settled) return;
          heard = true;
          live = true;
          hooks?.onPlaying?.({ analyserOk });
          if (analyserOk) raf = requestAnimationFrame(tick);
        },
        { once: true },
      );
      audio.addEventListener("ended", finish);
      audio.addEventListener("pause", () => {
        if (!heard) return;
        finish();
      });
      audio.addEventListener("error", finish);
      signal?.addEventListener(
        "abort",
        () => {
          audio.pause();
          finish();
        },
        { once: true },
      );
      if (signal?.aborted) {
        finish();
        return;
      }
      void audio.play().then(
        () => {
          /* Mouth and samples start on `playing`, not when play() resolves. */
        },
        () => finish(),
      );
    });
  } catch (err) {
    if (isAbort(err)) return heard ? "played" : "silent";
    onAmp(0);
    return "silent";
  }
  return heard ? "played" : "silent";
}
