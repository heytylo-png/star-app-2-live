/**
 * Top-stage dropdown IA. Chart / Life stay on the bottom tabs.
 * Only these three entries — wired to existing sheets / Call / mute.
 */
export const STAGE_MENU_ITEMS = [
  { id: "settings", label: "Settings and API key" },
  { id: "memory", label: "Memory and saved facts" },
  { id: "voice", label: "Call mute and voice" },
] as const;

export type StageMenuItemId = (typeof STAGE_MENU_ITEMS)[number]["id"];
