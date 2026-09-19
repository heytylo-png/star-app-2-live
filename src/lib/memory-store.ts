import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { extractNatalFromUserText } from "./chart";
import {
  applySlotPatch,
  emptySlots,
  extractSlotsFromUserText,
  formatMemoryFacts,
  migrateItemsToSlots,
  type AffectionSlotInput,
  type ExtractOpts,
  type MemorySlotState,
} from "./memory-slots";

/**
 * Persist key: `star-rai-memory` (stable — do not rename without a migrator).
 * Schema v1: { items: MemoryItem[] }
 * Schema v2: { items, slots } — compact grok-4-latest MEMORY FACTS.
 */
export const MEMORY_STORE_KEY = "star-rai-memory";
export const MEMORY_SCHEMA_VERSION = 2;

export type MemoryItem = {
  id: string;
  text: string;
  createdAt: number;
};

export type { MemorySlotState };

type MemoryState = {
  items: MemoryItem[];
  slots: MemorySlotState;
  add: (text: string) => void;
  addMany: (texts: string[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  ingestUserTurn: (text: string, opts?: ExtractOpts) => void;
  patchSlots: (patch: MemorySlotState) => void;
  clearSlot: (key: keyof MemorySlotState) => void;
  memoryFactsBlock: (affection?: AffectionSlotInput) => string;
};

function normalizeFact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isDuplicate(existing: string, next: string): boolean {
  const a = existing.toLowerCase();
  const b = next.toLowerCase();
  if (a === b) return true;
  // Same name / like / city with slight wording drift
  if (a.includes(b) || b.includes(a)) return true;
  const nameA = a.match(/name is\s+([a-z][\w'-]+)/);
  const nameB = b.match(/name is\s+([a-z][\w'-]+)/);
  if (nameA && nameB && nameA[1] === nameB[1]) return true;
  return false;
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      items: [],
      slots: emptySlots(),
      add: (text) => {
        const cleaned = normalizeFact(text);
        if (!cleaned) return;
        const items = get().items;
        if (items.some((item) => item.text.toLowerCase() === cleaned.toLowerCase())) return;
        const withoutSimilar = items.filter((item) => !isDuplicate(item.text, cleaned));
        const nextItems = [
          { id: crypto.randomUUID(), text: cleaned, createdAt: Date.now() },
          ...withoutSimilar,
        ].slice(0, 80);
        set({ items: nextItems });
      },
      addMany: (texts) => {
        texts.forEach((t) => get().add(t));
      },
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [], slots: emptySlots() }),
      ingestUserTurn: (text, opts) => {
        const current = get().slots;
        const patch = extractSlotsFromUserText(text, opts, current);
        const natal = extractNatalFromUserText(text, current);
        const merged: MemorySlotState = { ...patch, ...natal };
        if (!Object.keys(merged).length) return;
        set((state) => ({ slots: applySlotPatch(state.slots, merged) }));
      },
      patchSlots: (patch) => set((state) => ({ slots: applySlotPatch(state.slots, patch) })),
      clearSlot: (key) =>
        set((state) => {
          const next = { ...state.slots };
          if (key === "chart" || key === "life" || key === "role") {
            delete next[key];
          } else {
            delete next[key];
          }
          return { slots: next };
        }),
      memoryFactsBlock: (affection) => formatMemoryFacts(get().slots, affection),
    }),
    {
      name: MEMORY_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, slots: state.slots }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<MemoryState, "items" | "slots">>;
        const items = Array.isArray(p.items) ? p.items : current.items;
        const slots = migrateItemsToSlots(items, p.slots ?? current.slots ?? emptySlots());
        return { ...current, items, slots };
      },
    },
  ),
);
