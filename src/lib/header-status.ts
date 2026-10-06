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
}): "thinking" | "speaking" | "with you" | "listening" | "on call" {
  if (opts.talking) return "speaking";
  if (opts.sending) return "thinking";
  if (opts.callListening || opts.holding) return "listening";
  if (opts.callActive) return "on call";
  return "with you";
}

export const HEADER_STATUS_LEAD = "With you";
