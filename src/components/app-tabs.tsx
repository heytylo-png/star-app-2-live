import { MessageCircle, Music2, Sun } from "lucide-react";
import { SHELL_TAB_LABEL, SHELL_TABS, type ShellTab } from "@/lib/shell";
import { cn } from "@/lib/utils";

const TAB_ICON: Record<ShellTab, typeof MessageCircle> = {
  chat: MessageCircle,
  chart: Sun,
  life: Music2,
};

type AppTabsProps = {
  tab: ShellTab;
  onChange: (tab: ShellTab) => void;
  sessionOn?: boolean;
};

export function AppTabs({ tab, onChange, sessionOn }: AppTabsProps) {
  return (
    <nav
      aria-label="Star Rai"
      className="pointer-events-auto shrink-0 border-t border-border bg-bg/95 px-2 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur-[2px]"
    >
      <div role="tablist" aria-label="Chat, Chart, Life" className="mx-auto grid max-w-lg grid-cols-3 gap-1">
        {SHELL_TABS.map((id) => {
          const Icon = TAB_ICON[id];
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`star-pane-${id}`}
              id={`star-tab-${id}`}
              onClick={() => onChange(id)}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-[0.65rem] tracking-wide uppercase transition-colors duration-150",
                active ? "bg-elevated text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg",
              )}
            >
              <span className="relative">
                <Icon className="size-4" aria-hidden />
                {id === "life" && sessionOn ? (
                  <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-fg" aria-hidden />
                ) : null}
              </span>
              {SHELL_TAB_LABEL[id]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
