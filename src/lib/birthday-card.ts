import type { ChartSetupStatus } from "./chart-store.ts";
import type { ShellTab } from "./shell.ts";

/** Tabs row: pt-1 + h-11 + pb 0.4rem. */
export const BIRTHDAY_TAB_ROW_REM = 3.4;
/** Composer: pt-2 + min-h-11 + pb-1.5. */
export const BIRTHDAY_COMPOSER_REM = 3.625;
export const BIRTHDAY_CARD_GAP_REM = 0.25;
export const BIRTHDAY_CARD_MAX_REM = 15;
export const BIRTHDAY_CARD_MAX_DVH = 0.4;

/** Measured chin on the phone sheet at 412×893. Scales with viewport height. */
export const BIRTHDAY_CHIN_AT_893 = 195;
export const BIRTHDAY_FRAME_W = 784;
export const BIRTHDAY_FRAME_H = 1168;

/** Border-box form. 44px controls, 40px fields, tight rows. Fits under 15rem. */
export const BIRTHDAY_CARD_PAD_Y_REM = 0.6;
export const BIRTHDAY_CARD_BORDER_PX = 3;
export const BIRTHDAY_CONTROL_PX = 44;
export const BIRTHDAY_INPUT_PX = 40;
export const BIRTHDAY_LABEL_PX = 14;
export const BIRTHDAY_ROW_GAP_PX = 4;
export const BIRTHDAY_FIELD_GAP_PX = 2;

export function birthdayCardVisible(opts: {
  hydrated: boolean;
  setup: ChartSetupStatus;
  hasBirthDate: boolean;
}): boolean {
  return opts.hydrated && opts.setup === "pending" && !opts.hasBirthDate;
}

/** Skip closes the card and stays on Chat. Birth details stay in Menu. */
export function applyBirthdaySkip(): { tab: ShellTab; setup: "skipped" } {
  return { tab: "chat", setup: "skipped" };
}

/**
 * After skip (or after Menu > Birth details marks setup done), the card stays
 * hidden on Chat, Chart, and Life, including the next local day.
 */
export function birthdayCardStaysHidden(opts: {
  tab: ShellTab;
  day: string;
  setup: "skipped" | "done";
}): boolean {
  const knownTab = opts.tab === "chat" || opts.tab === "chart" || opts.tab === "life";
  const knownDay = /^\d{4}-\d{2}-\d{2}$/.test(opts.day);
  return knownTab && knownDay && (opts.setup === "skipped" || opts.setup === "done");
}

export function birthdayCardMaxPx(height: number, rem = 16): number {
  return Math.min(BIRTHDAY_CARD_MAX_REM * rem, BIRTHDAY_CARD_MAX_DVH * height);
}

/** Full border-box height of the form: padding, border, both buttons, both fields. */
export function birthdayCardContentPx(rem = 16): number {
  const field = BIRTHDAY_LABEL_PX + BIRTHDAY_FIELD_GAP_PX + BIRTHDAY_INPUT_PX;
  const inner =
    BIRTHDAY_CONTROL_PX +
    BIRTHDAY_ROW_GAP_PX +
    field +
    BIRTHDAY_ROW_GAP_PX +
    field +
    BIRTHDAY_ROW_GAP_PX +
    BIRTHDAY_CONTROL_PX;
  return inner + BIRTHDAY_CARD_PAD_Y_REM * rem + BIRTHDAY_CARD_BORDER_PX;
}

export function birthdayCardBottomPx(rem = 16): number {
  return (BIRTHDAY_TAB_ROW_REM + BIRTHDAY_COMPOSER_REM + BIRTHDAY_CARD_GAP_REM) * rem;
}

/** Top of the card when it is as tall as the cap. Shorter content sits lower. */
export function birthdayCardTopPx(height: number, rem = 16): number {
  return height - birthdayCardBottomPx(rem) - birthdayCardMaxPx(height, rem);
}

export function birthdayChinPx(height: number): number {
  return BIRTHDAY_CHIN_AT_893 * (height / 893);
}
