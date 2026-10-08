/**
 * Empty-chat starter chips.
 * They show once, before any send. A persisted flag keeps them gone after
 * reload, a tab change, a new day, or clearing the thread.
 * Old saves have no flag: history alone is enough to hide them.
 */

export type StarterChipThread = { messages?: readonly unknown[] };

export function chatHasHistory(threads: readonly StarterChipThread[] | null | undefined): boolean {
  if (!threads) return false;
  return threads.some((thread) => (thread?.messages?.length ?? 0) > 0);
}

/**
 * Merge helper. Missing or non-true flags stay false unless a saved thread
 * already has messages — those users never see the chips.
 */
export function persistedStarterChipsDone(
  starterChipsDone: unknown,
  threads: readonly StarterChipThread[] | null | undefined,
): boolean {
  return starterChipsDone === true || chatHasHistory(threads);
}

/** True only when nothing has been sent and the flag is still clear. */
export function starterChipsVisible(input: {
  hasSent: boolean;
  hasHistory: boolean;
  starterChipsDone: boolean;
}): boolean {
  return !input.hasSent && !input.hasHistory && !input.starterChipsDone;
}

/**
 * Birthday card covers this band. Chips stay hidden while it is up
 * rather than stacking on the card.
 */
export function showStarterChips(input: {
  hasSent: boolean;
  hasHistory: boolean;
  starterChipsDone: boolean;
  birthdayCard: boolean;
}): boolean {
  if (input.birthdayCard) return false;
  return starterChipsVisible(input);
}

/** One-line empty hint. Hidden with the chips while the birthday card is up. */
export function showEmptyChatHint(input: { empty: boolean; birthdayCard: boolean; callActive: boolean }): boolean {
  return input.empty && !input.birthdayCard && !input.callActive;
}
