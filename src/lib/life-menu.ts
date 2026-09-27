/**
 * Life chrome is a compact menu on the Life tab, not a second page.
 * First arrival stays closed so the desk clip is the screen.
 * Re-tapping Life, outside, Escape, or leaving for Chat / Chart / Call closes it.
 */

import type { ShellTab } from "./shell.ts";

function menuTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * One title, one place. The current track stays in the now-playing row.
 * Suggestions claim a title before Daily, and neither list repeats it.
 */
export function lifeMenuTracks(opts: {
  nowPlaying?: string | null;
  suggestions?: string[];
  daily?: string[];
}): { nowPlaying: string | null; suggestions: string[]; daily: string[] } {
  const now = opts.nowPlaying ? menuTitle(opts.nowPlaying) : "";
  const seen = new Set<string>();
  if (now) seen.add(now.toLowerCase());

  const take = (list: string[] | undefined) => {
    const out: string[] = [];
    for (const raw of list ?? []) {
      const title = menuTitle(raw);
      if (!title) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(title);
    }
    return out;
  };

  return {
    nowPlaying: now || null,
    suggestions: take(opts.suggestions),
    daily: take(opts.daily),
  };
}

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
