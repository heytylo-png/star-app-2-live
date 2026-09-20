import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/helix";
import {
  CHAT_THREAD_DEFAULT_PX,
  CHAT_THREAD_MIN_PX,
  clampChatThreadHeightPx,
  loadChatThreadHeightPx,
  maxChatThreadHeightPx,
  saveChatThreadHeightPx,
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
};

function lastMessageContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i]?.content.trim();
    if (text) return text;
  }
  return "";
}

function useChatThreadHeight() {
  const [heightPx, setHeightPx] = useState(() =>
    typeof window === "undefined" ? CHAT_THREAD_DEFAULT_PX : loadChatThreadHeightPx(window.innerHeight),
  );
  const dragRef = useRef<{ pointerId: number; startY: number; startH: number } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setHeightPx((h) => clampChatThreadHeightPx(h, window.innerHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, startH: heightPx };
    document.body.classList.add("chat-thread-resizing");
  }, [heightPx]);

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const next = clampChatThreadHeightPx(drag.startH + (drag.startY - e.clientY), window.innerHeight);
    setHeightPx(next);
  }, []);

  const endDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    document.body.classList.remove("chat-thread-resizing");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    setHeightPx((h) => saveChatThreadHeightPx(h, window.innerHeight));
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const vh = window.innerHeight;
    let next = heightPx;
    if (e.key === "ArrowUp") next += 16;
    else if (e.key === "ArrowDown") next -= 16;
    else if (e.key === "Home") next = CHAT_THREAD_MIN_PX;
    else if (e.key === "End") next = maxChatThreadHeightPx(vh);
    else return;
    e.preventDefault();
    setHeightPx(saveChatThreadHeightPx(next, vh));
  }, [heightPx]);

  return { heightPx, onPointerDown, onPointerMove, endDrag, onKeyDown };
}

/**
 * Expo-style compact transcript: dark quiet bubbles, bottom-third of the stage.
 * No wrapping white card — the puppet stays visible through the stack.
 * Optional top-edge grip resizes and persists height in localStorage.
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
  const { heightPx, onPointerDown, onPointerMove, endDrag, onKeyDown } = useChatThreadHeight();

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
  }, [messages, captionText, showListening, heightPx]);

  if (empty && !captionText && !callActive && !showSetup) {
    return (
      <p className="mx-auto mb-2 max-w-sm text-center text-sm text-muted">
        Say hey — or tap the phone to call her.
      </p>
    );
  }

  if (empty && !captionText && !showListening) return null;

  const minPx = CHAT_THREAD_MIN_PX;
  const maxPx = typeof window === "undefined" ? 320 : maxChatThreadHeightPx(window.innerHeight);

  return (
    <div
      className="chat-thread-frame pointer-events-auto mx-auto mb-1 w-full max-w-md min-h-0"
      style={{ height: heightPx }}
      data-testid="chat-thread-frame"
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label="Resize transcript"
        aria-orientation="vertical"
        aria-valuemin={minPx}
        aria-valuemax={maxPx}
        aria-valuenow={heightPx}
        aria-valuetext={`${heightPx} pixels`}
        title="Drag to resize transcript"
        data-testid="chat-thread-resize"
        className="chat-thread-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className="chat-thread-handle-pill">
          <GripHorizontal className="size-4" aria-hidden />
        </span>
      </div>
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
        className="chat-thread px-1 pb-1"
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
                  "chat-bubble",
                  isAssistant ? "chat-bubble-assistant mr-auto" : "chat-bubble-user ml-auto",
                  liveTalk && "chat-bubble-live",
                  m.error && "chat-bubble-error",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{body}</p>
                {liveTalk ? (
                  <span className="chat-bubble-hint">Tap to interrupt</span>
                ) : null}
              </div>
            );
          })}
          {showListening ? (
            <p className="px-1 text-center text-xs text-muted">Listening…</p>
          ) : null}
          {showCaption ? (
            <div
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
