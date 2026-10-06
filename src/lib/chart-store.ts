import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { lockChartReading } from "./chart-menu.ts";
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
  /** Once-per-local-day Chart menu sky note. Not a Grok reading. */
  skyNoteByDay: Record<string, string>;
  setHydrated: (value: boolean) => void;
  markSetupSkipped: () => void;
  markSetupDone: () => void;
  markFired: (dateKey: string) => void;
  markAskedBirthday: () => void;
  saveDiary: (dateKey: string, text: string) => void;
  diaryFor: (dateKey: string) => string | undefined;
  saveHerDay: (dateKey: string, copy: HerDayCopy) => void;
  herDayFor: (dateKey: string) => StoredHerDay | undefined;
  lockSkyNote: (dateKey: string, text: string, liveSun?: string | null) => void;
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

function parseSkyNoteByDay(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || typeof row !== "string") continue;
    const text = row
      .split(/\n+/)
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join("\n");
    if (text) out[key] = text;
  }
  return out;
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

type ChartPersist = Pick<
  ChartState,
  "setup" | "lastFiredDate" | "askedBirthday" | "diaryByDay" | "herDayByDay" | "skyNoteByDay"
>;

/** Reload keeps a skipped or finished birthday card, including across a new day. */
export function mergeChartPersist(persisted: unknown, current: ChartState): ChartState {
  const p = (persisted ?? {}) as Partial<ChartPersist>;
  const setup =
    p.setup === "skipped" || p.setup === "done" || p.setup === "pending" ? p.setup : current.setup;
  return {
    ...current,
    setup,
    lastFiredDate: typeof p.lastFiredDate === "string" ? p.lastFiredDate : current.lastFiredDate,
    askedBirthday: typeof p.askedBirthday === "boolean" ? p.askedBirthday : current.askedBirthday,
    diaryByDay: p.diaryByDay && typeof p.diaryByDay === "object" ? p.diaryByDay : current.diaryByDay,
    herDayByDay: parseHerDayByDay(p.herDayByDay),
    skyNoteByDay: parseSkyNoteByDay(p.skyNoteByDay),
    hydrated: false,
  };
}

export const useChartStore = create<ChartState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      setup: "pending",
      lastFiredDate: null,
      askedBirthday: false,
      diaryByDay: {},
      herDayByDay: {},
      skyNoteByDay: {},
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
      lockSkyNote: (dateKey, text, liveSun) => {
        set((state) => {
          const next = lockChartReading(state.skyNoteByDay, dateKey, text, { liveSun });
          if (next === state.skyNoteByDay) return state;
          return { skyNoteByDay: next };
        });
      },
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
        skyNoteByDay: state.skyNoteByDay,
      }),
      merge: (persisted, current) => mergeChartPersist(persisted, current),
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
