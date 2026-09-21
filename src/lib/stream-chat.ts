import { actToJson, composeAct } from "@/lib/brain";
import type { ChartTurn } from "@/lib/chart";
import type { ClockTurn } from "@/lib/clock";
import type { LifeTurn } from "@/lib/life";
import { getStoredXaiKey, streamGrok } from "@/lib/grok";
import { isValidActJson, type PoseId } from "@/lib/rai";
import { formatLastUserCue, packChatTurns } from "@/lib/track";

export type StreamChatInput = {
  model: string;
  personality: string;
  reasoning: "low" | "medium" | "high" | "xhigh";
  messages: { role: "user" | "assistant"; content: string }[];
  systemExtra?: string;
  /** Pose already on stage (after a local command swap). */
  currentPose?: PoseId | null;
  /** Chart v1 turn — ask/diary stay local; daily may use Grok then fall back. */
  chartTurn?: ChartTurn;
  /** Life v1 turn — listen-ask / empty / stop stay local; track change may use Grok. */
  lifeTurn?: LifeTurn;
  /** Clock / NOW — facts ride every Grok call; where-are-you-time stays local. */
  clockTurn?: ClockTurn;
};

export type StreamDeltaMeta = { reset?: boolean };

/** Local pose-keyed brain when Grok is unavailable (GitHub Pages). */
async function localReply(
  input: StreamChatInput,
  onDelta: (text: string, meta?: StreamDeltaMeta) => void,
  signal?: AbortSignal,
): Promise<string> {
  const act = composeAct(
    input.messages,
    input.systemExtra,
    input.currentPose,
    input.chartTurn,
    input.lifeTurn,
    input.clockTurn,
  );
  const payload = actToJson(act);

  for (const ch of payload) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onDelta(ch);
    await new Promise((r) => setTimeout(r, 8));
  }
  return payload;
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
  onDelta: (text: string, meta?: StreamDeltaMeta) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });

    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let got = "";

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
          got += json.text;
          onDelta(json.text);
        }
      }
    }

    return got || null;
  } catch (err) {
    if (isAbort(err)) throw err;
    return null;
  }
}

/**
 * Grok when a key is present; otherwise (and on CORS / timeout / bad JSON /
 * auth / no key) the pose-keyed local brain from artifacts/.
 * Returns the authoritative act JSON for parseAct.
 */
export async function streamChat(
  input: StreamChatInput,
  onDelta: (text: string, meta?: StreamDeltaMeta) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Ask-path / diary / Life listen-ask: local rules. Do not send her bio through Grok.
  if (input.chartTurn?.localOnly || input.lifeTurn?.localOnly || input.clockTurn?.localOnly) {
    return localReply(input, onDelta, signal);
  }

  // 1) Real Grok when the user pasted an xAI key (localStorage only).
  if (getStoredXaiKey()) {
    try {
      let grokRaw = "";
      const messages = packChatTurns(input.messages);
      const systemExtra = [input.systemExtra, formatLastUserCue(messages)]
        .filter((block) => block?.trim())
        .join("\n\n");
      await streamGrok(
        { messages, systemExtra },
        (delta) => {
          grokRaw += delta;
          onDelta(delta);
        },
        signal,
      );
      if (isValidActJson(grokRaw)) return grokRaw;
    } catch (err) {
      if (isAbort(err)) throw err;
      // CORS, timeout, auth, model failure → silent local brain. Never break character about API.
    }
  }

  // 2) Optional future /api/chat backend
  try {
    const used = await tryLocalApi(input, onDelta, signal);
    if (used && isValidActJson(used)) return used;
  } catch (err) {
    if (isAbort(err)) throw err;
  }

  // 3) Offline local-brain.txt — always works on Pages
  onDelta("", { reset: true });
  return localReply(input, onDelta, signal);
}
