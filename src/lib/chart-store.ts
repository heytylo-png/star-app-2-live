import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HerDayCopy, HerDaySource } from "./sky.ts";

export type ChartSetupStatus = "pending" | "skipped" | "done";

export type StoredHerDay = {
  natal: string;
  beats: string[];
  skyLine?: string;
  source: HerDaySource;
};

type ChartState = {
  hydrated: boolean;
  setup: ChartSetupStatus;
  lastFiredDate: string | null;
  askedBirthday: boolean;
  diaryByDay: Record<string, string>;
  herDayByDay: Record<string, StoredHerDay>;
  setHydrated: (value: boolean) => void;
  markSetupSkipped: () => void;
  markSetupDone: () => void;
  markFired: (dateKey: string) => void;
  markAskedBirthday: () => void;
  saveDiary: (dateKey: string, text: string) => void;
  diaryFor: (dateKey: string) => string | undefined;
  saveHerDay: (dateKey: string, copy: HerDayCopy) => void;
  herDayFor: (dateKey: string) => StoredHerDay | undefined;
};

function parseStoredHerDay(value: unknown): StoredHerDay | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Partial<StoredHerDay>;
  if (typeof row.natal !== "string" || !row.natal.trim()) return undefined;
  if (!Array.isArray(row.beats)) return undefined;
  const beats = row.beats
    .filter((b): b is string => typeof b === "string")
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
  if (!beats.length) return undefined;
  const source: HerDaySource = row.source === "grok" ? "grok" : "local";
  const stored: StoredHerDay = { natal: row.natal.trim(), beats, source };
  if (typeof row.skyLine === "string" && row.skyLine.trim()) stored.skyLine = row.skyLine.trim();
  return stored;
}

function parseHerDayByDay(value: unknown): Record<string, StoredHerDay> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, StoredHerDay> = {};
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const parsed = parseStoredHerDay(row);
    if (parsed) out[key] = parsed;
  }
  return out;
}

export const CHART_STORE_KEY = "star-rai-chart";

export const useChartStore = create<ChartState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      setup: "pending",
      lastFiredDate: null,
      askedBirthday: false,
      diaryByDay: {},
      herDayByDay: {},
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
      saveHerDay: (dateKey, copy) => {
        const stored = parseStoredHerDay({
          natal: copy.natal,
          beats: copy.beats,
          skyLine: copy.skyLine,
          source: copy.source,
        });
        if (!stored) return;
        set((state) => ({ herDayByDay: { ...state.herDayByDay, [dateKey]: stored } }));
      },
      herDayFor: (dateKey) => get().herDayByDay[dateKey],
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
        herDayByDay: state.herDayByDay,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<
          Pick<
            ChartState,
            "setup" | "lastFiredDate" | "askedBirthday" | "diaryByDay" | "herDayByDay"
          >
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
          herDayByDay: parseHerDayByDay(p.herDayByDay),
          hydrated: false,
        };
      },
    },
  ),
);

export function storedToHerDay(stored: StoredHerDay): HerDayCopy {
  const copy: HerDayCopy = {
    heading: "Her day",
    natal: stored.natal,
    beats: stored.beats,
    source: stored.source,
  };
  if (stored.skyLine) copy.skyLine = stored.skyLine;
  return copy;
}
