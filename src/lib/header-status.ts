/**
 * Header chip. Always "With you" plus the live state.
 * Affection tier and brain source stay out of this line.
 */
export function headerLiveState(opts: {
  talking: boolean;
  sending: boolean;
  holding?: boolean;
  callActive?: boolean;
  callListening?: boolean;
  /** Mic prompt is up, or permission was denied. */
  micNeeded?: boolean;
}): "thinking" | "speaking" | "with you" | "listening" | "on call" | "allow mic" {
  if (opts.talking) return "speaking";
  if (opts.sending) return "thinking";
  if (opts.callListening || opts.holding) return "listening";
  if (opts.micNeeded) return "allow mic";
  if (opts.callActive) return "on call";
  return "with you";
}

export const HEADER_STATUS_LEAD = "With you";
