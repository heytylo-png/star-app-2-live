import { ChevronUp, MessageCircle, Music2, Sun } from "lucide-react";
import { cloneElement, isValidElement, useRef, type ReactElement, type ReactNode, type RefObject } from "react";
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
  lifeMenuOpen?: boolean;
  onToggleLifeMenu?: () => void;
  lifeMenu?: ReactNode;
  lifeTabRef?: RefObject<HTMLButtonElement | null>;
};

function anchorMenu(node: ReactNode, anchorRef: RefObject<HTMLDivElement | null>) {
  if (!isValidElement(node)) return node;
  return cloneElement(node as ReactElement<{ anchorRef?: RefObject<HTMLElement | null> }>, { anchorRef });
}

export function AppTabs({
  tab,
  onChange,
  sessionOn,
  lifeMenuOpen = false,
  onToggleLifeMenu,
  lifeMenu,
  lifeTabRef,
}: AppTabsProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const lifeOpen = tab === "life" && lifeMenuOpen;

  return (
    <nav
      aria-label="Star Rai"
      className="pointer-events-auto shrink-0 border-t border-border bg-bg/95 px-2 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur-[2px]"
    >
      <div role="tablist" aria-label="Chat, Chart, Life" className="mx-auto grid max-w-lg grid-cols-3 gap-1">
        {SHELL_TABS.map((id) => {
          const Icon = TAB_ICON[id];
          const active = tab === id;
          const life = id === "life";
          const tabButton = (
            <button
              key={id}
              ref={life ? lifeTabRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={life ? "star-pane-life star-life-menu" : `star-pane-${id}`}
              aria-expanded={life ? lifeOpen : undefined}
              id={`star-tab-${id}`}
              onClick={() => {
                if (life && tab === "life") onToggleLifeMenu?.();
                else onChange(id);
              }}
              className={cn(
                "flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md text-[0.65rem] tracking-wide uppercase transition-colors duration-150",
                active ? "bg-elevated text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg",
              )}
            >
              <span className="relative">
                <Icon className="size-4" aria-hidden />
                {life && sessionOn ? (
                  <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-fg" aria-hidden />
                ) : null}
              </span>
              {SHELL_TAB_LABEL[id]}
            </button>
          );
          if (!life) return tabButton;
          return (
            <div key={id} ref={anchorRef} className="relative">
              {anchorMenu(lifeMenu, anchorRef)}
              {tabButton}
              <button
                type="button"
                aria-label="Life menu"
                aria-expanded={lifeOpen}
                aria-controls="star-life-menu"
                onClick={() => {
                  if (tab !== "life") onChange("life");
                  else {
                    onToggleLifeMenu?.();
                    if (lifeOpen) lifeTabRef?.current?.focus();
                  }
                }}
                className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-sm text-muted hover:text-fg"
              >
                <ChevronUp className={cn("size-3 transition-transform duration-150", lifeOpen && "rotate-180")} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
