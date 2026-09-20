import { create } from "zustand";

/** Shipping body is PNG. Lab is a WIP mesh preview — never shipping Rai. */
export const PRESENCE_MODES = ["png", "lab"] as const;
export type PresenceMode = (typeof PRESENCE_MODES)[number];

const STORAGE_KEY = "star-rai-presence-v2";
const LEGACY_KEY = "star-rai-presence";

/** Lab stills for the first expression set. Kiss is never a pin. */
export const LAB_WIP_STILLS = ["idle", "talk", "wave", "scold", "pout", "shy"] as const;
export type LabWipStill = (typeof LAB_WIP_STILLS)[number];

function queryLabMode(): PresenceMode | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get("lab") === "1") return "lab";
  if (q.get("lab") === "0") return "png";
  return null;
}

function readMode(): PresenceMode {
  const fromQuery = queryLabMode();
  if (fromQuery) return fromQuery;
  if (typeof window === "undefined") return "png";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "png" || raw === "lab") return raw;
    // Ignore v1 "toon" so testers are not stuck on the Sairi scaffold.
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode */
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

/** `?lab=1&wip=scold` pins a Lab mood still. Never returns kiss. */
export function labWipPosePin(): LabWipStill | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("lab") !== "1") return null;
    const raw = (q.get("wip") ?? "").toLowerCase();
    if (raw === "kiss") return null;
    if ((LAB_WIP_STILLS as readonly string[]).includes(raw)) return raw as LabWipStill;
  } catch {
    /* ignore */
  }
  return null;
}
