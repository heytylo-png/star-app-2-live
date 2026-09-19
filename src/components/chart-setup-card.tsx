import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChartSetupCardProps = {
  onSkip: () => void;
  onSave: (fields: { date: string; time: string; place: string }) => void;
};

/**
 * First-launch overlay. Lightweight — puppet stays visible behind it.
 * Skip always available. Date required to save.
 */
export function ChartSetupCard({ onSkip, onSave }: ChartSetupCardProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");

  return (
    <form
      className={cn(
        "mx-auto mb-2 w-full max-w-lg rounded-xl bg-elevated/88 px-4 py-2.5 shadow-[var(--shadow-border)] backdrop-blur-[2px]",
      )}
      onSubmit={(e) => {
        e.preventDefault();
        if (!date.trim()) return;
        onSave({ date: date.trim(), time: time.trim(), place: place.trim() });
      }}
    >
      <p className="font-display text-lg leading-tight">Birthday, if you want</p>
      <p className="mt-0.5 text-xs text-muted">Date helps. Time and place are extra. Skip anytime.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs text-muted sm:col-span-1">
          Date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="col-span-2 text-xs text-muted sm:col-span-1">
          Time
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="col-span-2 text-xs text-muted">
          Place
          <input
            type="text"
            autoComplete="off"
            placeholder="City, optional"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className="mt-1 h-10 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
          Skip
        </Button>
        <Button type="submit" size="sm" disabled={!date.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}
