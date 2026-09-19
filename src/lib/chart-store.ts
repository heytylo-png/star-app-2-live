import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ChartSetupStatus = "pending" | "skipped" | "done";

type ChartState = {
  hydrated: boolean;
  setup: ChartSetupStatus;
  lastFiredDate: string | null;
  askedBirthday: boolean;
  diaryByDay: Record<string, string>;
  setHydrated: (value: boolean) => void;
  markSetupSkipped: () => void;
  markSetupDone: () => void;
  markFired: (dateKey: string) => void;
  markAskedBirthday: () => void;
  saveDiary: (dateKey: string, text: string) => void;
  diaryFor: (dateKey: string) => string | undefined;
};

export const CHART_STORE_KEY = "star-rai-chart";

export const useChartStore = create<ChartState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      setup: "pending",
      lastFiredDate: null,
      askedBirthday: false,
      diaryByDay: {},
      setHydrated: (value) => set({ hydrated: value }),
      markSetupSkipped: () => set({ setup: "skipped" }),
      markSetupDone: () => set({ setup: "done" }),
      markFired: (dateKey) => set({ lastFiredDate: dateKey }),
      markAskedBirthday: () => set({ askedBirthday: true }),
      saveDiary: (dateKey, text) => {
        const cleaned = text.replace(/\s+/g, " ").trim();
        if (!cleaned) return;
        set((state) => ({ diaryByDay: { ...state.diaryByDay, [dateKey]: cleaned } }));
      },
      diaryFor: (dateKey) => get().diaryByDay[dateKey],
    }),
    {
      name: CHART_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        setup: state.setup,
        lastFiredDate: state.lastFiredDate,
        askedBirthday: state.askedBirthday,
        diaryByDay: state.diaryByDay,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<
          Pick<ChartState, "setup" | "lastFiredDate" | "askedBirthday" | "diaryByDay">
        >;
        const setup =
          p.setup === "skipped" || p.setup === "done" || p.setup === "pending" ? p.setup : current.setup;
        return {
          ...current,
          setup,
          lastFiredDate: typeof p.lastFiredDate === "string" ? p.lastFiredDate : current.lastFiredDate,
          askedBirthday: typeof p.askedBirthday === "boolean" ? p.askedBirthday : current.askedBirthday,
          diaryByDay:
            p.diaryByDay && typeof p.diaryByDay === "object" ? p.diaryByDay : current.diaryByDay,
          hydrated: false,
        };
      },
    },
  ),
);
