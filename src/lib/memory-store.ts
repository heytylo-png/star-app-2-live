import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { extractNatalFromUserText } from "./chart.ts";
import { memorySaves, rememberGistKey } from "./remember-toast.ts";
import {
  applySlotPatch,
  emptySlots,
  extractSlotsFromUserText,
  formatMemoryFacts,
  migrateItemsToSlots,
  type AffectionSlotInput,
  type ExtractOpts,
  type MemorySlotState,
} from "./memory-slots.ts";

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
  /** The saved text, or null when nothing new was written. */
  add: (text: string) => string | null;
  /** Texts that were actually stored, in order. Duplicates are omitted. */
  addMany: (texts: string[]) => string[];
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

function gistContains(longer: string, shorter: string): boolean {
  const haystack = rememberGistKey(longer);
  const needle = rememberGistKey(shorter);
  return Boolean(haystack && needle && haystack !== needle && haystack.includes(needle));
}

/** Subject phrase before "name is" / "is named", normalised. */
function nameFact(text: string): { subject: string; name: string } | null {
  const lower = text.toLowerCase().replace(/\s+/g, " ").trim();
  const re = /(name is|is named)\s+([a-z][\w'-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower))) {
    const start = match.index;
    if (start > 0 && /[a-z0-9]/i.test(lower[start - 1] ?? "")) continue;
    return { subject: rememberGistKey(lower.slice(0, start)), name: match[2] ?? "" };
  }
  return null;
}

/**
 * Same given name and the same subject. A missing subject still matches
 * ("Name is Ada from home" refines "Their name is Ada"). Two different
 * subjects ("best friend's" vs "coworker's") do not.
 */
function sameSubjectName(existing: string, next: string): boolean {
  const a = nameFact(existing);
  const b = nameFact(next);
  if (!a || !b || !a.name || a.name !== b.name) return false;
  if (a.subject && b.subject && a.subject !== b.subject) return false;
  return true;
}

/** True when the new text should replace this item: a longer refinement, or the same subject. */
function isDuplicate(existing: string, next: string): boolean {
  if (gistContains(next, existing)) return true;
  return sameSubjectName(existing, next) && !gistContains(existing, next);
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      items: [],
      slots: emptySlots(),
      add: (text) => {
        const cleaned = normalizeFact(text);
        if (!cleaned) return null;
        const items = get().items;
        const gist = rememberGistKey(cleaned);
        // Case, spacing, and trailing punctuation are the same item.
        if (gist && items.some((item) => rememberGistKey(item.text) === gist)) return null;
        // A shorter echo of a fact we already have is not a new write.
        if (items.some((item) => gistContains(item.text, cleaned))) return null;
        // A refinement replaces the shorter item. That update does not toast.
        const withoutSimilar = items.filter((item) => !isDuplicate(item.text, cleaned));
        const replaced = withoutSimilar.length !== items.length;
        const nextItems = [
          { id: crypto.randomUUID(), text: cleaned, createdAt: Date.now() },
          ...withoutSimilar,
        ].slice(0, 80);
        set({ items: nextItems });
        if (replaced) return null;
        memorySaves.notify(cleaned);
        return cleaned;
      },
      addMany: (texts) => {
        const saved: string[] = [];
        for (const text of texts) {
          const wrote = get().add(text);
          if (wrote) saved.push(wrote);
        }
        return saved;
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
          delete next[key];
          if (key === "name") {
            delete next.name_source;
            delete next.name_checked;
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
