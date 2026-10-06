import { useState } from "react";
import { Button } from "@/components/ui/button";

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
      className="birthday-card"
      aria-label="Birthday"
      onSubmit={(e) => {
        e.preventDefault();
        if (!date.trim()) return;
        onSave({ date: date.trim(), time: time.trim(), place: place.trim() });
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-base leading-tight">Birthday, if you want</p>
          <p className="text-[0.65rem] leading-snug text-muted">Date helps. Time and place are extra.</p>
        </div>
        <Button type="button" size="sm" onClick={onSkip}>
          Skip
        </Button>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <label className="text-[0.65rem] text-muted">
          Date
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-sm bg-bg px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="text-[0.65rem] text-muted">
          Time
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-sm bg-bg px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="col-span-2 text-[0.65rem] text-muted">
          Place
          <input
            type="text"
            autoComplete="off"
            placeholder="City, optional"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            className="mt-0.5 h-8 w-full rounded-sm bg-bg px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      <div className="mt-1.5 flex justify-end">
        <Button type="submit" variant="secondary" size="sm" disabled={!date.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}
