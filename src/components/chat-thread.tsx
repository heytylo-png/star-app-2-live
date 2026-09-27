import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/helix";
import {
  CHAT_THREAD_CEILING_PX,
  CHAT_THREAD_VISIBLE_BEATS,
  visibleBeatWindowPx,
} from "@/lib/chat-thread-height";

const NEAR_BOTTOM_PX = 56;

type ChatThreadProps = {
  messages: ChatMessage[];
  caption: string;
  empty: boolean;
  callActive: boolean;
  talking: boolean;
  listening: boolean;
  showSetup: boolean;
  /** Her display name on Call transcript bubbles. Omitted off-call. */
  herName?: string;
  /** Listen line. Call passes her display name; hold-to-talk stays generic. */
  listenLabel?: string;
};

function lastMessageContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i]?.content.trim();
    if (text) return text;
  }
  return "";
}

/**
 * Bottom-anchored transcript: the last two beats sit just above the input.
 * Older lines stay in that same strip (top fade) and come back by scrolling.
 * No card. Face, torso, and thighs stay clear.
 */
export function ChatThread({
  messages,
  caption,
  empty,
  callActive,
  talking,
  listening,
  showSetup,
  herName,
  listenLabel = "Listening…",
}: ChatThreadProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevLenRef = useRef(messages.length);
  const [windowPx, setWindowPx] = useState<number | null>(null);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastStored = lastMessageContent(messages);
  const captionText = caption.trim();
  const listeningCaption = listenLabel.trim() || "Listening…";
  const isListenCaption = captionText === "Listening…" || captionText === listeningCaption;
  const showCaption = Boolean(captionText) && captionText !== lastStored && !isListenCaption;
  const showListening = listening && (isListenCaption || !captionText);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nodes = [...el.querySelectorAll<HTMLElement>("[data-chat-beat]")];
    const next = visibleBeatWindowPx(
      nodes.map((node) => ({ offsetTop: node.offsetTop, offsetHeight: node.offsetHeight })),
    );
    const capped = next > 0 ? Math.min(next, CHAT_THREAD_CEILING_PX) : null;
    setWindowPx((prev) => (prev === capped ? prev : capped));
  }, [messages, captionText, showListening, showCaption]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const appended = messages.length > prevLenRef.current;
    const last = messages[messages.length - 1];
    prevLenRef.current = messages.length;
    if (appended && last?.role === "user") nearBottomRef.current = true;
    if (!nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, captionText, showListening, windowPx]);

  if (empty && !captionText && !callActive && !showSetup) {
    return (
      <p className="mx-auto mb-2 max-w-sm text-center text-sm text-muted">
        Say hey — or tap the phone to call her.
      </p>
    );
  }

  if (empty && !captionText && !showListening) return null;

  const beatCount =
    messages.filter((m) => m.content.trim() || m.role === "assistant").length +
    (showListening ? 1 : 0) +
    (showCaption ? 1 : 0);
  const older = beatCount > CHAT_THREAD_VISIBLE_BEATS;

  return (
    <div
      className="chat-thread-frame pointer-events-auto mx-auto mb-1 w-full max-w-md min-h-0"
      data-testid="chat-thread-frame"
      data-chat-visible-beats={CHAT_THREAD_VISIBLE_BEATS}
    >
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
        className={cn("chat-thread px-1 pb-1", older && "chat-thread-mask")}
        style={windowPx ? { maxHeight: windowPx } : undefined}
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
                data-chat-beat=""
                className={cn(
                  "chat-bubble",
                  isAssistant ? "chat-bubble-assistant mr-auto" : "chat-bubble-user ml-auto",
                  liveTalk && "chat-bubble-live",
                  m.error && "chat-bubble-error",
                )}
              >
                {herName && isAssistant ? (
                  <p className="mb-0.5 text-[0.6rem] tracking-wide text-subtle">{herName}</p>
                ) : null}
                <p className="whitespace-pre-wrap break-words">{body}</p>
                {liveTalk ? (
                  <span className="chat-bubble-hint">Tap to interrupt</span>
                ) : null}
              </div>
            );
          })}
          {showListening ? (
            <p data-chat-beat="" className="px-1 text-center text-xs text-muted">
              {listeningCaption}
            </p>
          ) : null}
          {showCaption ? (
            <div
              data-chat-beat=""
              className={cn(
                "chat-bubble",
                listening ? "chat-bubble-user ml-auto" : "chat-bubble-assistant mx-auto",
              )}
            >
              {captionText}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
