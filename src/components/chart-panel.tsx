import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { composeDiaryEntry, HER_CHART, localDateKey, natalFromSetup } from "@/lib/chart";
import { useChartStore } from "@/lib/chart-store";
import { clockTimeZone, readLocalNow } from "@/lib/clock";
import { useMemoryStore } from "@/lib/memory-store";
import { birthDateInputValue, lastDiaryEntry } from "@/lib/shell";
import { composeSkyDashboard, computeSkyFacts } from "@/lib/sky";
import { cn } from "@/lib/utils";

type ChartPanelProps = {
  userSun?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
};

/**
 * Sparse Chart pane — daily theme, sky labels, quiet birth edit.
 * Layout inspiration only (not Co-Star brand/copy). No wheel. No Grok on open.
 */
export function ChartPanel({ userSun, birthDate, birthTime, birthPlace }: ChartPanelProps) {
  const diaryByDay = useChartStore((s) => s.diaryByDay);
  const timezone = useMemoryStore((s) => s.slots.timezone);
  const last = lastDiaryEntry(diaryByDay);
  const [date, setDate] = useState(() => birthDateInputValue(birthDate));
  const [time, setTime] = useState(birthTime ?? "");
  const [place, setPlace] = useState(birthPlace ?? "");
  const [saved, setSaved] = useState(false);
  const [birthOpen, setBirthOpen] = useState(false);

  const dash = useMemo(() => {
    const tz = clockTimeZone(timezone);
    const clock = readLocalNow(new Date(), tz);
    const todayDate = localDateKey(new Date(), tz);
    const sky = computeSkyFacts(new Date());
    return composeSkyDashboard({
      todayDate,
      weekday: clock.weekday,
      sky,
      userSun,
      herSun: HER_CHART.her_sun,
    });
  }, [timezone, userSun]);

  return (
    <section
      id="star-pane-chart"
      role="tabpanel"
      aria-labelledby="star-tab-chart"
      className="mx-3 mb-1 mt-auto max-h-[min(40rem,78%)] min-h-0 overflow-y-auto rounded-xl bg-elevated/92 px-5 py-5 shadow-[var(--shadow-border)] backdrop-blur-[2px] sm:mx-4 sm:px-6"
    >
      <p className="text-[0.65rem] tracking-[0.22em] text-subtle uppercase">
        {dash.weekday ? `${dash.weekday} · ${dash.dateLine}` : dash.dateLine}
      </p>
      <p className="font-display mt-3 max-w-[22rem] text-[1.65rem] leading-[1.15] text-fg italic sm:text-[1.85rem]">
        {dash.theme}
      </p>

      {dash.doLine || dash.dontLine ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {dash.doLine ? (
            <p className="min-w-0">
              <span className="block text-[0.65rem] tracking-[0.18em] text-subtle uppercase">Do</span>
              <span className="mt-1 block text-sm leading-snug text-fg">{dash.doLine}</span>
            </p>
          ) : (
            <span />
          )}
          {dash.dontLine ? (
            <p className="min-w-0">
              <span className="block text-[0.65rem] tracking-[0.18em] text-subtle uppercase">Don&apos;t</span>
              <span className="mt-1 block text-sm leading-snug text-fg">{dash.dontLine}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        {dash.labels.map((row) => (
          <li key={row.key} className="min-w-0">
            <p className="text-[0.65rem] tracking-[0.18em] text-subtle uppercase">{row.label}</p>
            <p className="font-display mt-0.5 text-xl leading-tight text-fg">{row.value}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t border-border pt-3">
        <button
          type="button"
          aria-expanded={birthOpen}
          aria-controls="star-chart-birth"
          onClick={() => setBirthOpen((v) => !v)}
          className="flex w-full items-baseline justify-between gap-3 text-left"
        >
          <span className="text-[0.65rem] tracking-[0.18em] text-subtle uppercase">Birth</span>
          <span className="truncate text-xs text-muted">
            {userSun
              ? `${userSun}${birthPlace ? ` · ${birthPlace}` : ""}`
              : "Add a date if you want the glance"}
          </span>
        </button>

        <form
          id="star-chart-birth"
          hidden={!birthOpen}
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
          <div className="flex items-center justify-end pt-1">
            <Button type="submit" size="sm" disabled={!date.trim()}>
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
        </form>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[0.65rem] tracking-[0.18em] text-subtle uppercase">Diary</p>
        {last ? (
          <p className="mt-1 text-sm leading-relaxed text-muted">
            <span className="text-subtle">{last.dateKey} · </span>
            {last.text}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">On ask only — never auto-posted to Chat.</p>
        )}
        <button
          type="button"
          className={cn("mt-2 text-xs text-muted hover:text-fg")}
          onClick={() => {
            const tz = clockTimeZone(useMemoryStore.getState().slots.timezone);
            const dateKey = localDateKey(new Date(), tz);
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
          {last?.dateKey ===
          localDateKey(new Date(), clockTimeZone(useMemoryStore.getState().slots.timezone))
            ? "Today's page is written"
            : "Write today's diary"}
        </button>
      </div>
    </section>
  );
}
