import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseLocalBrain, resetLocalBrainLastLine } from "./local-brain.ts";
import { isValidActJson } from "./rai.ts";
import { GROK_KEY_STORAGE } from "./settings-keys.ts";
import { chatApiEnabled, streamChat, type StreamDeltaMeta } from "./stream-chat.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("stream chat", { concurrency: false }, () => {
describe("streamChat skips /api/chat on the static build", { concurrency: false }, () => {
  it("keeps the probe behind VITE_CHAT_API=1", () => {
    const source = readFileSync(join(root, "src/lib/stream-chat.ts"), "utf8");
    assert.match(source, /export function chatApiEnabled\(\)/);
    assert.match(source, /VITE_CHAT_API === "1"/);
    assert.match(source, /async function tryLocalApi/);
    assert.match(source, /if \(chatApiEnabled\(\)\)/);
    assert.equal(chatApiEnabled(), false);
  });

  it("does not fetch api/chat when the flag is off and returns the local reply", async () => {
    const calls: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(url);
      return new Response(null, { status: 405 });
    }) as typeof fetch;

    try {
      const chunks: string[] = [];
      const reply = await streamChat(
        {
          model: "test",
          personality: "rai",
          reasoning: "low",
          messages: [{ role: "user", content: "hey" }],
        },
        (text) => {
          chunks.push(text);
        },
      );
      assert.deepEqual(calls, []);
      assert.equal(isValidActJson(reply), true);
      assert.equal(chunks.filter((chunk) => chunk.length > 0).join(""), reply);
    } finally {
      globalThis.fetch = previous;
    }
  });
});

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function installStorage(seed: Record<string, string> = {}) {
  const storage = memoryStorage();
  for (const [key, value] of Object.entries(seed)) storage.setItem(key, value);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  return () => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  };
}

function oneLine(reply: string): string {
  assert.equal(isValidActJson(reply), true);
  const act = JSON.parse(reply) as { line?: string };
  assert.equal(typeof act.line, "string");
  assert.equal(act.line?.includes("\n"), false);
  const known = [...parseLocalBrain().values()].flat().map((row) => row.line);
  assert.ok(known.includes(act.line!), act.line);
  assert.equal(known.filter((line) => act.line === line).length >= 1, true);
  return act.line!;
}

describe("streamChat local-brain fallback", { concurrency: false }, () => {
  const input = {
    model: "test",
    personality: "rai",
    reasoning: "low" as const,
    messages: [{ role: "user" as const, content: "hey" }],
    currentPose: "idle" as const,
  };

  it("returns one local line when the Grok key is empty and does not fetch", async () => {
    resetLocalBrainLastLine();
    const calls: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const restore = installStorage();
    try {
      const reply = await streamChat(input, () => {});
      const line = oneLine(reply);
      assert.equal(calls.length, 0);
      assert.ok((parseLocalBrain().get("talk") ?? []).some((row) => row.line === line));
    } finally {
      globalThis.fetch = previous;
      restore();
      resetLocalBrainLastLine();
    }
  });

  it("returns one local line when Grok answers 401", async () => {
    resetLocalBrainLastLine();
    const calls: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response("unauthorized", { status: 401 });
    }) as typeof fetch;
    const restore = installStorage({ [GROK_KEY_STORAGE]: "brain-test-key" });
    try {
      let reset = false;
      const reply = await streamChat(input, (_text, meta?: StreamDeltaMeta) => {
        if (meta?.reset) reset = true;
      });
      oneLine(reply);
      assert.ok(calls.length >= 1);
      assert.equal(reset, true);
      assert.doesNotMatch(reply, /unauthorized|offline|api/i);
    } finally {
      globalThis.fetch = previous;
      restore();
      resetLocalBrainLastLine();
    }
  });

  it("returns one local line when fetch throws and when the act JSON is invalid", async () => {
    const previous = globalThis.fetch;
    const restore = installStorage({ [GROK_KEY_STORAGE]: "brain-test-key" });
    try {
      resetLocalBrainLastLine();
      globalThis.fetch = (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch;
      oneLine(await streamChat(input, () => {}));

      resetLocalBrainLastLine();
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: "not an act" } }] })}\n\ndata: [DONE]\n`;
      globalThis.fetch = (async () => new Response(sse, { status: 200 })) as typeof fetch;
      const reply = await streamChat(input, () => {});
      const line = oneLine(reply);
      assert.notEqual(line, "not an act");
    } finally {
      globalThis.fetch = previous;
      restore();
      resetLocalBrainLastLine();
    }
  });
});
});
