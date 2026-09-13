import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Persist key: `star-rai-affection` (stable — do not rename without a migrator).
 * Schema v1: score 0–100, lastTalkDay (YYYY-MM-DD), streakDays, lastActiveAt.
 */
export const AFFECTION_STORE_KEY = "star-rai-affection";
export const AFFECTION_SCHEMA_VERSION = 1;

export type AffectionTier = "stranger" | "familiar" | "close" | "devoted";

export const TIER_LABEL: Record<AffectionTier, string> = {
  stranger: "Stranger",
  familiar: "Familiar",
  close: "Close",
  devoted: "Devoted",
};

export type AffectionNudge =
  | "chat"
  | "greet"
  | "compliment"
  | "memory"
  | "miss"
  | "soft";

type AffectionState = {
  score: number;
  /** Local calendar day of last talk (YYYY-MM-DD). */
  lastTalkDay: string | null;
  streakDays: number;
  lastActiveAt: number;
  /** Apply idle decay once per session / before reading. */
  touchDecay: () => void;
  /** Record a chat turn and optional nudge kinds. Returns new score. */
  nudge: (kinds?: AffectionNudge[]) => number;
  tier: () => AffectionTier;
  daysSinceTalk: () => number;
  affectionBlock: () => string;
};

function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDay(key: string | null): number | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysBetween(a: string | null, b: string): number {
  const ta = parseDay(a);
  const tb = parseDay(b);
  if (ta == null || tb == null) return 0;
  return Math.max(0, Math.round((tb - ta) / 86_400_000));
}

export function scoreToTier(score: number): AffectionTier {
  if (score >= 75) return "devoted";
  if (score >= 50) return "close";
  if (score >= 25) return "familiar";
  return "stranger";
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

const NUDGE_DELTA: Record<AffectionNudge, number> = {
  chat: 1,
  greet: 2,
  compliment: 3,
  memory: 4,
  miss: 2,
  soft: 2,
};

function applyDecay(state: {
  score: number;
  lastTalkDay: string | null;
  lastActiveAt: number;
}): { score: number; lastActiveAt: number } {
  const today = dayKey();
  const gap = daysBetween(state.lastTalkDay, today);
  // Lightweight: −2 per unused day after the first quiet day, cap −12.
  if (gap <= 1) return { score: state.score, lastActiveAt: state.lastActiveAt };
  const decay = Math.min(12, (gap - 1) * 2);
  // Only apply once per calendar day of opening the app.
  const lastDecayDay = dayKey(state.lastActiveAt);
  if (lastDecayDay === today) return { score: state.score, lastActiveAt: state.lastActiveAt };
  return { score: clampScore(state.score - decay), lastActiveAt: Date.now() };
}

export const useAffectionStore = create<AffectionState>()(
  persist(
    (set, get) => ({
      score: 8,
      lastTalkDay: null,
      streakDays: 0,
      lastActiveAt: Date.now(),
      touchDecay: () => {
        const cur = get();
        const next = applyDecay(cur);
        if (next.score !== cur.score || next.lastActiveAt !== cur.lastActiveAt) {
          set({ score: next.score, lastActiveAt: next.lastActiveAt });
        }
      },
      nudge: (kinds = ["chat"]) => {
        const cur = get();
        const decayed = applyDecay(cur);
        const today = dayKey();
        const gap = daysBetween(cur.lastTalkDay, today);
        let streak = cur.streakDays;
        if (!cur.lastTalkDay) streak = 1;
        else if (gap === 0) {
          /* same day — keep streak */
        } else if (gap === 1) streak = Math.max(1, streak + 1);
        else streak = 1;

        let delta = 0;
        const seen = new Set<AffectionNudge>();
        for (const k of kinds) {
          if (seen.has(k)) continue;
          seen.add(k);
          delta += NUDGE_DELTA[k] ?? 0;
        }
        // Tiny streak bonus (cap +2)
        if (streak >= 2) delta += Math.min(2, Math.floor(streak / 2));

        const score = clampScore(decayed.score + delta);
        set({
          score,
          lastTalkDay: today,
          streakDays: streak,
          lastActiveAt: Date.now(),
        });
        return score;
      },
      tier: () => scoreToTier(get().score),
      daysSinceTalk: () => {
        const { lastTalkDay } = get();
        if (!lastTalkDay) return 0;
        return daysBetween(lastTalkDay, dayKey());
      },
      affectionBlock: () => {
        const s = get();
        const decayed = applyDecay(s);
        const tier = scoreToTier(decayed.score);
        const gap = daysBetween(s.lastTalkDay, dayKey());
        const lines = [
          `Relationship: ${TIER_LABEL[tier]} (affection ${decayed.score}/100).`,
          `Tone: ${tierToneHint(tier)}`,
        ];
        if (s.streakDays >= 2) lines.push(`Talk streak: ${s.streakDays} days.`);
        if (gap >= 2) {
          lines.push(
            `They were away ~${gap} days. Softly mention you noticed the quiet / missed them — still tsundere, not clingy.`,
          );
        }
        return lines.join("\n");
      },
    }),
    {
      name: AFFECTION_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        score: state.score,
        lastTalkDay: state.lastTalkDay,
        streakDays: state.streakDays,
        lastActiveAt: state.lastActiveAt,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AffectionState>;
        return {
          ...current,
          score: typeof p.score === "number" ? clampScore(p.score) : current.score,
          lastTalkDay: typeof p.lastTalkDay === "string" ? p.lastTalkDay : null,
          streakDays: typeof p.streakDays === "number" ? Math.max(0, p.streakDays) : 0,
          lastActiveAt: typeof p.lastActiveAt === "number" ? p.lastActiveAt : Date.now(),
        };
      },
    },
  ),
);

export function tierToneHint(tier: AffectionTier): string {
  switch (tier) {
    case "stranger":
      return "Keep some distance. Polite-sharp; don't overshare warmth.";
    case "familiar":
      return "Slightly warmer. You recognize them; still tease.";
    case "close":
      return "Clearly fond under the bite. Soft edges allowed.";
    case "devoted":
      return "Protective and quietly attached. Soft miss-you energy OK; never syrupy.";
  }
}

/** Classify a user line into affection nudge kinds (for chat turns). */
export function affectionNudgesFor(text: string, memAdded: boolean): AffectionNudge[] {
  const lower = text.toLowerCase();
  const kinds: AffectionNudge[] = ["chat"];
  if (
    /\b(hi|hey|hello|yo|sup|good morning|good evening|just got here|i'?m here)\b/.test(lower) ||
    /^(hi|hey|hello)[.!~]*$/i.test(lower.trim())
  ) {
    kinds.push("greet");
  }
  if (
    /kiss|love you|cute|pretty|beautiful|hot|date|flirt|crush|you(?:'re| are) (?:amazing|great|the best|incredible|talented)|proud of you|good job|well done/.test(
      lower,
    )
  ) {
    kinds.push("compliment");
  }
  if (/miss(?:ed)? you|been a while|long time|where were you/.test(lower)) {
    kinds.push("miss");
  }
  if (/hold me|stay with me|soft|gentle|tired|lonely|hug|comfort|scared|anxious|bad day/.test(lower)) {
    kinds.push("soft");
  }
  if (memAdded || /\bremember (?:that |this )?\b/.test(lower) || /my name is|i live in|i like /.test(lower)) {
    kinds.push("memory");
  }
  return kinds;
}
