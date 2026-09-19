import { useState } from "react";
import { Button } from "@/components/ui/button";
import { composeDiaryEntry, localDateKey, natalFromSetup } from "@/lib/chart";
import { useChartStore } from "@/lib/chart-store";
import { useMemoryStore } from "@/lib/memory-store";
import { birthDateInputValue, lastDiaryEntry } from "@/lib/shell";

type ChartPanelProps = {
  userSun?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
};

/**
 * Chart pane — natal edit + last diary. No wheel. No auto-reading.
 * Grok stays on Chat. Saving patches slots only.
 */
export function ChartPanel({ userSun, birthDate, birthTime, birthPlace }: ChartPanelProps) {
  const diaryByDay = useChartStore((s) => s.diaryByDay);
  const last = lastDiaryEntry(diaryByDay);
  const [date, setDate] = useState(() => birthDateInputValue(birthDate));
  const [time, setTime] = useState(birthTime ?? "");
  const [place, setPlace] = useState(birthPlace ?? "");
  const [saved, setSaved] = useState(false);

  return (
    <section
      id="star-pane-chart"
      role="tabpanel"
      aria-labelledby="star-tab-chart"
      className="mx-3 mb-1 mt-auto max-h-[min(32rem,68%)] min-h-0 overflow-y-auto rounded-xl bg-elevated/88 px-4 py-3 shadow-[var(--shadow-border)] backdrop-blur-[2px] sm:mx-4"
    >
      <p className="font-display text-xl leading-tight">Chart</p>
      <p className="mt-0.5 text-xs text-muted">Sun and date only. No wheel. No reading on open.</p>

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date.trim()) return;
          const natal = natalFromSetup({ date: date.trim(), time: time.trim(), place: place.trim() });
          if (!natal.user_birth_date) return;
          useMemoryStore.getState().patchSlots({
            ...natal,
            user_birth_time: natal.user_birth_time ?? "",
            user_birth_place: natal.user_birth_place ?? "",
          });
          useChartStore.getState().markSetupDone();
          setSaved(true);
        }}
      >
        <label className="block text-xs text-muted">
          Birth date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSaved(false);
            }}
            className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            Time
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setSaved(false);
              }}
              className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="text-xs text-muted">
            Place
            <input
              type="text"
              autoComplete="off"
              placeholder="City, optional"
              value={place}
              onChange={(e) => {
                setPlace(e.target.value);
                setSaved(false);
              }}
              className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted">
            {userSun ? (
              <>
                user_sun · <span className="text-fg">{userSun}</span>
              </>
            ) : (
              "user_sun · none yet"
            )}
          </p>
          <Button type="submit" size="sm" disabled={!date.trim()}>
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </form>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Last diary</p>
        {last ? (
          <p className="mt-1 text-sm leading-relaxed">
            <span className="text-subtle">{last.dateKey} · </span>
            {last.text}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">No page yet. On ask only — never auto-posted to Chat.</p>
        )}
        <button
          type="button"
          className="mt-2 text-xs text-muted hover:text-fg"
          onClick={() => {
            const dateKey = localDateKey();
            const existing = useChartStore.getState().diaryFor(dateKey);
            const slots = useMemoryStore.getState().slots;
            const text =
              existing ??
              composeDiaryEntry({
                todayDate: dateKey,
                lastTopic: slots.last_topic,
                userSun: slots.user_sun,
                mood: slots.mood,
              });
            useChartStore.getState().saveDiary(dateKey, text);
          }}
        >
          {last?.dateKey === localDateKey() ? "Today's page is written" : "Write today's diary"}
        </button>
      </div>
    </section>
  );
}
