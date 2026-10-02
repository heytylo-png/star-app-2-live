import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { natalFromSetup } from "@/lib/chart";
import { chartAskDraft, chartMenuDiaryLine, chartMenuTodaySunLine } from "@/lib/chart-menu";
import { useChartStore } from "@/lib/chart-store";
import { useMemoryStore } from "@/lib/memory-store";
import { computeSkyFacts } from "@/lib/sky";
import { birthDateInputValue, lastDiaryEntry } from "@/lib/shell";

type ChartMenuProps = {
  open: boolean;
  userSun?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
  onAsk: (draft: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
};

/**
 * Compact Chart menu anchored to the Chart tab.
 * Sun, birth edit, and the last diary page. Not a sheet and not a reading.
 */
export function ChartMenu({
  open,
  userSun,
  birthDate,
  birthTime,
  birthPlace,
  onAsk,
  onClose,
  anchorRef,
}: ChartMenuProps) {
  const diaryByDay = useChartStore((s) => s.diaryByDay);
  const last = lastDiaryEntry(diaryByDay);
  const sunLine = chartMenuTodaySunLine(computeSkyFacts()?.sunSignToday);
  const diaryLine = chartMenuDiaryLine(last);
  const [birthOpen, setBirthOpen] = useState(false);
  const [date, setDate] = useState(() => birthDateInputValue(birthDate));
  const [time, setTime] = useState(birthTime ?? "");
  const [place, setPlace] = useState(birthPlace ?? "");
  const [saved, setSaved] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) setBirthOpen(false);
  }, [open]);

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
      data-editing={birthOpen ? "true" : "false"}
      className="chart-menu"
    >
      <p className="px-0.5 text-xs text-muted" aria-label="Today's sun">
        {sunLine}
      </p>

      <button
        type="button"
        aria-expanded={birthOpen}
        aria-controls="star-chart-birth"
        onClick={() => setBirthOpen((value) => !value)}
        className="mt-1 flex w-full items-center rounded-sm px-1.5 py-1 text-left text-sm text-fg hover:bg-bg"
      >
        Edit birth
      </button>

      {birthOpen ? (
        <form
          id="star-chart-birth"
          className="mt-1 space-y-2 px-0.5"
          onSubmit={(event) => {
            event.preventDefault();
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
              onChange={(event) => {
                setDate(event.target.value);
                setSaved(false);
              }}
              className="mt-1 h-9 w-full rounded-sm bg-bg px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block text-xs text-muted">
            Time
            <input
              type="time"
              value={time}
              onChange={(event) => {
                setTime(event.target.value);
                setSaved(false);
              }}
              className="mt-1 h-9 w-full rounded-sm bg-bg px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="block text-xs text-muted">
            Place
            <input
              type="text"
              autoComplete="off"
              placeholder="City, optional"
              value={place}
              onChange={(event) => {
                setPlace(event.target.value);
                setSaved(false);
              }}
              className="mt-1 h-9 w-full rounded-sm bg-bg px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!date.trim()}>
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-2 border-t border-border pt-1.5">
        <p className="px-0.5 text-[0.65rem] tracking-wide text-subtle uppercase">Last diary</p>
        <p className={`mt-1 px-0.5 text-sm leading-snug ${diaryEmpty ? "text-subtle" : "text-muted"}`}>
          {diaryLine}
        </p>
      </div>

      <button
        type="button"
        className="mt-2 w-full rounded-sm px-1.5 py-1 text-left text-sm text-fg hover:bg-bg"
        onClick={() => onAsk(chartAskDraft({ text: last?.text, userSun }))}
      >
        Ask her in Chat
      </button>
    </div>
  );
}
