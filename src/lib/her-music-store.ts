import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  adoptHeardTitle,
  compactHerMusic,
  emptyHerMusic,
  HER_MUSIC_STORE_KEY,
  type FavoriteList,
  type HerMusicState,
  type LifeSuggestion,
} from "./her-music.ts";
import type { LifeMoodTag } from "./life.ts";

type HerMusicStore = HerMusicState & {
  saveSuggestions: (today: string, suggestions: LifeSuggestion[]) => void;
  markAsked: (today: string) => void;
  replaceLists: (lists: FavoriteList[]) => void;
  adoptTitle: (title: string | undefined, mood?: LifeMoodTag) => void;
};

export const useHerMusicStore = create<HerMusicStore>()(
  persist(
    (set, get) => ({
      ...emptyHerMusic(),
      saveSuggestions: (today, suggestions) => {
        const next = compactHerMusic({
          ...get(),
          suggestions,
          suggestion_date: today,
        });
        set(next);
      },
      markAsked: (today) => set({ asked_date: today.trim() }),
      replaceLists: (lists) => set({ lists: compactHerMusic({ ...get(), lists }).lists }),
      adoptTitle: (title, mood) => {
        set({ lists: adoptHeardTitle(get().lists, title, mood) });
      },
    }),
    {
      name: HER_MUSIC_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        suggestions: state.suggestions,
        suggestion_date: state.suggestion_date,
        asked_date: state.asked_date,
        lists: state.lists,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<HerMusicState>;
        const compact = compactHerMusic(p);
        return { ...current, ...compact };
      },
    },
  ),
);
