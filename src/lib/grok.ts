/** Client-side xAI Grok brain. Key lives in localStorage only — never bake secrets into the build. */

import { RAI_SYSTEM } from "@/lib/rai";

export const XAI_KEY_STORAGE = "star-rai-xai-key";

const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";

/** Prefer newest alias, then stable flagship, then older chat models. */
const MODEL_CANDIDATES = ["grok-4-latest", "grok-4.6", "grok-3", "grok-2"] as const;

/** Client fetch timeout — CORS/hangs fall back to the local brain. */
export const GROK_TIMEOUT_MS = 12_000;

export type GrokMessage = { role: "system" | "user" | "assistant"; content: string };

export function getStoredXaiKey(): string | null {
  try {
    const v = localStorage.getItem(XAI_KEY_STORAGE);
    if (!v) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function setStoredXaiKey(key: string | null): void {
  try {
    if (!key || !key.trim()) localStorage.removeItem(XAI_KEY_STORAGE);
    else localStorage.setItem(XAI_KEY_STORAGE, key.trim());
  } catch {
    /* private mode / quota */
  }
}

export function hasXaiKey(): boolean {
  return Boolean(getStoredXaiKey());
}

/** Mask for UI — never echo full key after save. */
export function maskXaiKey(key: string | null | undefined): string {
  if (!key) return "";
  const t = key.trim();
  if (t.length <= 4) return "••••";
  return `••••${t.slice(-4)}`;
}

function proxyBase(): string | null {
  const raw = (import.meta.env.VITE_GROK_PROXY_URL as string | undefined)?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

function chatEndpoint(): { url: string; viaProxy: boolean } {
  const proxy = proxyBase();
  if (proxy) return { url: `${proxy}/v1/chat/completions`, viaProxy: true };
  return { url: XAI_CHAT_URL, viaProxy: false };
}

function buildMessages(
  messages: { role: "user" | "assistant"; content: string }[],
  systemExtra?: string,
): GrokMessage[] {
  const system = systemExtra?.trim()
    ? `${RAI_SYSTEM}\n\n${systemExtra.trim()}`
    : RAI_SYSTEM;
  return [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

async function feedChunks(
  text: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Chunk for mouth/caption UX when the API returned one-shot.
  const size = 12;
  for (let i = 0; i < text.length; i += size) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onDelta(text.slice(i, i + size));
    await new Promise((r) => setTimeout(r, 10));
  }
}

function isAbort(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

function isCorsOrNetwork(err: unknown): boolean {
  if (isAbort(err)) return false;
  // Browsers surface CORS / network failures as TypeError: Failed to fetch
  if (err instanceof TypeError) return true;
  if (err instanceof Error && /failed to fetch|networkerror|cors/i.test(err.message)) return true;
  return false;
}

type ChatCompletionChoice = {
  delta?: { content?: string | null };
  message?: { content?: string | null };
};

type ChatCompletionJson = {
  choices?: ChatCompletionChoice[];
  error?: { message?: string };
};

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let got = false;

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
      let json: ChatCompletionJson;
      try {
        json = JSON.parse(payload) as ChatCompletionJson;
      } catch {
        continue;
      }
      if (json.error?.message) throw new Error(json.error.message);
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        got = true;
        onDelta(delta);
      }
    }
  }
  return got;
}

async function postChat(
  model: string,
  messages: GrokMessage[],
  apiKey: string,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const { url, viaProxy } = chatEndpoint();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (viaProxy) {
    // Worker reads X-User-Key (or Authorization) and forwards to xAI.
    headers["X-User-Key"] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream,
      temperature: 0.85,
    }),
    signal,
  });
}

function throwIfTimedOut(err: unknown, user?: AbortSignal, timeout?: AbortSignal): void {
  if (!isAbort(err)) return;
  if (user?.aborted) throw err;
  if (timeout?.aborted) throw new Error("XAI_TIMEOUT");
}

function combineSignals(user?: AbortSignal): { signal: AbortSignal; timeout: AbortSignal } {
  const timeout = AbortSignal.timeout(GROK_TIMEOUT_MS);
  if (!user) return { signal: timeout, timeout };
  return { signal: AbortSignal.any([user, timeout]), timeout };
}

function classifyGrokCatch(err: unknown, user?: AbortSignal, timeout?: AbortSignal): never | void {
  throwIfTimedOut(err, user, timeout);
  if (isAbort(err)) throw err;
  if (isCorsOrNetwork(err)) {
    const e = new Error("XAI_CORS");
    (e as Error & { cause?: unknown }).cause = err;
    throw e;
  }
  if (err instanceof Error && err.message.startsWith("XAI_AUTH")) throw err;
  if (err instanceof Error && err.message === "XAI_TIMEOUT") throw err;
}

/**
 * Call xAI chat completions. Streams SSE when possible; otherwise one-shot + chunked onDelta.
 * Throws on user abort. Throws tagged Error on CORS / timeout / network so callers can fall back.
 */
export async function streamGrok(
  input: {
    messages: { role: "user" | "assistant"; content: string }[];
    systemExtra?: string;
  },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const apiKey = getStoredXaiKey();
  if (!apiKey) throw new Error("NO_KEY");

  const messages = buildMessages(input.messages, input.systemExtra);
  let lastErr: unknown = null;
  const { signal: combined, timeout } = combineSignals(signal);

  for (const model of MODEL_CANDIDATES) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (timeout.aborted) throw new Error("XAI_TIMEOUT");

    // Prefer streaming
    try {
      const res = await postChat(model, messages, apiKey, true, combined);
      if (res.status === 404 || res.status === 400) {
        // Model not found / bad request — try next candidate
        lastErr = new Error(`model ${model} rejected (${res.status})`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // Auth / rate — don't spin through every model endlessly for same key error
        if (res.status === 401 || res.status === 403) {
          throw new Error(`XAI_AUTH:${res.status}`);
        }
        lastErr = new Error(`xAI ${res.status}: ${body.slice(0, 160)}`);
        continue;
      }

      if (res.body) {
        const got = await readSseStream(res.body, onDelta, combined);
        if (got) return;
      }

      // Empty stream — fall through to one-shot with same model
    } catch (err) {
      classifyGrokCatch(err, signal, timeout);
      lastErr = err;
      // try next model / one-shot
    }

    // One-shot fallback for this model
    try {
      const res = await postChat(model, messages, apiKey, false, combined);
      if (res.status === 404 || res.status === 400) {
        lastErr = new Error(`model ${model} rejected (${res.status})`);
        continue;
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(`XAI_AUTH:${res.status}`);
        }
        const body = await res.text().catch(() => "");
        lastErr = new Error(`xAI ${res.status}: ${body.slice(0, 160)}`);
        continue;
      }
      const json = (await res.json()) as ChatCompletionJson;
      if (json.error?.message) throw new Error(json.error.message);
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content) {
        lastErr = new Error("empty completion");
        continue;
      }
      await feedChunks(content, onDelta, combined);
      return;
    } catch (err) {
      classifyGrokCatch(err, signal, timeout);
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("XAI_FAILED");
}

export function grokProxyConfigured(): boolean {
  return Boolean(proxyBase());
}
