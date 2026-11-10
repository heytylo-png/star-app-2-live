import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { streamGrok } from "./grok.ts";
import { GROK_KEY_STORAGE } from "./settings-keys.ts";

type Body = { model: string; stream: boolean };

const encoder = new TextEncoder();

/** SSE body that delivers each chunk, then either closes or errors mid-reply. */
function sse(chunks: string[], fail = false): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        const data = JSON.stringify({ choices: [{ delta: { content: chunks[i++] } }] });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      } else if (fail) {
        controller.error(new Error("connection dropped"));
      } else {
        controller.close();
      }
    },
  });
}

async function run(handler: (body: Body) => Response) {
  let calls = 0;
  let raw = "";
  let resets = 0;
  let error: string | null = null;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    return handler(JSON.parse(String(init?.body)) as Body);
  }) as typeof fetch;
  try {
    await streamGrok(
      { messages: [{ role: "user", content: "hi" }] },
      (delta) => {
        raw += delta;
      },
      undefined,
      () => {
        raw = "";
        resets += 1;
      },
    );
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return { calls, raw, resets, error };
}

describe("streamGrok retries", { concurrency: false }, () => {
  const realFetch = globalThis.fetch;
  const realStorage = (globalThis as { localStorage?: unknown }).localStorage;

  beforeEach(() => {
    const map = new Map<string, string>([[GROK_KEY_STORAGE, "test-key"]]);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { localStorage?: unknown }).localStorage = realStorage;
  });

  it("discards a partial stream before the one-shot retry", async () => {
    const full = '{"line":"hello"}';
    const result = await run((body) =>
      body.stream
        ? new Response(sse(['{"line":"he'], true))
        : Response.json({ choices: [{ message: { content: full } }] }),
    );
    assert.equal(result.error, null);
    assert.equal(result.resets, 1);
    assert.equal(result.raw, full);
  });

  it("stops after one request when rate limited", async () => {
    const result = await run(() => new Response("slow down", { status: 429 }));
    assert.equal(result.calls, 1);
    assert.equal(result.error, "XAI_RATE:429");
  });

  it("does not reset on a clean stream", async () => {
    const result = await run(() => new Response(sse(['{"line":', '"ok"}'])));
    assert.deepEqual(result, { calls: 1, raw: '{"line":"ok"}', resets: 0, error: null });
  });

  it("still moves to the next model when one is unknown", async () => {
    const result = await run((body) =>
      body.model === "grok-4-latest" ? new Response("", { status: 404 }) : new Response(sse(["x"])),
    );
    assert.equal(result.calls, 2);
    assert.equal(result.raw, "x");
  });
});
