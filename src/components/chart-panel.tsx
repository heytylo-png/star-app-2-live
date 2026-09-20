import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { composeDiaryEntry, HER_CHART, localDateKey, localHerDay, natalFromSetup } from "@/lib/chart";
import { storedToHerDay, useChartStore } from "@/lib/chart-store";
import { clockTimeZone, readLocalNow } from "@/lib/clock";
import { requestHerDayCopy } from "@/lib/her-day";
import { lockHerDailyMood } from "@/lib/her-suggest";
import { useMemoryStore } from "@/lib/memory-store";
import { birthDateInputValue, lastDiaryEntry } from "@/lib/shell";
import { composeSkyDashboard, computeSkyFacts, type HerDayCopy } from "@/lib/sky";
import { cn } from "@/lib/utils";

type ChartPanelProps = {
  userSun?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
};

/**
 * Sparse Chart pane — daily theme, her-day section, sky labels, quiet birth edit.
 * Layout inspiration only (not Co-Star brand/copy). No wheel.
 * Opening Chart does not post to Chat. Her-day copy is local first; optional
 * Grok Chart/her-day once per local day (fail soft).
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
  const [herDay, setHerDay] = useState<HerDayCopy | null>(null);

  const dash = useMemo(() => {
    const tz = clockTimeZone(timezone);
    const clock = readLocalNow(new Date(), tz);
    const todayDate = localDateKey(new Date(), tz);
    const sky = computeSkyFacts(new Date());
    return {
      todayDate,
      sky,
      view: composeSkyDashboard({
        todayDate,
        weekday: clock.weekday,
        sky,
        userSun,
        herSun: HER_CHART.her_sun,
      }),
      localHer: localHerDay({ todayDate, sky }),
    };
  }, [timezone, userSun]);

  useEffect(() => {
    lockHerDailyMood();
  }, [dash.todayDate]);

  useEffect(() => {
    const cached = useChartStore.getState().herDayFor(dash.todayDate);
    if (cached) {
      setHerDay(storedToHerDay(cached));
      return;
    }
    setHerDay(dash.localHer);
    let cancelled = false;
    void requestHerDayCopy({ todayDate: dash.todayDate, sky: dash.sky }).then((copy) => {
      if (cancelled) return;
      useChartStore.getState().saveHerDay(dash.todayDate, copy);
      setHerDay(copy);
    });
    return () => {
      cancelled = true;
    };
  }, [dash.todayDate, dash.localHer, dash.sky]);

  const her = herDay ?? dash.localHer;

  return (
    <section
      id="star-pane-chart"
      role="tabpanel"
      aria-labelledby="star-tab-chart"
      className="mx-3 mb-1 mt-auto w-full max-w-lg max-h-[min(40rem,78%)] min-h-0 self-center overflow-y-auto rounded-xl bg-elevated/92 px-5 py-5 shadow-[var(--shadow-border)] backdrop-blur-[2px] sm:mx-auto"
    >
      <p className="text-[0.65rem] tracking-[0.22em] text-subtle uppercase">
        {dash.view.weekday ? `${dash.view.weekday} · ${dash.view.dateLine}` : dash.view.dateLine}
      </p>
      <p className="font-display mt-3 max-w-[22rem] text-[1.65rem] leading-[1.15] text-fg italic sm:text-[1.85rem]">
        {dash.view.theme}
      </p>

      {dash.view.doLine || dash.view.dontLine ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {dash.view.doLine ? (
            <p className="min-w-0">
              <span className="block text-[0.65rem] tracking-[0.18em] text-subtle uppercase">Do</span>
              <span className="mt-1 block text-sm leading-snug text-fg">{dash.view.doLine}</span>
            </p>
          ) : (
            <span />
          )}
          {dash.view.dontLine ? (
            <p className="min-w-0">
              <span className="block text-[0.65rem] tracking-[0.18em] text-subtle uppercase">Don&apos;t</span>
              <span className="mt-1 block text-sm leading-snug text-fg">{dash.view.dontLine}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-label="Star Rai's day" className="mt-6 border-t border-border pt-4">
        <p className="text-[0.65rem] tracking-[0.18em] text-subtle uppercase">{her.heading}</p>
        <p className="font-display mt-1 text-xl leading-tight text-fg">{her.natal}</p>
        {her.skyLine ? <p className="mt-1 text-sm text-muted">{her.skyLine}</p> : null}
        <div className="mt-3 space-y-1.5">
          {her.beats.map((beat) => (
            <p key={beat} className="max-w-[22rem] text-sm leading-snug text-fg">
              {beat}
            </p>
          ))}
        </div>
      </section>

      <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
        {dash.view.labels.map((row) => (
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
