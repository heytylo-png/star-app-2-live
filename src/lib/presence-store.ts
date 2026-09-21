import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  clipTopicHint,
  parseLastSeenAt,
  type PresenceSnapshot,
} from "./return-memory";

/**
 * Persist key: `star-rai-presence` (stable — do not rename without a migrator).
 * lastSeenAt is ms (ISO strings accepted on read for DevTools edits).
 */
export const PRESENCE_STORE_KEY = "star-rai-presence";
export const PRESENCE_SCHEMA_VERSION = 1;

type PresenceState = PresenceSnapshot & {
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  touchLastSeen: (now?: number) => void;
  setLastTopicHint: (hint: string | null) => void;
  applySnapshot: (next: PresenceSnapshot) => void;
};

function clipHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clipped = clipTopicHint(value);
  return clipped || null;
}

function snapshotFromUnknown(p: Partial<PresenceSnapshot> | undefined, fallback: PresenceSnapshot): PresenceSnapshot {
  return {
    lastSeenAt: parseLastSeenAt(p?.lastSeenAt) ?? fallback.lastSeenAt,
    lastTopicHint: clipHint(p?.lastTopicHint) ?? fallback.lastTopicHint,
    returnAckedFor: parseLastSeenAt(p?.returnAckedFor) ?? fallback.returnAckedFor,
  };
}

export const usePresenceStore = create<PresenceState>()(
  persist(
    (set) => ({
      lastSeenAt: null,
      lastTopicHint: null,
      returnAckedFor: null,
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      touchLastSeen: (now = Date.now()) => set({ lastSeenAt: now }),
      setLastTopicHint: (hint) => set({ lastTopicHint: clipHint(hint) }),
      applySnapshot: (next) =>
        set({
          lastSeenAt: next.lastSeenAt,
          lastTopicHint: clipHint(next.lastTopicHint),
          returnAckedFor: next.returnAckedFor,
        }),
    }),
    {
      name: PRESENCE_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        lastSeenAt: state.lastSeenAt,
        lastTopicHint: state.lastTopicHint,
        returnAckedFor: state.returnAckedFor,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PresenceSnapshot>;
        const snap = snapshotFromUnknown(p, current);
        return { ...current, ...snap, hydrated: false };
      },
    },
  ),
);
