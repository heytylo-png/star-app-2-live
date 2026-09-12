import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (text) => {
        const cleaned = text.replace(/\s+/g, " ").trim();
        if (!cleaned) return;
        const exists = get().items.some((item) => item.text.toLowerCase() === cleaned.toLowerCase());
        if (exists) return;
        set((state) => ({
          items: [{ id: crypto.randomUUID(), text: cleaned, createdAt: Date.now() }, ...state.items].slice(
            0,
            80,
          ),
        }));
      },
      addMany: (texts) => {
        texts.forEach((t) => get().add(t));
      },
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "star-rai-memory",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
