import { useState } from "react";
import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NowPlayingBarProps = {
  sessionOn: boolean;
  nowPlaying?: string;
  moodTag?: string;
  onSetTitle: (title: string) => void;
  onStop: () => void;
  className?: string;
};

/**
 * Lightweight composer affordance — paste a title, no OAuth.
 * Never blocks Chat. Session stop is one tap. Next title still works in-session.
 */
export function NowPlayingBar({
  sessionOn,
  nowPlaying,
  moodTag,
  onSetTitle,
  onStop,
  className,
}: NowPlayingBarProps) {
  const [title, setTitle] = useState("");

  return (
    <div
      className={cn(
        "mx-auto mb-2 w-full max-w-lg rounded-xl bg-elevated/92 px-3 py-2 shadow-[var(--shadow-border)] backdrop-blur-[2px]",
        className,
      )}
    >
      {sessionOn && nowPlaying ? (
        <p className="mb-1.5 truncate text-xs text-muted">
          On · <span className="text-fg">{nowPlaying}</span>
          {moodTag ? <span className="text-subtle"> · {moodTag}</span> : null}
        </p>
      ) : null}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          onSetTitle(next);
          setTitle("");
        }}
      >
        <Music2 className="size-3.5 shrink-0 text-muted" aria-hidden />
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          aria-label="Now playing title"
          placeholder={sessionOn ? "Next title" : "Paste a title — no login"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
        />
        <Button type="submit" variant="ghost" size="sm" disabled={!title.trim()}>
          Set
        </Button>
        {sessionOn ? (
          <Button type="button" variant="ghost" size="sm" onClick={onStop}>
            Stop
          </Button>
        ) : null}
      </form>
    </div>
  );
}
