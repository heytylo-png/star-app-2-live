import { useEffect, useId, useRef, useState } from "react";
import {
  BookMarked,
  ChevronDown,
  Phone,
  PhoneOff,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { STAGE_MENU_ITEMS } from "@/lib/stage-menu";
import { cn } from "@/lib/utils";

type StageMenuProps = {
  status: string;
  statusDotClass: string;
  tierLabel: string;
  streakDays: number;
  brainLabel: string;
  callActive: boolean;
  callStarting: boolean;
  callSupported: boolean;
  callBlockedReason?: string;
  voiceOn: boolean;
  memoryCount: number;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  onToggleCall: () => void;
  onToggleVoice: () => void;
};

export function StageMenu({
  status,
  statusDotClass,
  tierLabel,
  streakDays,
  brainLabel,
  callActive,
  callStarting,
  callSupported,
  callBlockedReason,
  voiceOn,
  memoryCount,
  onOpenSettings,
  onOpenMemory,
  onToggleCall,
  onToggleVoice,
}: StageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const onCall = callActive || callStarting;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPtr = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPtr);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPtr);
    };
  }, [open]);

  function openSettings() {
    setOpen(false);
    onOpenSettings();
  }

  function openMemory() {
    setOpen(false);
    onOpenMemory();
  }

  const callLabel = onCall ? "Hang up" : "Start call";
  const callTitle = !callSupported || callBlockedReason ? callBlockedReason || "Speech input unavailable" : callLabel;
  const voiceLabel = voiceOn ? "Mute voice" : "Unmute voice";

  return (
    <header
      ref={rootRef}
      className="stage-top-bar pointer-events-auto relative z-20 shrink-0"
    >
      <div className="flex h-[var(--rai-top-bar)] items-center gap-2 px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl leading-none tracking-tight sm:text-2xl">Star Rai</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.65rem] tracking-widest text-muted uppercase sm:text-xs">
            <span className={statusDotClass} aria-hidden />
            <span className="min-w-0 truncate">
              {status}
              <span className="normal-case tracking-wide text-subtle">
                {" · "}
                {tierLabel}
                {streakDays >= 2 ? ` · ${streakDays}d` : ""}
                {" · "}
                {brainLabel}
              </span>
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 gap-1 px-2.5"
        >
          Menu
          <ChevronDown className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
        </Button>
      </div>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Star Rai"
          className="stage-top-menu absolute inset-x-3 top-full z-30 mt-1 max-w-lg rounded-xl bg-elevated py-1.5 shadow-[var(--shadow-border)] sm:inset-x-auto sm:right-4 sm:left-auto sm:w-[min(100%,20rem)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-bg"
            onClick={openSettings}
          >
            <Settings className="size-4 shrink-0 text-muted" aria-hidden />
            <span>{STAGE_MENU_ITEMS[0].label}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-bg"
            onClick={openMemory}
          >
            <BookMarked className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="flex-1">{STAGE_MENU_ITEMS[1].label}</span>
            {memoryCount > 0 ? <span className="text-xs text-muted">{memoryCount}</span> : null}
          </button>
          <div className="mx-3 my-1 border-t border-border" />
          <div className="px-3 py-2" role="group" aria-label={STAGE_MENU_ITEMS[2].label}>
            <p className="text-[0.65rem] tracking-wide text-subtle uppercase">{STAGE_MENU_ITEMS[2].label}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant={onCall ? "default" : "secondary"}
                size="sm"
                className={cn("flex-1", onCall && "ring-2 ring-ring")}
                aria-label={callLabel}
                aria-pressed={onCall}
                title={callTitle}
                onClick={onToggleCall}
              >
                {onCall ? <PhoneOff className="size-3.5" /> : <Phone className="size-3.5" />}
                {onCall ? "Hang up" : "Call"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                aria-label={voiceLabel}
                aria-pressed={voiceOn}
                onClick={onToggleVoice}
              >
                {voiceOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                {voiceOn ? "Voice on" : "Muted"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
