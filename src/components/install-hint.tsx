import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "star-rai-install-hint-dismissed";
const SEEN_CHAT_KEY = "star-rai-install-hint-armed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)");
  if (mq.matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Android-only tip — show after the visitor has engaged once (or returns),
 * not on the coldest first paint. Hidden when already installed / dismissed.
 */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (isStandalone()) return;
      if (!isAndroid()) return;
      if (localStorage.getItem(DISMISS_KEY) === "1") return;

      const armed = localStorage.getItem(SEEN_CHAT_KEY) === "1";
      // Arm on first visit; show on a later session or after a short delay once armed.
      if (!armed) {
        localStorage.setItem(SEEN_CHAT_KEY, "1");
        // First run: wait until they've had a moment with her, then soft-offer.
        const t = window.setTimeout(() => setShow(true), 45_000);
        return () => window.clearTimeout(t);
      }
      const t = window.setTimeout(() => setShow(true), 2_500);
      return () => window.clearTimeout(t);
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
        "bg-elevated/95 px-3 py-2 text-sm text-fg shadow-[var(--shadow-border)] backdrop-blur-[2px]",
      )}
      role="status"
    >
      <Download className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 text-xs leading-snug text-muted sm:text-sm">
        <span className="font-medium text-fg">Add to Home Screen</span>
        {" — "}
        Chrome ⋮ → Install app for full-screen Star Rai.
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
