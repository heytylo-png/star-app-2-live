import { create } from "zustand";

/** Shipping body is PNG. Lab is a WIP mesh preview — never shipping Rai. */
export const PRESENCE_MODES = ["png", "lab"] as const;
export type PresenceMode = (typeof PRESENCE_MODES)[number];

const STORAGE_KEY = "star-rai-presence-v2";
const LEGACY_KEY = "star-rai-presence";

function readMode(): PresenceMode {
  if (typeof window === "undefined") return "png";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "png" || raw === "lab") return raw;
    // Ignore v1 "toon" so testers are not stuck on the Sairi scaffold.
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode */
  }
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    if (q.get("lab") === "1") return "lab";
  }
  return "png";
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
