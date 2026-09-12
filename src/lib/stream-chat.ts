import { actToJson, composeAct } from "@/lib/brain";

export type StreamChatInput = {
  model: string;
  personality: string;
  reasoning: "low" | "medium" | "high" | "xhigh";
  messages: { role: "user" | "assistant"; content: string }[];
  systemExtra?: string;
};

async function demoReply(
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

export async function streamChat(
  input: StreamChatInput,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });

    if (!res.ok || !res.body) {
      await demoReply(input, onDelta, signal);
      return;
    }

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

    if (!got) await demoReply(input, onDelta, signal);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof Error && err.name === "AbortError") throw err;
    // Network / missing API → offline brain
    await demoReply(input, onDelta, signal);
  }
}
