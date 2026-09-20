import { create } from "zustand";

export const PRESENCE_MODES = ["toon", "png"] as const;
export type PresenceMode = (typeof PRESENCE_MODES)[number];

const STORAGE_KEY = "star-rai-presence";

function readMode(): PresenceMode {
  if (typeof window === "undefined") return "toon";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "png" || raw === "toon") return raw;
  } catch {
    /* private mode */
  }
  return "toon";
}

function writeMode(mode: PresenceMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

type PresenceState = {
  mode: PresenceMode;
  setMode: (mode: PresenceMode) => void;
};

export const usePresenceMode = create<PresenceState>()((set) => ({
  mode: readMode(),
  setMode: (mode) => {
    writeMode(mode);
    set({ mode });
  },
}));
