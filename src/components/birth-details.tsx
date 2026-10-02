import { useState } from "react";
import { Button } from "@/components/ui/button";
import { natalFromSetup } from "@/lib/chart";
import { useChartStore } from "@/lib/chart-store";
import { useMemoryStore } from "@/lib/memory-store";
import { birthDateInputValue } from "@/lib/shell";

type BirthDetailsEditorProps = {
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
};

/**
 * The existing date / time / place editor. Opened from Menu settings.
 * Not a new form and not a Chart-tab row.
 */
export function BirthDetailsEditor({ birthDate, birthTime, birthPlace }: BirthDetailsEditorProps) {
  const [date, setDate] = useState(() => birthDateInputValue(birthDate));
  const [time, setTime] = useState(birthTime ?? "");
  const [place, setPlace] = useState(birthPlace ?? "");
  const [saved, setSaved] = useState(false);

  return (
    <form
      id="star-birth-details"
      className="space-y-2"
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
  );
}
