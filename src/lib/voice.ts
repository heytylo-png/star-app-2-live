import { getStoredElevenKey, getStoredVoiceId } from "./settings-keys.ts";

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let current: HTMLAudioElement | null = null;
let raf = 0;

const ELEVEN_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/";

export type ElevenTtsPlan = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

function ensureContext() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    analyser.connect(ctx.destination);
    bins = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
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

export function stopVoice() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
}

function sampleAmplitude() {
  if (!analyser || !bins) return 0;
  analyser.getByteFrequencyData(bins);
  let sum = 0;
  const n = Math.min(bins.length, 40);
  for (let i = 0; i < n; i++) sum += bins[i]!;
  return Math.min(1, (sum / n / 255) * 1.65);
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
  const line = text.trim();
  if (!trimmedKey || !id || !line) return null;
  return {
    url: ELEVEN_TTS_URL + encodeURIComponent(id),
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
): Promise<void> {
  stopVoice();
  const key = getStoredElevenKey();
  const voiceId = getStoredVoiceId();
  if (!elevenTtsPlan(text, key, voiceId)) {
    onAmp(0);
    return;
  }

  try {
    const audioCtx = ensureContext();
    const res = await requestElevenSpeech({ text, key, voiceId, signal });
    if (!res?.ok) {
      onAmp(0);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    current = audio;

    const source = audioCtx.createMediaElementSource(audio);
    if (analyser) source.connect(analyser);

    let smooth = 0;
    const tick = () => {
      const raw = sampleAmplitude();
      smooth = smooth * 0.7 + raw * 0.3;
      onAmp(smooth);
      raf = requestAnimationFrame(tick);
    };

    await new Promise<void>((resolve) => {
      const finish = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        onAmp(0);
        URL.revokeObjectURL(url);
        if (current === audio) current = null;
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      signal?.addEventListener(
        "abort",
        () => {
          audio.pause();
          finish();
        },
        { once: true },
      );
      void audio.play().then(
        () => {
          raf = requestAnimationFrame(tick);
        },
        () => finish(),
      );
    });
  } catch (err) {
    if (isAbort(err)) return;
    onAmp(0);
  }
}
