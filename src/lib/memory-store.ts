import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Persist key: `star-rai-memory` (stable — do not rename without a migrator).
 * Schema v1: { items: MemoryItem[] }
 */
export const MEMORY_STORE_KEY = "star-rai-memory";
export const MEMORY_SCHEMA_VERSION = 1;

export type MemoryItem = {
  id: string;
  text: string;
  createdAt: number;
};

type MemoryState = {
  items: MemoryItem[];
  add: (text: string) => void;
  addMany: (texts: string[]) => void;
  remove: (id: string) => void;
  clear: () => void;
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
      add: (text) => {
        const cleaned = normalizeFact(text);
        if (!cleaned) return;
        const items = get().items;
        if (items.some((item) => item.text.toLowerCase() === cleaned.toLowerCase())) return;
        const withoutSimilar = items.filter((item) => !isDuplicate(item.text, cleaned));
        set({
          items: [
            { id: crypto.randomUUID(), text: cleaned, createdAt: Date.now() },
            ...withoutSimilar,
          ].slice(0, 80),
        });
      },
      addMany: (texts) => {
        texts.forEach((t) => get().add(t));
      },
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: MEMORY_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
