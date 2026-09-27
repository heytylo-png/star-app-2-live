/**
 * Chart chrome is a compact menu on the Chart tab, same open/close idea as Life.
 * First tap on Chart opens it. Outside, Escape, a second tap, or leaving the tab closes it.
 * Opening the menu does not ask Chat or the brain for a reading.
 */

import { sunFromBirthDate } from "./chart.ts";
import type { ShellTab } from "./shell.ts";

export type ChartMenuState = {
  tab: ShellTab;
  open: boolean;
  callActive: boolean;
};

export type ChartMenuAction =
  | { type: "select-tab"; tab: ShellTab }
  | { type: "toggle-chart" }
  | { type: "outside" }
  | { type: "escape" }
  | { type: "call"; active: boolean };

export function reduceChartMenu(state: ChartMenuState, action: ChartMenuAction): ChartMenuState {
  switch (action.type) {
    case "select-tab":
      if (action.tab !== "chart") {
        return { tab: action.tab, open: false, callActive: state.callActive };
      }
      return { tab: "chart", open: !state.callActive, callActive: state.callActive };
    case "toggle-chart":
      if (state.callActive) {
        return { tab: "chart", open: false, callActive: true };
      }
      if (state.tab !== "chart") {
        return { tab: "chart", open: true, callActive: false };
      }
      return { ...state, open: !state.open };
    case "outside":
    case "escape":
      return { ...state, open: false };
    case "call":
      return {
        ...state,
        callActive: action.active,
        open: action.active ? false : state.open,
      };
    default:
      return state;
  }
}

/** User's sun only, from the saved sign or the saved birth date. Her sign stays off this row. */
export function chartMenuSun(opts: { userSun?: string | null; birthDate?: string | null }): string | null {
  const stored = opts.userSun?.replace(/\s+/g, " ").trim();
  if (stored) return stored;
  return sunFromBirthDate(opts.birthDate) ?? null;
}

export function chartDiaryExcerpt(text: string, max = 84): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

/** The line Ask her sends into Chat. One ask, then she answers there. */
export function chartAskDraft(entry?: { text?: string | null } | null): string {
  const excerpt = entry?.text ? chartDiaryExcerpt(entry.text) : "";
  if (!excerpt) return "What do you make of my chart?";
  return `What do you make of this page? ${excerpt}`;
}

export function chartAskHandoff(entry?: { text?: string | null } | null): {
  tab: "chat";
  draft: string;
  sent: true;
} {
  return { tab: "chat", draft: chartAskDraft(entry), sent: true };
}
