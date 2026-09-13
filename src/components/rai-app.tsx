import { useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, Mic, Send, Settings, Square, Volume2, VolumeX, X } from "lucide-react";
import { InstallHint } from "@/components/install-hint";
import { Puppet } from "@/components/puppet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useChatStore } from "@/lib/chat-store";
import { EMOTION_LABEL, parseAct, streamActHints, streamLine, type EmotionId, type PoseId } from "@/lib/rai";
import { useMemoryStore } from "@/lib/memory-store";
import { newId, type ChatMessage } from "@/lib/helix";
import { streamChat } from "@/lib/stream-chat";
import {
  getStoredXaiKey,
  grokProxyConfigured,
  hasXaiKey,
  maskXaiKey,
  setStoredXaiKey,
} from "@/lib/grok";
import { speak, stopVoice, unlockVoice } from "@/lib/voice";
import { speakable } from "@/lib/companion";
import { cn } from "@/lib/utils";

const STARTERS = [
  { label: "Hey", prompt: "Hey. Just got here." },
  { label: "I bumped you", prompt: "Sorry — I wasn't watching where I was going." },
  { label: "Who are you?", prompt: "Who are you supposed to be?" },
  { label: "Remember this", prompt: "Remember that I like talking to you at night." },
];

function relativeTime(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function RaiApp() {
  useEffect(() => {
    void Promise.resolve(useChatStore.persist.rehydrate()).finally(() => {
      useChatStore.getState().setHydrated(true);
    });
  }, []);
  return <RaiReady />;
}

function RaiReady() {
  const threads = useChatStore((s) => s.threads);
  const activeId = useChatStore((s) => s.activeId);
  const defaultModel = useChatStore((s) => s.defaultModel);
  const voiceOn = useChatStore((s) => s.voiceOn);
  const setVoiceOn = useChatStore((s) => s.setVoiceOn);
  const memories = useMemoryStore((s) => s.items);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [xaiKeyDraft, setXaiKeyDraft] = useState("");
  const [xaiSaved, setXaiSaved] = useState(() => hasXaiKey());
  const [xaiMask, setXaiMask] = useState(() => maskXaiKey(getStoredXaiKey()));
  const [keyJustSaved, setKeyJustSaved] = useState(false);
  const [caption, setCaption] = useState("");
  const [emotion, setEmotion] = useState<EmotionId>("idle");
  const [pose, setPose] = useState<PoseId>("idle");
  const [talking, setTalking] = useState(false);
  const [holding, setHolding] = useState(false);
  const [pttSupported, setPttSupported] = useState(true);
  const [amp, setAmp] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const draftRef = useRef("");
  const voiceOnRef = useRef(voiceOn);

  const thread = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );
  const empty = !thread || thread.messages.length === 0;
  const lastAssistant = [...(thread?.messages ?? [])].reverse().find((m) => m.role === "assistant");

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopVoice();
      recRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (sending || talking) return;
    if (holding) {
      setEmotion("thinking");
      return;
    }
    if (draft.trim()) {
      setEmotion("thinking");
      return;
    }
    const id = window.setTimeout(() => {
      setPose("idle");
      setEmotion("idle");
    }, 1600);
    return () => window.clearTimeout(id);
  }, [draft, sending, talking, holding]);

  function toggleVoice() {
    unlockVoice();
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) {
      // Mute must not leave her mid-sentence.
      stopVoice();
      setTalking(false);
      setAmp(0);
    }
  }

  async function complete(threadId: string) {
    const store = useChatStore.getState();
    const current = store.threads.find((t) => t.id === threadId);
    if (!current) return;
    const assistant: ChatMessage = {
      id: newId(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: current.model,
    };
    store.appendMessage(threadId, assistant);
    setSending(true);
    setTalking(false);
    setEmotion("thinking");
    setPose("idle");
    setCaption("");

    const controller = new AbortController();
    abortRef.current = controller;

    const liveMemories = useMemoryStore.getState().items;
    const memoryBlock =
      liveMemories.length > 0
        ? `Known facts about this person:\n${liveMemories
            .slice(0, 24)
            .map((m) => `- ${m.text}`)
            .join("\n")}`
        : "";

    let raw = "";
    try {
      await streamChat(
        {
          model: current.model,
          personality: "default",
          reasoning: "low",
          systemExtra: memoryBlock,
          messages: current.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        },
        (delta) => {
          raw += delta;
          const hints = streamActHints(raw);
          if (hints.emotion) setEmotion(hints.emotion);
          if (hints.pose) setPose(hints.pose);
          const live = streamLine(raw);
          if (live) {
            setCaption(live);
            store.patchMessage(threadId, assistant.id, { content: live });
          }
        },
        controller.signal,
      );

      const act = parseAct(raw);
      const line = act.line || streamLine(raw) || "…";
      store.patchMessage(threadId, assistant.id, { content: line });
      setCaption(line);
      setEmotion(act.emotion);
      setPose(act.pose);
      if (act.memories.length) useMemoryStore.getState().addMany(act.memories);

      if (voiceOnRef.current) {
        const spoken = speakable(line);
        if (spoken) {
          setTalking(true);
          let lastAmp = 0;
          await speak(
            spoken,
            (v) => {
              // Soft-follow TTS peaks so the mouth layer doesn't thrash.
              lastAmp = lastAmp * 0.62 + v * 0.38;
              setAmp(lastAmp);
            },
            controller.signal,
          );
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "She went quiet.";
      store.patchMessage(threadId, assistant.id, { content: message, error: message });
      setCaption(message);
      setEmotion("sad");
    } finally {
      abortRef.current = null;
      setSending(false);
      setTalking(false);
      setAmp(0);
    }
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    unlockVoice();
    const store = useChatStore.getState();
    let active = store.threads.find((t) => t.id === store.activeId) ?? null;
    if (!active) active = store.createThread({ prompt: content, model: defaultModel });
    store.appendMessage(active.id, {
      id: newId(),
      role: "user",
      content,
      createdAt: Date.now(),
    });
    setDraft("");
    draftRef.current = "";
    await complete(active.id);
  }

  function stop() {
    abortRef.current?.abort();
    stopVoice();
    recRef.current?.stop();
    setTalking(false);
    setSending(false);
    setHolding(false);
    setAmp(0);
  }

  function startPtt() {
    type Rec = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      start: () => void;
      stop: () => void;
      onresult:
        | ((event: {
            resultIndex: number;
            results: { length: number; [i: number]: { 0: { transcript: string }; isFinal?: boolean } };
          }) => void)
        | null;
      onend: (() => void) | null;
      onerror: ((event: { error?: string }) => void) | null;
    };
    const w = window as unknown as {
      SpeechRecognition?: new () => Rec;
      webkitSpeechRecognition?: new () => Rec;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      setPttSupported(false);
      setCaption("Hold-to-talk needs speech input — type instead.");
      setHolding(false);
      return;
    }
    unlockVoice();
    recRef.current?.stop();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      let said = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        said += event.results[i][0].transcript;
      }
      const next = said.trim();
      draftRef.current = next;
      setDraft(next);
      if (next) setCaption(next);
    };
    rec.onerror = () => {
      setHolding(false);
      recRef.current = null;
    };
    rec.onend = () => {
      recRef.current = null;
      setHolding(false);
    };
    recRef.current = rec;
    setPttSupported(true);
    setHolding(true);
    setEmotion("thinking");
    setCaption("Listening…");
    try {
      rec.start();
    } catch {
      setHolding(false);
      setCaption("Mic busy — try again.");
      recRef.current = null;
    }
  }

  function endPtt() {
    recRef.current?.stop();
    setHolding(false);
    const text = draftRef.current.trim();
    if (text) void send(text);
    else if (pttSupported) setCaption((c) => (c === "Listening…" ? "" : c));
  }

  const status = talking
    ? "Speaking"
    : sending
      ? "Thinking"
      : holding
        ? "Listening"
        : "With you";

  return (
    <div className="relative h-dvh overflow-hidden bg-bg text-fg">
      {/* Stage — she owns the frame; chrome sits in reserved bands */}
      <Puppet pose={pose} emotion={emotion} talking={talking} amplitude={amp} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <header className="pointer-events-auto flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl leading-none tracking-tight">Star Rai</p>
            <p className="mt-1 flex items-center gap-2 text-xs tracking-widest text-muted uppercase">
              <span
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  holding
                    ? "bg-danger animate-pulse"
                    : talking
                      ? "bg-fg"
                      : sending
                        ? "bg-muted"
                        : "bg-muted/50",
                )}
                aria-hidden
              />
              {status}
              <span className="text-subtle normal-case tracking-wide" title={xaiSaved ? "xAI Grok brain" : "Offline local brain"}>
                · {xaiSaved ? "Grok" : "Local"}
              </span>
            </p>
          </div>
          <span className="rounded-full bg-elevated px-3 py-1 text-xs tracking-wide text-muted shadow-[var(--shadow-border)]">
            {EMOTION_LABEL[emotion]}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Settings"
            onClick={() => {
              setXaiKeyDraft("");
              setKeyJustSaved(false);
              setXaiSaved(hasXaiKey());
              setXaiMask(maskXaiKey(getStoredXaiKey()));
              setSettingsOpen(true);
            }}
          >
            <Settings className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Memory (${memories.length})`}
            onClick={() => setMemoryOpen(true)}
          >
            <BookMarked className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={voiceOn ? "Mute" : "Unmute"}
            onClick={toggleVoice}
          >
            {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col justify-end px-4 pb-1">
          {caption || lastAssistant ? (
            <p
              className={cn(
                "mx-auto mb-2 max-w-md rounded-xl bg-elevated/90 px-4 py-3 text-center font-display text-xl leading-snug text-fg shadow-[var(--shadow-border)] backdrop-blur-[2px]",
                holding && caption === "Listening…" && "text-muted",
              )}
            >
              {caption || lastAssistant?.content}
            </p>
          ) : empty ? (
            <p className="mx-auto mb-2 max-w-sm text-center text-sm text-muted">
              She is waiting. Try bumping into her.
            </p>
          ) : null}
        </div>

        <div className="pointer-events-auto bg-gradient-to-t from-bg via-bg/90 to-transparent px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <InstallHint />
          {empty ? (
            <div className="mx-auto mb-3 flex max-w-lg flex-wrap justify-center gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void send(s.prompt)}
                  className="h-9 rounded-full bg-elevated px-3 text-sm text-muted shadow-[var(--shadow-border)] transition-colors duration-150 hover:text-fg"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="mx-auto flex w-full max-w-lg items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (sending) stop();
              else void send(draft);
            }}
          >
            <Textarea
              aria-label="Message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!sending) void send(draft);
                }
              }}
              placeholder={holding ? "Listening…" : "Say something"}
              rows={1}
              className="min-h-11 max-h-28 flex-1 resize-none rounded-md bg-elevated px-3 py-2.5 shadow-[var(--shadow-border)]"
            />
            <Button
              type="button"
              variant={holding ? "default" : "secondary"}
              size="icon"
              aria-label="Hold to talk"
              aria-pressed={holding}
              className={cn(holding && "ring-2 ring-ring")}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
                startPtt();
              }}
              onPointerUp={endPtt}
              onPointerCancel={endPtt}
            >
              <Mic className={cn("size-4", holding && "animate-pulse")} />
            </Button>
            <Button
              type="submit"
              size="icon"
              aria-label={sending ? "Stop" : "Send"}
              disabled={!sending && !draft.trim()}
            >
              {sending ? <Square className="size-4" /> : <Send className="size-4" />}
            </Button>
          </form>
        </div>
      </div>

      <Sheet open={memoryOpen} onOpenChange={setMemoryOpen}>
        <SheetContent side="right" className="w-[min(100%,22rem)] bg-bg p-0" aria-describedby={undefined}>
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <SheetTitle className="font-display text-xl">
              Memory{memories.length ? ` · ${memories.length}` : ""}
            </SheetTitle>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setMemoryOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="space-y-2 overflow-y-auto p-4">
            {memories.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing stored yet. Tell her your name, city, job, or what you like — she keeps durable facts.
              </p>
            ) : (
              memories.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 rounded-md bg-elevated px-3 py-2 shadow-[var(--shadow-border)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{item.text}</p>
                    <p className="mt-0.5 text-[0.65rem] tracking-wide text-subtle uppercase">
                      {relativeTime(item.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={cn("shrink-0 text-xs text-muted hover:text-fg")}
                    onClick={() => useMemoryStore.getState().remove(item.id)}
                  >
                    Drop
                  </button>
                </div>
              ))
            )}
            {memories.length > 0 ? (
              <button
                type="button"
                className="pt-2 text-xs text-muted hover:text-fg"
                onClick={() => useMemoryStore.getState().clear()}
              >
                Clear all
              </button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-[min(100%,22rem)] bg-bg p-0" aria-describedby={undefined}>
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <SheetTitle className="font-display text-xl">Settings</SheetTitle>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setSettingsOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="space-y-4 overflow-y-auto p-4">
            <div>
              <p className="text-sm font-medium">xAI API key</p>
              <p className="mt-1 text-xs text-muted">
                Paste a key from console.x.ai. Stored only in this browser (localStorage). Never shipped in the build.
              </p>
              <p className="mt-2 text-xs tracking-wide text-subtle uppercase">
                {xaiSaved ? `Saved · ${xaiMask}` : "Not saved · Local brain"}
                {grokProxyConfigured() ? " · proxy" : ""}
              </p>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={xaiSaved ? "Enter new key to replace…" : "xai-…"}
                value={xaiKeyDraft}
                onChange={(e) => {
                  setXaiKeyDraft(e.target.value);
                  setKeyJustSaved(false);
                }}
                className="mt-3 h-10 w-full rounded-md bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!xaiKeyDraft.trim()}
                  onClick={() => {
                    const next = xaiKeyDraft.trim();
                    if (!next) return;
                    setStoredXaiKey(next);
                    setXaiSaved(true);
                    setXaiMask(maskXaiKey(next));
                    setXaiKeyDraft("");
                    setKeyJustSaved(true);
                  }}
                >
                  Save key
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!xaiSaved}
                  onClick={() => {
                    setStoredXaiKey(null);
                    setXaiSaved(false);
                    setXaiMask("");
                    setXaiKeyDraft("");
                    setKeyJustSaved(false);
                  }}
                >
                  Clear
                </Button>
              </div>
              {keyJustSaved ? (
                <p className="mt-2 text-xs text-muted">Saved as {xaiMask}. Brain mode: Grok.</p>
              ) : null}
            </div>
            <div className="rounded-md bg-elevated px-3 py-2 text-xs text-muted shadow-[var(--shadow-border)]">
              With a key, Star Rai calls xAI (<span className="text-fg">grok-4-latest</span> with fallbacks).
              If the browser blocks CORS or the key fails, she stays on the local brain — no breaking character.
              Optional proxy: set <code className="text-fg">VITE_GROK_PROXY_URL</code> (see README / worker).
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
