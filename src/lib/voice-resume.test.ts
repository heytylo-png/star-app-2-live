import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUDIO_RESUME_TIMEOUT_MS, speak, type SpeakEnv } from "./voice.ts";

type Handler = { fn: () => void; once: boolean };

class FakeAudio {
  crossOrigin = "";
  src: string;
  private listeners = new Map<string, Handler[]>();
  constructor(src?: string) {
    this.src = src ?? "";
  }
  addEventListener(type: string, fn: () => void, options?: { once?: boolean }) {
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, once: Boolean(options?.once) });
    this.listeners.set(type, list);
  }
  private emit(type: string) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((item) => !item.once),
    );
    for (const item of list) item.fn();
  }
  pause() {}
  play() {
    queueMicrotask(() => this.emit("playing"));
    setTimeout(() => this.emit("ended"), 20);
    return Promise.resolve();
  }
}

function hungEnv(sources: { n: number }): SpeakEnv {
  return {
    key: "sk-test-5678",
    voiceId: "voice-test-abcd",
    fetchImpl: async () => new Response(new Blob([Uint8Array.from([0, 1, 2])], { type: "audio/wav" }), { status: 200 }),
    Audio: FakeAudio,
    context: () => ({
      state: "suspended",
      resume: () => new Promise<void>(() => {}),
      createMediaElementSource: () => {
        sources.n += 1;
        return {
          connect() {},
          disconnect() {},
        };
      },
    }),
  };
}

async function say(env: SpeakEnv) {
  let analyserOk: boolean | null = null;
  const started = Date.now();
  const result = await speak("hello there", () => {}, undefined, {
    env,
    onPlaying: (info) => {
      analyserOk = info.analyserOk;
    },
  });
  return { result, analyserOk, elapsed: Date.now() - started };
}

describe("hung audio resume", () => {
  it("settles within the timeout, falls back, and a second voiced send still plays", async () => {
    const sources = { n: 0 };
    const first = await say(hungEnv(sources));
    assert.equal(first.result, "played");
    assert.equal(first.analyserOk, false);
    assert.equal(sources.n, 0);
    assert.ok(
      first.elapsed < AUDIO_RESUME_TIMEOUT_MS + 200,
      `first send took ${first.elapsed} ms`,
    );
    assert.ok(first.elapsed >= AUDIO_RESUME_TIMEOUT_MS - 40, `first send returned in ${first.elapsed} ms`);

    const second = await say(hungEnv(sources));
    assert.equal(second.result, "played");
    assert.equal(second.analyserOk, false);
    assert.equal(sources.n, 0);
    assert.ok(
      second.elapsed < AUDIO_RESUME_TIMEOUT_MS + 200,
      `second send took ${second.elapsed} ms`,
    );
  });
});
