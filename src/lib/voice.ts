let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let current: HTMLAudioElement | null = null;
let raf = 0;

function ensureContext() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;
    analyser.connect(ctx.destination);
    bins = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
  }
  return ctx;
}

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
  return Math.min(1, (sum / n / 255) * 1.8);
}

async function speakBrowser(
  text: string,
  onAmp: (value: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    // Fake mouth motion so the puppet still animates offline.
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      if (signal?.aborted) return;
      onAmp(0.35 + Math.sin(i / 2) * 0.25);
      await new Promise((r) => setTimeout(r, 60));
    }
    onAmp(0);
    return;
  }

  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1.05;
    let localRaf = 0;
    let t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      onAmp(0.25 + Math.abs(Math.sin(t * 9)) * 0.55);
      localRaf = requestAnimationFrame(tick);
    };
    const finish = () => {
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
    window.speechSynthesis.speak(u);
    localRaf = requestAnimationFrame(tick);
  });
}

export async function speak(
  text: string,
  onAmp: (value: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  stopVoice();

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

    const tick = () => {
      onAmp(sampleAmplitude());
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
