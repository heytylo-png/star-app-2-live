import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  Mic,
  Phone,
  PhoneOff,
  Send,
  Settings,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { InstallHint } from "@/components/install-hint";
import { ChartSetupCard } from "@/components/chart-setup-card";
import { NowPlayingBar } from "@/components/now-playing-bar";
import { Puppet } from "@/components/puppet";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  affectionNudgesFor,
  scoreToTier,
  TIER_LABEL,
  useAffectionStore,
} from "@/lib/affection-store";
import { useChatStore } from "@/lib/chat-store";
import {
  DEFAULT_EMOTION,
  EMOTION_LABEL,
  namedPoseFromText,
  parseAct,
  poseResetDelayMs,
  streamActHints,
  streamLine,
  type EmotionId,
  type PoseId,
} from "@/lib/rai";
import { useMemoryStore } from "@/lib/memory-store";
import { formatMemoryFacts } from "@/lib/memory-slots";
import {
  composeDiaryEntry,
  localDateKey,
  natalFromSetup,
  resolveChartTurn,
} from "@/lib/chart";
import { useChartStore } from "@/lib/chart-store";
import { parseTrackTitle, resolveLifeTurn, type LifeSlots } from "@/lib/life";
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

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: { length: number; [i: number]: { 0: { transcript: string }; isFinal?: boolean } };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onspeechstart?: (() => void) | null;
};

