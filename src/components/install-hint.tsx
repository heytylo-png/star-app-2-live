import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "star-rai-install-hint-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)");
  if (mq.matches) return true;
  // iOS Safari legacy
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** Small Android-only tip to Add to Home Screen when not already installed. */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (isStandalone()) return;
      if (!isAndroid()) return;
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      setShow(true);
    } catch {
      /* private mode etc. */
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div
      className={cn(
        "pointer-events-auto mx-auto mb-2 flex max-w-lg items-start gap-2 rounded-xl",
        "bg-elevated/95 px-3 py-2.5 text-sm text-fg shadow-[var(--shadow-border)] backdrop-blur-[2px]",
      )}
      role="status"
    >
      <Download className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 leading-snug text-muted">
        <span className="font-medium text-fg">Install / Add to Home Screen</span>
        {" — "}
        Chrome menu (⋮) → Install app or Add to Home screen for a full-screen Star Rai.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss install hint"
        className="shrink-0"
        onClick={dismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
