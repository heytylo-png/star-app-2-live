import { usePresenceMode, type PresenceMode } from "@/lib/presence-mode";
import { cn } from "@/lib/utils";

const OPTIONS: { id: PresenceMode; label: string }[] = [
  { id: "toon", label: "3D" },
  { id: "png", label: "PNG" },
];

export function PresenceToggle({ className }: { className?: string }) {
  const mode = usePresenceMode((s) => s.mode);
  const setMode = usePresenceMode((s) => s.setMode);

  return (
    <div
      className={cn(
        "flex rounded-full bg-elevated p-0.5 shadow-[var(--shadow-border)]",
        className,
      )}
      role="group"
      aria-label="Presence mode"
    >
      {OPTIONS.map((opt) => {
        const on = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={on}
            onClick={() => setMode(opt.id)}
            className={cn(
              "h-7 rounded-full px-2.5 text-[11px] tracking-wide transition-colors duration-150",
              on ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