function getSpeechRecognition(): (new () => Rec) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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
    void Promise.resolve(useChartStore.persist.rehydrate()).finally(() => {
      useChartStore.getState().setHydrated(true);
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
  const slots = useMemoryStore((s) => s.slots);
  const chartHydrated = useChartStore((s) => s.hydrated);
  const chartSetup = useChartStore((s) => s.setup);
  const diaryByDay = useChartStore((s) => s.diaryByDay);
  const affectionScore = useAffectionStore((s) => s.score);
  const streakDays = useAffectionStore((s) => s.streakDays);
  const tier = useMemo(() => scoreToTier(affectionScore), [affectionScore]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [xaiKeyDraft, setXaiKeyDraft] = useState("");
  const [xaiSaved, setXaiSaved] = useState(() => hasXaiKey());
  const [xaiMask, setXaiMask] = useState(() => maskXaiKey(getStoredXaiKey()));
  const [keyJustSaved, setKeyJustSaved] = useState(false);
  const [caption, setCaption] = useState("");
  const [emotion, setEmotion] = useState<EmotionId>(DEFAULT_EMOTION);
  const [pose, setPose] = useState<PoseId>("idle");
  const [talking, setTalking] = useState(false);
  const [holding, setHolding] = useState(false);
  const [pttSupported, setPttSupported] = useState(true);
  const [callActive, setCallActive] = useState(false);
  const [callListening, setCallListening] = useState(false);
  const [callSupported, setCallSupported] = useState(true);
  const [amp, setAmp] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const recRef = useRef<Rec | null>(null);
  const draftRef = useRef("");
  const voiceOnRef = useRef(voiceOn);
  const callActiveRef = useRef(false);
  const sendingRef = useRef(false);
  const talkingRef = useRef(false);
  const listenAfterSpeakRef = useRef(false);
  const bargeRecRef = useRef<Rec | null>(null);
  const poseRef = useRef<PoseId>("idle");
  /** When the last act pose/emotion landed — drives the hold timer. */
  const actLandedAt = useRef(0);
  /** Life slots before this turn's ingest — used to detect track changes. */
  const lifeBeforeRef = useRef<LifeSlots | undefined>(undefined);

  const thread = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );
  const empty = !thread || thread.messages.length === 0;
  const lastAssistant = [...(thread?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  const showSetup = chartHydrated && chartSetup === "pending" && !slots.user_birth_date;
  const todayKey = localDateKey();
  const todayDiary = diaryByDay[todayKey];

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    talkingRef.current = talking;
  }, [talking]);

  useEffect(() => {
    poseRef.current = pose;
  }, [pose]);

  useEffect(() => {
    useAffectionStore.getState().touchDecay();
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopVoice();
      recRef.current?.stop();
      bargeRecRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (sending || talking || callListening) return;
    if (holding) {
      setEmotion("glance");
      return;
    }
    if (draft.trim()) {
      setEmotion("glance");
      return;
    }
    const delay = poseResetDelayMs({
      pose,
      emotion,
      talking: false,
      actLandedAt: actLandedAt.current,
    });
    if (delay == null) return;
    const id = window.setTimeout(() => {
      setPose("idle");
      setEmotion(DEFAULT_EMOTION);
    }, delay);
    return () => window.clearTimeout(id);
  }, [draft, sending, talking, holding, callListening, pose, emotion]);

  function stopRec() {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    try {
      bargeRecRef.current?.stop();
    } catch {
      /* ignore */
    }
    bargeRecRef.current = null;
  }

  function toggleVoice() {
    unlockVoice();
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) {
      stopVoice();
      setTalking(false);
      setAmp(0);
    }
  }

  const startCallListen = useCallback(() => {
    if (!callActiveRef.current) return;
    if (sendingRef.current) return;
    const SR = getSpeechRecognition();
    if (!SR) {
      setCallSupported(false);
      setCallListening(false);
      setCaption("Call mode needs speech input — type instead.");
      return;
    }
    unlockVoice();
    stopRec();
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (event) => {
      let said = "";
      let gotFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        said += piece;
        if (event.results[i].isFinal) gotFinal = true;
      }
      const next = said.trim();
      draftRef.current = next;
      setDraft(next);
      if (next) setCaption(next);
      if (gotFinal && next) finalText = next;
    };
    rec.onerror = (event) => {
      const err = event.error ?? "";
      recRef.current = null;
      setCallListening(false);
      // Restart quietly on no-speech / aborted while still on call
      if (
        callActiveRef.current &&
        !sendingRef.current &&
        (err === "no-speech" || err === "aborted" || err === "audio-capture")
      ) {
        window.setTimeout(() => {
          if (callActiveRef.current && !sendingRef.current && !talkingRef.current) {
            startCallListen();
          }
        }, err === "no-speech" ? 280 : 500);
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setCallListening(false);
      if (!callActiveRef.current) return;
      const text = (finalText || draftRef.current).trim();
      if (text && !sendingRef.current) {
        draftRef.current = "";
        setDraft("");
        void sendRef.current(text);
        return;
      }
      // Keep the loop alive
      window.setTimeout(() => {
        if (callActiveRef.current && !sendingRef.current && !talkingRef.current) {
          startCallListen();
        }
      }, 320);
    };
    recRef.current = rec;
    setCallSupported(true);
    setCallListening(true);
    setHolding(false);
    setEmotion("glance");
    setCaption("Listening…");
    try {
      rec.start();
    } catch {
      setCallListening(false);
      setCaption("Mic busy — try again.");
      recRef.current = null;
      window.setTimeout(() => {
        if (callActiveRef.current && !sendingRef.current) startCallListen();
      }, 700);
    }
  }, []);

  /** Barge-in listener while she speaks — first speech or speechstart stops TTS. */
  const startBargeListen = useCallback(() => {
    if (!callActiveRef.current) return;
    const SR = getSpeechRecognition();
    if (!SR) return;
    try {
      bargeRecRef.current?.stop();
    } catch {
      /* ignore */
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let tripped = false;
    const trip = (seed?: string) => {
      if (tripped) return;
      tripped = true;
      stopVoice();
      setTalking(false);
      setAmp(0);
      abortRef.current?.abort();
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      bargeRecRef.current = null;
      if (seed?.trim()) {
        draftRef.current = seed.trim();
        setDraft(seed.trim());
        setCaption(seed.trim());
      }
      // Hand off to normal call listen after interrupt
      window.setTimeout(() => {
        if (callActiveRef.current) startCallListen();
      }, 120);
    };
    rec.onspeechstart = () => trip();
    rec.onresult = (event) => {
      let said = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        said += event.results[i][0].transcript;
      }
      if (said.trim()) trip(said.trim());
    };
    rec.onerror = () => {
      bargeRecRef.current = null;
    };
    rec.onend = () => {
      bargeRecRef.current = null;
    };
    bargeRecRef.current = rec;
    try {
      rec.start();
    } catch {
      bargeRecRef.current = null;
    }
  }, [startCallListen]);

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
    setEmotion("glance");
    // Keep the last act pose until the new one lands — no idle flash.
    setCaption("");
    setCallListening(false);
    stopRec();

    const controller = new AbortController();
    abortRef.current = controller;

    const aff = useAffectionStore.getState();
    aff.touchDecay();
    const liveAff = useAffectionStore.getState();
    const mem = useMemoryStore.getState();
    const chartStore = useChartStore.getState();
    const lastUser =
      [...current.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const today = localDateKey();
    const chartTurn = resolveChartTurn({
      userText: lastUser,
      chatOpen: true,
      userSun: mem.slots.user_sun,
      lastTopic: mem.slots.last_topic,
      mood: mem.slots.mood,
      alreadyFiredDate: chartStore.lastFiredDate,
      askedBirthday: chartStore.askedBirthday,
      existingDiary: chartStore.diaryFor(today),
    });
    if (chartTurn.kind === "daily" && chartTurn.dateKey) {
      chartStore.markFired(chartTurn.dateKey);
    }
    if (chartTurn.kind === "ask_need_birthday") {
      chartStore.markAskedBirthday();
    }
    if (chartTurn.kind === "diary" && chartTurn.diaryText && chartTurn.dateKey) {
      chartStore.saveDiary(chartTurn.dateKey, chartTurn.diaryText);
    }
    const lifeAfter = mem.slots.life;
    const lifeTurn = chartTurn.localOnly
      ? { kind: "none" as const, localOnly: false }
      : resolveLifeTurn({
          userText: lastUser,
          before: lifeBeforeRef.current,
          after: lifeAfter,
        });
    if (lifeTurn.kind === "track_change" && lifeTurn.nowPlaying) {
      useMemoryStore.getState().patchSlots({
        life: { on: true, commented_track: lifeTurn.nowPlaying },
      });
    }
    const factsBlock = useMemoryStore.getState().memoryFactsBlock({
      streakDays: liveAff.streakDays,
      relationship: TIER_LABEL[scoreToTier(liveAff.score)],
    });
    const systemExtra = [factsBlock, chartTurn.factsBlock, lifeTurn.factsBlock]
      .filter(Boolean)
      .join("\n\n");

    let raw = "";
    let speakFinishedClean = false;
    try {
      raw = await streamChat(
        {
          model: current.model,
          personality: "default",
          reasoning: "low",
          systemExtra,
          currentPose: poseRef.current,
          chartTurn,
          lifeTurn,
          messages: current.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        },
        (delta, meta) => {
          if (meta?.reset) raw = "";
          raw += delta;
          const hints = streamActHints(raw);
          if (hints.emotion) setEmotion(hints.emotion);
          if (hints.pose) {
            setPose(hints.pose);
            poseRef.current = hints.pose;
          }
          if (hints.emotion || hints.pose) actLandedAt.current = Date.now();
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
      if (act.pose) {
        setPose(act.pose);
        poseRef.current = act.pose;
      } else if (lifeTurn.kind !== "none" && lifeTurn.tintPose) {
        setPose(lifeTurn.tintPose);
        poseRef.current = lifeTurn.tintPose;
      } else if (chartTurn.kind === "daily" && chartTurn.tintPose) {
        setPose(chartTurn.tintPose);
        poseRef.current = chartTurn.tintPose;
      }
      actLandedAt.current = Date.now();
      if (act.memories.length) useMemoryStore.getState().addMany(act.memories);

      const shouldSpeak = voiceOnRef.current || callActiveRef.current;
      if (shouldSpeak) {
        const spoken = speakable(line);
        if (spoken) {
          setTalking(true);
          let lastAmp = 0;
          // Enable barge-in while speaking in call mode
          if (callActiveRef.current) {
            window.setTimeout(() => startBargeListen(), 180);
          }
          await speak(
            spoken,
            (v) => {
              lastAmp = lastAmp * 0.62 + v * 0.38;
              setAmp(lastAmp);
            },
            controller.signal,
          );
          speakFinishedClean = !controller.signal.aborted;
        } else {
          speakFinishedClean = true;
        }
      } else {
        speakFinishedClean = true;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        /* barge-in / stop */
      } else if (err instanceof Error && err.name === "AbortError") {
        /* ignore */
      } else {
        const message = err instanceof Error ? err.message : "She went quiet.";
        store.patchMessage(threadId, assistant.id, { content: message, error: message });
        setCaption(message);
        setEmotion("soft");
        actLandedAt.current = Date.now();
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      setTalking(false);
      setAmp(0);
      try {
        bargeRecRef.current?.stop();
      } catch {
        /* ignore */
      }
      bargeRecRef.current = null;

      if (callActiveRef.current && speakFinishedClean && listenAfterSpeakRef.current) {
        window.setTimeout(() => {
          if (callActiveRef.current && !sendingRef.current) startCallListen();
        }, 280);
      }
    }
  }

  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  async function send(text: string) {
    const content = text.trim();
    if (!content || sendingRef.current) return;
    unlockVoice();
    listenAfterSpeakRef.current = callActiveRef.current;

    const memBefore = useMemoryStore.getState().items.length;
    // Pre-nudge from text; memory bump refined after act if mem added
    const kinds = affectionNudgesFor(content, false);
    useAffectionStore.getState().nudge(kinds);

    const store = useChatStore.getState();
    let active = store.threads.find((t) => t.id === store.activeId) ?? null;
    if (!active) active = store.createThread({ prompt: content, model: defaultModel });
    const lifeTitle = parseTrackTitle(content);
    const named = lifeTitle ? null : namedPoseFromText(content);
    if (named) {
      setPose(named);
      poseRef.current = named;
      actLandedAt.current = Date.now();
    }
    lifeBeforeRef.current = useMemoryStore.getState().slots.life;
    useMemoryStore.getState().ingestUserTurn(content, {
      lastChoice: lifeTitle ? undefined : named === false ? "kiss" : named || undefined,
    });
    store.appendMessage(active.id, {
      id: newId(),
      role: "user",
      content,
      createdAt: Date.now(),
    });
    setDraft("");
    draftRef.current = "";
    await complete(active.id);

    // Extra memory nudge if facts landed
    if (useMemoryStore.getState().items.length > memBefore) {
      useAffectionStore.getState().nudge(["memory"]);
    }
  }
  sendRef.current = send;

  function stop() {
    abortRef.current?.abort();
    stopVoice();
    stopRec();
    setTalking(false);
    setSending(false);
    setHolding(false);
    setCallListening(false);
    setAmp(0);
  }

  function hangUp() {
    callActiveRef.current = false;
    setCallActive(false);
    listenAfterSpeakRef.current = false;
    stop();
    setCaption("");
  }

  function bargeInTap() {
    if (!callActiveRef.current) return;
    if (!talkingRef.current && !sendingRef.current) return;
    stopVoice();
    abortRef.current?.abort();
    setTalking(false);
    setAmp(0);
    setSending(false);
    window.setTimeout(() => {
      if (callActiveRef.current) startCallListen();
    }, 100);
  }

  function toggleCall() {
    unlockVoice();
    if (callActive) {
      hangUp();
      return;
    }
    const SR = getSpeechRecognition();
    if (!SR) {
      setCallSupported(false);
      setCaption("Call mode needs speech input on this browser — type instead.");
      return;
    }
    // Calls imply voice output
    if (!voiceOn) setVoiceOn(true);
    callActiveRef.current = true;
    setCallActive(true);
    setCallSupported(true);
    listenAfterSpeakRef.current = true;
    startCallListen();
  }

  function startPtt() {
    if (callActiveRef.current) return;
    const SR = getSpeechRecognition();
    if (!SR) {
      setPttSupported(false);
      setCaption("Hold-to-talk needs speech input — type instead.");
      setHolding(false);
      return;
    }
    unlockVoice();
    stopRec();
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
    setEmotion("glance");
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
    if (callActiveRef.current) return;
    recRef.current?.stop();
    setHolding(false);
    const text = draftRef.current.trim();
    if (text) void send(text);
    else if (pttSupported) setCaption((c) => (c === "Listening…" ? "" : c));
  }

  const slotFacts = formatMemoryFacts(slots);
  const hasSlots = Boolean(slotFacts);

  const status = callActive
    ? talking
      ? "Speaking"
      : sending
        ? "Thinking"
        : callListening
          ? "Listening"
          : "On call"
    : talking
      ? "Speaking"
      : sending
        ? "Thinking"
        : holding
          ? "Listening"
          : "With you";

  return (
    <div className="relative h-dvh overflow-hidden bg-bg text-fg">
      <Puppet pose={pose} emotion={emotion} talking={talking} amplitude={amp} className="absolute inset-0" />

      {/* Barge-in tap target while on call + speaking */}
      {callActive && (talking || sending) ? (
        <button
          type="button"
          aria-label="Interrupt"
          className="absolute inset-0 z-[5] cursor-pointer bg-transparent"
          onClick={bargeInTap}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <header className="pointer-events-auto flex items-center gap-1.5 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:px-4 sm:gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl leading-none tracking-tight sm:text-2xl">Star Rai</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.65rem] tracking-widest text-muted uppercase sm:text-xs sm:mt-1">
              <span
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  callActive && callListening
                    ? "bg-danger animate-pulse"
                    : holding
                      ? "bg-danger animate-pulse"
                      : talking
                        ? "bg-fg"
                        : sending
                          ? "bg-muted"
                          : callActive
                            ? "bg-fg/70"
                            : "bg-muted/50",
                )}
                aria-hidden
              />
              {status}
              <span
                className="rounded-full bg-elevated/80 px-2 py-0.5 text-[0.6rem] tracking-wide text-muted normal-case shadow-[var(--shadow-border)] sm:text-[0.65rem]"
                title={`Affection ${affectionScore}/100`}
              >
                {TIER_LABEL[tier]}
                {streakDays >= 2 ? ` · ${streakDays}d` : ""}
              </span>
              <span
                className="text-subtle normal-case tracking-wide"
                title={xaiSaved ? "xAI Grok brain" : "Offline local brain"}
              >
                · {xaiSaved ? "Grok" : "Local"}
              </span>
            </p>
          </div>
          <span className="hidden rounded-full bg-elevated px-2.5 py-1 text-[0.65rem] tracking-wide text-muted shadow-[var(--shadow-border)] xs:inline sm:text-xs sm:px-3">
            {EMOTION_LABEL[emotion]}
          </span>
          <Button
            type="button"
            variant={callActive ? "default" : "ghost"}
            size="icon-sm"
            aria-label={callActive ? "Hang up" : "Start call"}
            aria-pressed={callActive}
            title={callSupported ? (callActive ? "Hang up" : "Call mode") : "Speech input unavailable"}
            onClick={toggleCall}
            className={cn(callActive && "ring-2 ring-ring")}
          >
            {callActive ? <PhoneOff className="size-4" /> : <Phone className="size-4" />}
          </Button>
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
                "mx-auto mb-2 max-w-md rounded-xl bg-elevated/90 px-4 py-3 text-center font-display text-lg leading-snug text-fg shadow-[var(--shadow-border)] backdrop-blur-[2px] sm:text-xl",
                (holding || callListening) && caption === "Listening…" && "text-muted",
                callActive && talking && "ring-1 ring-border",
              )}
            >
              {caption || lastAssistant?.content}
              {callActive && talking ? (
                <span className="mt-1 block text-[0.65rem] font-sans tracking-wide text-subtle uppercase">
                  Tap to interrupt
                </span>
              ) : null}
            </p>
          ) : empty ? (
            <p className="mx-auto mb-2 max-w-sm text-center text-sm text-muted">
              Say hey — or tap the phone to call her.
            </p>
          ) : null}
        </div>

        <div className="pointer-events-auto bg-gradient-to-t from-bg via-bg/90 to-transparent px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pt-5 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {callActive ? (
            <div className="mx-auto mb-3 flex max-w-lg items-center justify-between gap-2 rounded-full bg-elevated px-3 py-2 shadow-[var(--shadow-border)]">
              <p className="text-xs tracking-wide text-muted">
                <span className="font-medium text-fg">On call</span>
                {" · "}
                {talking ? "Speaking" : sending ? "Thinking" : callListening ? "Listening" : "Ready"}
              </p>
              <Button type="button" size="sm" variant="secondary" onClick={hangUp}>
                <PhoneOff className="size-3.5" />
                Hang up
              </Button>
            </div>
          ) : null}

          <InstallHint />
          {showSetup ? (
            <ChartSetupCard
              onSkip={() => useChartStore.getState().markSetupSkipped()}
              onSave={(fields) => {
                const natal = natalFromSetup(fields);
                if (natal.user_birth_date) {
                  useMemoryStore.getState().patchSlots(natal);
                  useChartStore.getState().markSetupDone();
                }
              }}
            />
          ) : null}
          {!callActive ? (
            <NowPlayingBar
              sessionOn={Boolean(slots.life?.on)}
              nowPlaying={slots.life?.now_playing}
              moodTag={slots.life?.mood_tag}
              onSetTitle={(title) => void send(`I'm listening to ${title}`)}
              onStop={() => void send("stop listening")}
            />
          ) : null}
          {empty && !callActive ? (
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
              placeholder={
                callActive
                  ? callListening
                    ? "Listening…"
                    : talking
                      ? "On call…"
                      : "On call…"
                  : holding
                    ? "Listening…"
                    : slots.life?.on
                      ? "Say something — or paste a title"
                      : "Say something"
              }
              rows={1}
              disabled={callActive && (callListening || talking)}
              className="min-h-11 max-h-28 flex-1 resize-none rounded-md bg-elevated px-3 py-2.5 shadow-[var(--shadow-border)]"
            />
            {!callActive ? (
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
            ) : null}
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
              Memory{memories.length || hasSlots ? ` · ${memories.length + (hasSlots ? 1 : 0)}` : ""}
            </SheetTitle>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setMemoryOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="space-y-2 overflow-y-auto p-4">
            {hasSlots ? (
              <div className="mb-3 rounded-md bg-elevated px-3 py-2 shadow-[var(--shadow-border)]">
                <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Slots sent to Grok</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {slotFacts.replace(/^MEMORY FACTS\n/, "")}
                </pre>
                <p className="mt-2 text-[0.65rem] leading-relaxed text-subtle">
                  Empty keys stay off the prompt. Streak/relationship come from the affection chip.
                  Natal Chart v1 sends user_birth_date / user_sun / chart_source when filled — never
                  user_rising, never her bio. Life sends session_on / now_playing / daily_playlist /
                  mood_tag only while a music session is on.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                No named slots yet. Tell her your name — she only sends what you actually said. No default cameraman,
                city, or birthday.
              </p>
            )}
            {slots.life?.daily_playlist?.length ? (
              <div className="mb-3 rounded-md bg-elevated px-3 py-2 shadow-[var(--shadow-border)]">
                <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Daily playlist</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {slots.life.daily_playlist.length} stored
                  {slots.life.on ? "" : " · not sent (session off)"}. She does not recite this.
                </p>
              </div>
            ) : null}
            <div className="mb-3 rounded-md bg-elevated px-3 py-2 shadow-[var(--shadow-border)]">
              <p className="text-[0.65rem] tracking-wide text-subtle uppercase">Diary</p>
              {todayDiary ? (
                <p className="mt-1 text-sm leading-relaxed">{todayDiary}</p>
              ) : (
                <p className="mt-1 text-sm text-muted">On ask only. One page per local day. Not auto-posted to Chat.</p>
              )}
              <button
                type="button"
                className="mt-2 text-xs text-muted hover:text-fg"
                onClick={() => {
                  const dateKey = localDateKey();
                  const existing = useChartStore.getState().diaryFor(dateKey);
                  const text =
                    existing ??
                    composeDiaryEntry({
                      todayDate: dateKey,
                      lastTopic: useMemoryStore.getState().slots.last_topic,
                      userSun: useMemoryStore.getState().slots.user_sun,
                      mood: useMemoryStore.getState().slots.mood,
                    });
                  useChartStore.getState().saveDiary(dateKey, text);
                }}
              >
                {todayDiary ? "Today's page is written" : "Write today's diary"}
              </button>
            </div>
            {memories.length === 0 ? (
              hasSlots ? null : (
                <p className="text-sm text-muted">
                  Chart date/time/place stay omitted until a meetup. Life keys stay off the
                  prompt until a music session is on — no login.
                </p>
              )
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
            {memories.length > 0 || hasSlots ? (
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
          <div className="space-y-5 overflow-y-auto p-4">
            <div>
              <p className="text-sm font-medium">xAI API key</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                From console.x.ai — stored only in this browser. Never shipped in the build.
              </p>
              <p className="mt-2 text-xs tracking-wide text-subtle uppercase">
                {xaiSaved ? `Saved · ${xaiMask}` : "Not saved · Local brain"}
                {grokProxyConfigured() ? " · proxy" : ""}
              </p>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={xaiSaved ? "New key to replace…" : "xai-…"}
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
                <p className="mt-2 text-xs text-muted">Saved as {xaiMask}. Brain: Grok.</p>
              ) : null}
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium">Relationship</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Soft affection tier in this browser:{" "}
                <span className="text-fg">{TIER_LABEL[tier]}</span> ({affectionScore}/100)
                {streakDays >= 2 ? ` · ${streakDays}-day streak` : ""}.
                Grows with greetings, compliments, chats, and memories; drifts slowly if quiet.
              </p>
            </div>

            <div className="rounded-md bg-elevated px-3 py-2.5 text-xs leading-relaxed text-muted shadow-[var(--shadow-border)]">
              With a key, Star Rai calls xAI (<span className="text-fg">grok-4-latest</span>).
              CORS or key issues fall back to the local brain — no breaking character.
              Phone icon starts Call mode (continuous listen → reply → speak).
              Chart v1 uses this browser&apos;s timezone for once-per-day (fallback America/Chicago).
              Life v1 is music only — paste a title, no Spotify/Apple login. Never blocks Chat.
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
