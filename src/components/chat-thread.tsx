import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/helix";

const NEAR_BOTTOM_PX = 56;

type ChatThreadProps = {
  messages: ChatMessage[];
  caption: string;
  empty: boolean;
  callActive: boolean;
  talking: boolean;
  listening: boolean;
  showSetup: boolean;
};

function lastMessageContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i]?.content.trim();
    if (text) return text;
  }
  return "";
}

/**
 * Compact Chat transcript — ~3–4 message heights, scroll for the rest.
 * Does not grow with the viewport; the puppet keeps the stage.
 */
export function ChatThread({
  messages,
  caption,
  empty,
  callActive,
  talking,
  listening,
  showSetup,
}: ChatThreadProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevLenRef = useRef(messages.length);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastStored = lastMessageContent(messages);
  const captionText = caption.trim();
  const showCaption =
    Boolean(captionText) && captionText !== lastStored && captionText !== "Listening…";
  const showListening = listening && (captionText === "Listening…" || !captionText);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const appended = messages.length > prevLenRef.current;
    const last = messages[messages.length - 1];
    prevLenRef.current = messages.length;
    if (appended && last?.role === "user") nearBottomRef.current = true;
    if (!nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, captionText, showListening]);

  if (empty && !captionText && !callActive && !showSetup) {
    return (
      <p className="mx-auto mb-2 max-w-sm text-center text-sm text-muted">
        Say hey — or tap the phone to call her.
      </p>
    );
  }

  if (empty && !captionText && !showListening) return null;

  return (
    <div
      ref={scrollerRef}
      role="log"
      aria-label="Chat transcript"
      aria-live="polite"
      data-testid="chat-thread"
      onScroll={() => {
        const el = scrollerRef.current;
        if (!el) return;
        nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      }}
      className="chat-thread pointer-events-auto mx-auto mb-2 w-full max-w-md min-h-0 rounded-xl bg-elevated/80 px-2.5 py-2 shadow-[var(--shadow-border)] backdrop-blur-[2px]"
    >
      <div className="flex flex-col justify-end gap-1.5">
        {messages.map((m) => {
          const isAssistant = m.role === "assistant";
          const liveTalk = Boolean(callActive && talking && m.id === lastAssistant?.id);
          const body = m.content.trim() || (isAssistant ? "…" : "");
          if (!body) return null;
          return (
            <div
              key={m.id}
              className={cn(
                "max-w-[92%] rounded-xl px-3 py-1.5 leading-snug shadow-[var(--shadow-border)]",
                isAssistant
                  ? "mr-auto bg-elevated font-display text-[0.95rem] text-fg"
                  : "ml-auto bg-bg text-sm text-fg",
                liveTalk && "ring-1 ring-border",
                m.error && "text-danger",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{body}</p>
              {liveTalk ? (
                <span className="mt-0.5 block font-sans text-[0.65rem] tracking-wide text-subtle uppercase">
                  Tap to interrupt
                </span>
              ) : null}
            </div>
          );
        })}
        {showListening ? (
          <p className="px-1 text-center text-sm text-muted">Listening…</p>
        ) : null}
        {showCaption ? (
          <div
            className={cn(
              "max-w-[92%] rounded-xl px-3 py-1.5 text-sm leading-snug text-muted shadow-[var(--shadow-border)]",
              listening ? "ml-auto bg-bg" : "mx-auto bg-elevated/90 text-center",
            )}
          >
            {captionText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
