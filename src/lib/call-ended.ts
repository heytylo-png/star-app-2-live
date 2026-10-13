/**
 * Low paper card after a voice call that actually connected.
 * Duration plus one bratty-warm line. No speech, no pose, no chat message.
 */

export const CALL_ENDED_MS = 6000;
export const CALL_ENDED_LAST_KEY = "star-rai-call-ended-line";

export type CallEndedBucket = "short" | "normal" | "long";

export type CallEndedLine = {
  id: string;
  text: string;
};

export type CallEndedCard = {
  id: string;
  line: string;
  duration: string;
  shownAt: number;
};

/** Very short under 30s. Long past 10 minutes. The edges stay in normal. */
export function callEndedBucket(ms: number): CallEndedBucket {
  const sec = (Number.isFinite(ms) ? Math.max(0, ms) : 0) / 1000;
  if (sec < 30) return "short";
  if (sec > 10 * 60) return "long";
  return "normal";
}

/** m:ss under an hour. h:mm:ss from one hour up. */
export function formatCallDuration(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

export const CALL_ENDED_LINES: Record<CallEndedBucket, readonly CallEndedLine[]> = {
  short: [
    { id: "short:0", text: "Already? I was just getting comfy." },
    { id: "short:1", text: "That barely counted." },
    { id: "short:2", text: "Hung up fast. Come back." },
  ],
  normal: [
    { id: "normal:0", text: "Okay. That was nice." },
    { id: "normal:1", text: "Fine. I'll allow it." },
    { id: "normal:2", text: "Call again. I'll pick up." },
  ],
  long: [
    { id: "long:0", text: "You stayed. I noticed." },
    { id: "long:1", text: "That was a long one. I liked it." },
    { id: "long:2", text: "Don't vanish after that." },
  ],
};

/** Next line in the bucket. The previous id is never shown twice in a row. */
export function pickCallEndedLine(bucket: CallEndedBucket, lastId: string | null): CallEndedLine {
  const rows = CALL_ENDED_LINES[bucket];
  const prev = lastId ? rows.findIndex((row) => row.id === lastId) : -1;
  const index = prev >= 0 ? (prev + 1) % rows.length : 0;
  return rows[index]!;
}

export function loadCallEndedLineId(read: (key: string) => string | null): string | null {
  try {
    const raw = read(CALL_ENDED_LAST_KEY)?.trim() ?? "";
    if (!raw) return null;
    for (const rows of Object.values(CALL_ENDED_LINES)) {
      if (rows.some((row) => row.id === raw)) return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCallEndedLineId(id: string, write: (key: string, value: string) => void): void {
  write(CALL_ENDED_LAST_KEY, id);
}

/**
 * A card only after a connected call. Cancelled or failed starts return null.
 */
export function planCallEnded(input: {
  connected: boolean;
  startedAt: number | null;
  endedAt: number;
  lastLineId: string | null;
  now?: number;
}): CallEndedCard | null {
  if (!input.connected || input.startedAt == null || !Number.isFinite(input.startedAt)) return null;
  const elapsed = Math.max(0, input.endedAt - input.startedAt);
  const line = pickCallEndedLine(callEndedBucket(elapsed), input.lastLineId);
  return {
    id: line.id,
    line: line.text,
    duration: formatCallDuration(elapsed),
    shownAt: input.now ?? input.endedAt,
  };
}

/** Reload owns the slot. A live call hides the card. */
export function callEndedVisible(input: {
  card: boolean;
  staleNotice: boolean;
  callActive: boolean;
}): boolean {
  if (!input.card) return false;
  if (input.staleNotice) return false;
  if (input.callActive) return false;
  return true;
}

export function callEndedExpired(shownAt: number, now: number, ms = CALL_ENDED_MS): boolean {
  return now - shownAt >= ms;
}
