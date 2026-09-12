import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_MODEL,
  MAX_THREADS,
  type ChatMessage,
  type PersonalityId,
  type ReasoningLevel,
  type Thread,
  newId,
  titleFromPrompt,
} from "./helix";

/** Persist key stable across deploys — bump docs, not the key, when schema changes. */
export const CHAT_STORE_KEY = "star-rai-chat";

type ChatState = {
  threads: Thread[];
  activeId: string | null;
  defaultModel: string;
  defaultPersonality: PersonalityId;
  reasoning: ReasoningLevel;
  voiceOn: boolean;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  setDefaultModel: (model: string) => void;
  setDefaultPersonality: (id: PersonalityId) => void;
  setReasoning: (level: ReasoningLevel) => void;
  setVoiceOn: (value: boolean) => void;
  selectThread: (id: string | null) => void;
  createThread: (seed?: { prompt?: string; model?: string; personality?: PersonalityId }) => Thread;
  renameThread: (id: string, title: string) => void;
  deleteThread: (id: string) => void;
  setThreadModel: (id: string, model: string) => void;
  setThreadPersonality: (id: string, personality: PersonalityId) => void;
  appendMessage: (threadId: string, message: ChatMessage) => void;
  patchMessage: (threadId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (threadId: string, messageId: string) => void;
};

function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      threads: [],
      activeId: null,
      defaultModel: DEFAULT_MODEL,
      defaultPersonality: "default",
      reasoning: "low",
      voiceOn: true,
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      setDefaultModel: (model) => set({ defaultModel: model }),
      setDefaultPersonality: (id) => set({ defaultPersonality: id }),
      setReasoning: (level) => set({ reasoning: level }),
      setVoiceOn: (value) => set({ voiceOn: value }),
      selectThread: (id) => set({ activeId: id }),
      createThread: (seed) => {
        const now = Date.now();
        const thread: Thread = {
          id: newId(),
          title: seed?.prompt ? titleFromPrompt(seed.prompt) : "New thread",
          model: seed?.model ?? get().defaultModel,
          personality: seed?.personality ?? get().defaultPersonality,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          threads: [thread, ...state.threads].slice(0, MAX_THREADS),
          activeId: thread.id,
        }));
        return thread;
      },
      renameThread: (id, title) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === id ? { ...t, title: title.trim() || t.title, updatedAt: Date.now() } : t,
          ),
        })),
      deleteThread: (id) =>
        set((state) => {
          const threads = state.threads.filter((t) => t.id !== id);
          return {
            threads,
            activeId: state.activeId === id ? (threads[0]?.id ?? null) : state.activeId,
          };
        }),
      setThreadModel: (id, model) =>
        set((state) => ({
          threads: state.threads.map((t) => (t.id === id ? { ...t, model, updatedAt: Date.now() } : t)),
          defaultModel: state.activeId === id ? model : state.defaultModel,
        })),
      setThreadPersonality: (id, personality) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === id ? { ...t, personality, updatedAt: Date.now() } : t,
          ),
          defaultPersonality: state.activeId === id ? personality : state.defaultPersonality,
        })),
      appendMessage: (threadId, message) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: [...t.messages, message],
                  updatedAt: Date.now(),
                  title:
                    t.messages.length === 0 && message.role === "user"
                      ? titleFromPrompt(message.content)
                      : t.title,
                }
              : t,
          ),
        })),
      patchMessage: (threadId, messageId, patch) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  messages: t.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
                }
              : t,
          ),
        })),
      removeMessage: (threadId, messageId) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? { ...t, messages: t.messages.filter((m) => m.id !== messageId), updatedAt: Date.now() }
              : t,
          ),
        })),
    }),
    {
      name: CHAT_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChatState>;
        return {
          ...current,
          ...p,
          defaultModel:
            typeof p.defaultModel === "string" && p.defaultModel && !p.defaultModel.startsWith("grok-")
              ? p.defaultModel
              : DEFAULT_MODEL,
          reasoning: isReasoningLevel(p.reasoning) ? p.reasoning : current.reasoning,
          voiceOn: typeof p.voiceOn === "boolean" ? p.voiceOn : current.voiceOn,
          hydrated: false,
          threads: Array.isArray(p.threads)
            ? (p.threads as Thread[]).map((th) =>
                th?.model?.startsWith("grok-") ? { ...th, model: DEFAULT_MODEL } : th,
              )
            : current.threads,
        };
      },
      partialize: (state) => ({
        threads: state.threads,
        activeId: state.activeId,
        defaultModel: state.defaultModel,
        defaultPersonality: state.defaultPersonality,
        reasoning: state.reasoning,
        voiceOn: state.voiceOn,
      }),
    },
  ),
);

export function activeThread() {
  const { threads, activeId } = useChatStore.getState();
  return threads.find((t) => t.id === activeId) ?? null;
}
