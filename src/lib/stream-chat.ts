import { actToJson, composeAct } from "@/lib/brain";
import { getStoredXaiKey, streamGrok } from "@/lib/grok";

export type StreamChatInput = {
  model: string;
  personality: string;
  reasoning: "low" | "medium" | "high" | "xhigh";
  messages: { role: "user" | "assistant"; content: string }[];
  systemExtra?: string;
};

/** Local composeAct brain when Grok /api/chat is unavailable (GitHub Pages). */
async function localReply(
  input: StreamChatInput,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const act = composeAct(input.messages, input.systemExtra);
  const payload = actToJson(act);

  for (const ch of payload) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onDelta(ch);
    await new Promise((r) => setTimeout(r, 8));
  }
}

function isAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/** Optional legacy Pages /api/chat probe (kept for future backends). */
async function tryLocalApi(
  input: StreamChatInput,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });

    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let got = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let json: { text?: string; error?: string };
        try {
          json = JSON.parse(payload) as { text?: string; error?: string };
        } catch {
          continue;
        }
        if (json.error) throw new Error(json.error);
        if (typeof json.text === "string" && json.text) {
          got = true;
          onDelta(json.text);
        }
      }
    }

    return got;
  } catch (err) {
    if (isAbort(err)) throw err;
    return false;
  }
}

export async function streamChat(
  input: StreamChatInput,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  // 1) Real Grok when the user pasted an xAI key (localStorage only).
  if (getStoredXaiKey()) {
    try {
      await streamGrok(
        { messages: input.messages, systemExtra: input.systemExtra },
        onDelta,
        signal,
      );
      return;
    } catch (err) {
      if (isAbort(err)) throw err;
      // CORS, auth, model failure → silent offline brain. Never break character about API.
    }
  }

  // 2) Optional future /api/chat backend
  try {
    const used = await tryLocalApi(input, onDelta, signal);
    if (used) return;
  } catch (err) {
    if (isAbort(err)) throw err;
  }

  // 3) Offline composeAct — always works on Pages
  await localReply(input, onDelta, signal);
}
