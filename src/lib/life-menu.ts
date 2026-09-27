/**
 * Life chrome is a compact menu on the Life tab, not a second page.
 * First arrival stays closed so the desk clip is the screen.
 * Re-tapping Life, outside, Escape, or leaving for Chat / Chart / Call closes it.
 */

import type { ShellTab } from "./shell.ts";

export type LifeMenuState = {
  tab: ShellTab;
  open: boolean;
  callActive: boolean;
};

export type LifeMenuAction =
  | { type: "select-tab"; tab: ShellTab }
  | { type: "toggle-life" }
  | { type: "outside" }
  | { type: "escape" }
  | { type: "call"; active: boolean };

export function reduceLifeMenu(state: LifeMenuState, action: LifeMenuAction): LifeMenuState {
  switch (action.type) {
    case "select-tab":
      return { tab: action.tab, open: false, callActive: state.callActive };
    case "toggle-life":
      if (state.tab !== "life" || state.callActive) {
        return { tab: "life", open: false, callActive: state.callActive };
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
