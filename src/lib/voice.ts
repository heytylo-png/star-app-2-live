let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let current: HTMLAudioElement | null = null;
let raf = 0;
let preferredVoice: SpeechSynthesisVoice | null = null;
let voicesHooked = false;

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

function scoreVoice(v: SpeechSynthesisVoice): number {
  let score = 0;
  const name = v.name;
  const lang = v.lang || "";
  if (/^en(-|_)/i.test(lang)) score += 40;
  else if (/english/i.test(name)) score += 25;
  if (/en-US/i.test(lang)) score += 12;
  if (/en-GB/i.test(lang)) score += 6;
  if (
    /female|woman|girl|samantha|karen|moira|tessa|fiona|veena|zira|susan|hazel|linda|aria|jenny|google US English|Microsoft Aria|Microsoft Jenny|Samantha|Karen|Moira/i.test(
      name,
    )
  ) {
    score += 50;
  }
  if (/male|david|mark|alex|daniel|fred|ravi|google UK English Male/i.test(name)) score -= 35;
  if (v.localService) score += 8;
  if (/neural|natural|premium|enhanced/i.test(name)) score += 5;
  return score;
}

function refreshPreferredVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  preferredVoice = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

function ensureVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  refreshPreferredVoice();
  if (!voicesHooked) {
    voicesHooked = true;
    window.speechSynthesis.addEventListener("voiceschanged", refreshPreferredVoice);
  }
}

/** Call from a user gesture so AudioContext + SpeechSynthesis unlock. */
export function unlockVoice() {
  try {
    ensureContext();
  } catch {
    /* ignore */
  }
  ensureVoices();
  // Some browsers need a no-op speak/cancel cycle after a gesture.
  try {
    if (window.speechSynthesis && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
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
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function sampleAmplitude() {
  if (!analyser || !bins) return 0;
  analyser.getByteFrequencyData(bins);
  let sum = 0;
  const n = Math.min(bins.length, 40);
  for (let i = 0; i < n; i++) sum += bins[i];
  return Math.min(1, (sum / n / 255) * 1.65);
}

async function speakBrowser(
  text: string,
  onAmp: (value: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    // Soft fake mouth so the puppet still animates without TTS.
    let amp = 0;
    const steps = 22;
    for (let i = 0; i < steps; i++) {
      if (signal?.aborted) {
        onAmp(0);
        return;
      }
      const raw = 0.32 + Math.sin(i / 2.4) * 0.22;
      amp = amp * 0.65 + raw * 0.35;
      onAmp(amp);
      await new Promise((r) => setTimeout(r, 55));
    }
    onAmp(0);
    return;
  }

  ensureVoices();

  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    // Slightly bright tsundere idol — not cartoon chipmunk.
    u.rate = 1.05;
    u.pitch = 1.12;
    u.volume = 1;
    if (preferredVoice) u.voice = preferredVoice;
    else if (/^en/i.test(navigator.language || "")) u.lang = "en-US";

    let localRaf = 0;
    let smooth = 0;
    let t0 = performance.now();
    let finished = false;

    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      // Two soft oscillators + EMA → readable mouth without thrash.
      const raw =
        0.26 + Math.abs(Math.sin(t * 5.8)) * 0.38 + Math.abs(Math.sin(t * 9.4 + 0.7)) * 0.14;
      smooth = smooth * 0.78 + raw * 0.22;
      onAmp(smooth);
      localRaf = requestAnimationFrame(tick);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(localRaf);
      onAmp(0);
      resolve();
    };

    u.onend = finish;
    u.onerror = finish;
    signal?.addEventListener(
      "abort",
      () => {
        window.speechSynthesis.cancel();
        finish();
      },
      { once: true },
    );

    // Chrome sometimes silently drops the first utterance; resume + speak.
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    window.speechSynthesis.speak(u);
    localRaf = requestAnimationFrame(tick);

    // Watchdog: if synthesis stalls (known Chrome bug), end gracefully.
    const approxMs = Math.min(20000, Math.max(1800, text.length * 70));
    window.setTimeout(() => {
      if (!finished && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        finish();
      }
    }, approxMs + 800);
  });
}

export async function speak(
  text: string,
  onAmp: (value: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  stopVoice();
  ensureVoices();

  try {
    const audioCtx = ensureContext();
    const res = await fetch(`${import.meta.env.BASE_URL}api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) {
      await speakBrowser(text, onAmp, signal);
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

    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        onAmp(0);
        URL.revokeObjectURL(url);
        if (current === audio) current = null;
        resolve();
      };
      audio.onended = finish;
      audio.onerror = () => {
        finish();
        reject(new Error("Could not play voice"));
      };
      signal?.addEventListener(
        "abort",
        () => {
          audio.pause();
          finish();
        },
        { once: true },
      );
      void audio.play().then(() => {
        raf = requestAnimationFrame(tick);
      }, reject);
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (err instanceof Error && err.name === "AbortError") return;
    await speakBrowser(text, onAmp, signal);
  }
}
