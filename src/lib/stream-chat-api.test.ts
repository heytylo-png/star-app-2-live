import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isValidActJson } from "./rai.ts";
import { chatApiEnabled, streamChat } from "./stream-chat.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("streamChat skips /api/chat on the static build", () => {
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
