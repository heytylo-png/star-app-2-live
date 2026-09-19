/**
 * 3-tab shell — Chat · Chart · Life. SoT: artifacts/star-rai-shell.txt
 *
 * Launch on Chat. Tabs are chrome only: they never remount stores,
 * never fire Chart on open, and never dump Life comments onto Life.
 */

export const SHELL_TABS = ["chat", "chart", "life"] as const;
export type ShellTab = (typeof SHELL_TABS)[number];

export const DEFAULT_SHELL_TAB: ShellTab = "chat";

export const SHELL_TAB_LABEL: Record<ShellTab, string> = {
  chat: "Chat",
  chart: "Chart",
  life: "Life",
};

export function isShellTab(value: unknown): value is ShellTab {
  return typeof value === "string" && (SHELL_TABS as readonly string[]).includes(value);
}

/** Chart / Life panes are not a Chat turn. Opening them is never chatOpen. */
export function chatOpenForTab(tab: ShellTab): boolean {
  return tab === "chat";
}

export type DiaryEntry = {
  dateKey: string;
  text: string;
};

/** Most recent local-day diary page. Diary stays on Chart. */
export function lastDiaryEntry(diaryByDay: Record<string, string>): DiaryEntry | undefined {
  const keys = Object.keys(diaryByDay)
    .filter((key) => diaryByDay[key]?.trim())
    .sort();
  const dateKey = keys[keys.length - 1];
  if (!dateKey) return undefined;
  return { dateKey, text: diaryByDay[dateKey]! };
}

/** Prefill <input type="date">. Year is ignored for user_sun. */
export function birthDateInputValue(raw?: string): string {
  if (!raw) return "";
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const md = raw.trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (md) {
    return `2000-${md[1]!.padStart(2, "0")}-${md[2]!.padStart(2, "0")}`;
  }
  return "";
}
