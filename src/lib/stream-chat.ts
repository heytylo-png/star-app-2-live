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
  const last = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lower = last.toLowerCase();
  let emotion = "idle";
  let pose = "idle";
  let line = "Hmph. Fine — I'm still here. Say something worth answering.";

  if (/bump|sorry|wasn't watching/.test(lower)) {
    emotion = "angry";
    pose = "idle";
    line = "Watch where you're going. You're lucky I'm in a good mood… which I'm not.";
  } else if (/who are you|supposed to be/.test(lower)) {
    emotion = "thinking";
    pose = "idle";
    line = "Star Rai. Idol. Not your screensaver. Keep up.";
  } else if (/hey|hello|hi\b|just got here/.test(lower)) {
    emotion = "happy";
    pose = "wave";
    line = "Hey. Took you long enough.";
  } else if (/remember|my name|like talking/.test(lower)) {
    emotion = "shy";
    pose = "shy";
    line = "…Fine. I'll keep that. Don't make me regret it.";
  } else if (/kiss|love|cute/.test(lower)) {
    emotion = "flirty";
    pose = "kiss";
    line = "Don't get ideas. That was charity.";
  } else if (last.trim()) {
    emotion = "thinking";
    pose = "idle";
    line = "Offline demo — no API right now. I still heard you. Try again later for the real me.";
  }

  const mem =
    /remember|my name|like talking/.test(lower) && last.trim()
      ? `,"mem":[${JSON.stringify(last.replace(/\s+/g, " ").trim().slice(0, 80))}]`
      : "";
  const payload = `{"emotion":"${emotion}","pose":"${pose}","line":${JSON.stringify(line)}${mem}}`;

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
    // Network / missing API → offline demo
    await demoReply(input, onDelta, signal);
  }
}
