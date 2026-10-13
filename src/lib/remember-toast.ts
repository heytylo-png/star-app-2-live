/**
 * One low "she remembers" line in the empty-hint slot.
 * It follows a real memory write or a birthday-card save. It does not speak,
 * change pose, or post a chat message.
 */

export const REMEMBER_TOAST_MS = 3500;

export type RememberToast = {
  key: string;
  line: string;
  shownAt: number;
};

export type RememberEvent =
  | { type: "memories"; texts: readonly string[] }
  | { type: "birthday"; date: string };

function cleanGist(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Toast identity. Case, extra spaces, and trailing punctuation are the same item.
 */
export function rememberGistKey(value: string): string {
  return cleanGist(value).replace(/\p{P}+$/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export const REMEMBER_SEEN_KEY = "star-rai-remember-seen";

export function loadRememberSeen(read: (key: string) => string | null): Set<string> {
  try {
    const raw = read(REMEMBER_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string" && item.length > 0));
  } catch {
    return new Set();
  }
}

export function saveRememberSeen(seen: ReadonlySet<string>, write: (key: string, value: string) => void): void {
  write(REMEMBER_SEEN_KEY, JSON.stringify([...seen]));
}

/** Short in-character line plus the gist. One line, no emoji. */
export function memoryToastLine(gist: string): string {
  const body = cleanGist(gist).replace(/[.?!]+$/g, "").trim();
  if (!body) return "Noted. I'll remember that.";
  return `Noted. ${body}.`;
}

export function birthdayToastLine(): string {
  return "Got it — your birthday.";
}

/**
 * One toast for a save. The same item does not show again.
 * Several new memories in one save still produce a single line.
 */
export function nextRememberToast(
  seen: ReadonlySet<string>,
  event: RememberEvent,
  now: number,
): { seen: Set<string>; toast: RememberToast | null } {
  const next = new Set(seen);
  if (event.type === "birthday") {
    const date = event.date.trim();
    if (!date) return { seen: next, toast: null };
    const key = `birthday:${date}`;
    if (next.has(key)) return { seen: next, toast: null };
    next.add(key);
    return { seen: next, toast: { key, line: birthdayToastLine(), shownAt: now } };
  }

  const fresh: string[] = [];
  for (const raw of event.texts) {
    const text = cleanGist(raw);
    const gist = rememberGistKey(raw);
    if (!text || !gist) continue;
    const key = `memory:${gist}`;
    if (next.has(key)) continue;
    next.add(key);
    fresh.push(text);
  }
  if (!fresh.length) return { seen: next, toast: null };
  return {
    seen: next,
    toast: {
      key: `memory:${fresh[0]!.toLowerCase()}`,
      line: memoryToastLine(fresh[0]!),
      shownAt: now,
    },
  };
}

/** Reload owns the hint slot. A call hides the line. */
export function rememberToastVisible(input: {
  line: string | null;
  staleNotice: boolean;
  callActive: boolean;
}): boolean {
  if (!input.line?.trim()) return false;
  if (input.staleNotice) return false;
  if (input.callActive) return false;
  return true;
}

export function rememberToastExpired(shownAt: number, now: number, ms = REMEMBER_TOAST_MS): boolean {
  return now - shownAt >= ms;
}

const memorySaveListeners = new Set<(texts: string[]) => void>();
let pendingMemorySaves: string[] = [];
let memorySaveQueued = false;

/** Several add() calls in one turn become one toast. */
export const memorySaves = {
  notify(text: string): void {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return;
    pendingMemorySaves.push(cleaned);
    if (memorySaveQueued) return;
    memorySaveQueued = true;
    queueMicrotask(() => {
      memorySaveQueued = false;
      const texts = pendingMemorySaves;
      pendingMemorySaves = [];
      if (!texts.length) return;
      for (const listener of memorySaveListeners) listener(texts);
    });
  },
  subscribe(listener: (texts: string[]) => void): () => void {
    memorySaveListeners.add(listener);
    return () => memorySaveListeners.delete(listener);
  },
};
