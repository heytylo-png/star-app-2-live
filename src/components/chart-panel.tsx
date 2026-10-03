import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { localDateKey } from "@/lib/chart";
import {
  chartAskDraft,
  chartMenuDiaryLine,
  chartMenuSun,
  chartMenuTodaySunLine,
  composeChartAstronomyReading,
  msUntilNextLocalDate,
  shownChartReading,
} from "@/lib/chart-menu";
import { useChartStore } from "@/lib/chart-store";
import { computeSkyFacts } from "@/lib/sky";
import { lastDiaryEntry } from "@/lib/shell";

type ChartMenuProps = {
  open: boolean;
  userSun?: string;
  birthDate?: string;
  onAsk: (draft: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
};

/**
 * Compact Chart menu anchored to the Chart tab.
 * Sun, today's sky note, and the last diary page. Not a sheet and not a spoken reading.
 */
export function ChartMenu({ open, userSun, birthDate, onAsk, onClose, anchorRef }: ChartMenuProps) {
  const diaryByDay = useChartStore((s) => s.diaryByDay);
  const [clock, setClock] = useState(() => new Date());
  const dateKey = localDateKey(clock);
  const cachedNote = useChartStore((s) => s.skyNoteByDay[dateKey]);
  const sky = computeSkyFacts(clock);
  const freshNote = useMemo(
    () =>
      composeChartAstronomyReading({
        dateKey,
        sky,
      }),
    [dateKey, sky?.sunSignToday, sky?.moonSignToday, sky?.moonPhase, sky?.notableAspect],
  );
  const liveSun = sky?.sunSignToday;
  const reading = shownChartReading(cachedNote, freshNote, liveSun);
  const last = lastDiaryEntry(diaryByDay);
  const sunLine = chartMenuTodaySunLine(liveSun);
  const diaryLine = chartMenuDiaryLine(last);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    useChartStore.getState().lockSkyNote(dateKey, freshNote, liveSun);
  }, [dateKey, freshNote, liveSun]);

  useEffect(() => {
    if (open) setClock(new Date());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    if (localDateKey(now) !== localDateKey(clock)) {
      setClock(now);
      return;
    }
    const delay = msUntilNextLocalDate(clock);
    const timer = window.setTimeout(() => setClock(new Date()), delay);
    const onVisible = () => {
      if (document.visibilityState === "visible") setClock(new Date());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, clock]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      if (anchorRef?.current?.contains(node)) return;
      event.preventDefault();
      onCloseRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef]);

  if (!open) return null;

  const diaryEmpty = diaryLine === "No diary yet";

  return (
    <div
      id="star-chart-menu"
      role="region"
      aria-labelledby="star-tab-chart"
      className="chart-menu"
    >
      <p className="px-0.5 text-xs text-muted" aria-label="Today's sun">
        {sunLine}
      </p>

      <div className="mt-1.5 border-t border-border pt-1.5">
        <p className="px-0.5 text-[0.65rem] tracking-wide text-subtle uppercase">Daily astronomy reading</p>
        <p className="mt-1 px-0.5 text-xs leading-snug whitespace-pre-line text-muted">{reading}</p>
      </div>

      <div className="mt-1.5 border-t border-border pt-1.5">
        <p className="px-0.5 text-[0.65rem] tracking-wide text-subtle uppercase">Last diary</p>
        <p className={`mt-1 px-0.5 text-sm leading-snug ${diaryEmpty ? "text-subtle" : "text-muted"}`}>
          {diaryLine}
        </p>
      </div>

      <button
        type="button"
        className="mt-2 w-full rounded-sm px-1.5 py-1 text-left text-sm text-fg hover:bg-bg"
        onClick={() =>
          onAsk(chartAskDraft({ text: last?.text, userSun: chartMenuSun({ userSun, birthDate }) }))
        }
      >
        Ask her in Chat
      </button>
    </div>
  );
}
