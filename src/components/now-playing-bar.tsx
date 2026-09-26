import { Button } from "@/components/ui/button";
import { lifeNowPlayingChrome } from "@/lib/life";
import { cn } from "@/lib/utils";

type NowPlayingBarProps = {
  sessionOn: boolean;
  nowPlaying?: string;
  onStop: () => void;
  className?: string;
};

/**
 * Life now-playing: the track title and a Stop button.
 * No paste field and no connect prompt.
 */
export function NowPlayingBar({ sessionOn, nowPlaying, onStop, className }: NowPlayingBarProps) {
  const chrome = lifeNowPlayingChrome({ sessionOn, title: nowPlaying });
  if (!chrome.title || !chrome.showStop || chrome.showLogin || chrome.showConnect) return null;

  return (
    <div
      className={cn(
        "mx-auto mb-2 flex w-full max-w-lg items-center justify-between gap-3 rounded-xl bg-elevated/92 px-3 py-2 shadow-[var(--shadow-border)] backdrop-blur-[2px]",
        className,
      )}
    >
      <p className="min-w-0 truncate text-sm text-fg">{chrome.title}</p>
      <Button type="button" variant="ghost" size="sm" onClick={onStop}>
        Stop
      </Button>
    </div>
  );
}
