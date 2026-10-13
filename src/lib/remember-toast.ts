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

/** Offers held while the call-ended card owns the slot. Not marked seen yet. */
export type QueuedRemember = {
  texts: string[];
  birthday: string | null;
};

export function emptyRememberQueue(): QueuedRemember {
  return { texts: [], birthday: null };
}

export function queueRememberDuringCard(queued: QueuedRemember, event: RememberEvent): QueuedRemember {
  if (event.type === "birthday") return { ...queued, birthday: event.date };
  return { ...queued, texts: [...queued.texts, ...event.texts] };
}

/**
 * While the card is up, keep the offer and leave `seen` alone.
 * Otherwise mark it seen and start the toast clock now.
 */
export function offerRememberDuringCard(input: {
  cardUp: boolean;
  seen: ReadonlySet<string>;
  queued: QueuedRemember;
  event: RememberEvent;
  now: number;
}): { seen: Set<string>; toast: RememberToast | null; queued: QueuedRemember } {
  if (input.cardUp) {
    return {
      seen: new Set(input.seen),
      toast: null,
      queued: queueRememberDuringCard(input.queued, input.event),
    };
  }
  const next = nextRememberToast(input.seen, input.event, input.now);
  return { seen: next.seen, toast: next.toast, queued: emptyRememberQueue() };
}

/** Mark the held offer seen and start its timer only once the card is gone. */
export function releaseRememberQueue(
  seen: ReadonlySet<string>,
  queued: QueuedRemember,
  now: number,
): { seen: Set<string>; toast: RememberToast | null; queued: QueuedRemember } {
  let current = new Set(seen);
  let toast: RememberToast | null = null;
  if (queued.texts.length) {
    const mem = nextRememberToast(current, { type: "memories", texts: queued.texts }, now);
    current = mem.seen;
    toast = mem.toast;
  }
  if (queued.birthday) {
    const day = nextRememberToast(current, { type: "birthday", date: queued.birthday }, now);
    current = day.seen;
    if (day.toast) toast = day.toast;
  }
  return { seen: current, toast, queued: emptyRememberQueue() };
}

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
