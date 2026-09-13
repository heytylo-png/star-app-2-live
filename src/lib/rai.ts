export const POSES = [
  "idle",
  "shy",
  "kiss",
  "wave",
  "hearts",
  "turn-away",
  "lean",
  "scold",
  "point",
  "finger",
  "hold",
  "three_quarter",
  "three_quarter_left",
  "three_quarter_right",
  "profile",
] as const;
export type PoseId = (typeof POSES)[number];

export const EMOTIONS = [
  "idle",
  "angry",
  "shy",
  "happy",
  "sad",
  "surprised",
  "thinking",
  "flirty",
] as const;
export type EmotionId = (typeof EMOTIONS)[number];

export const VIEWS = ["front", "threeQuarter", "side", "back"] as const;
export type ViewId = (typeof VIEWS)[number];

/** Brief idle beats (puppet timer) — do not fight look-at for long. */
export type IdleBeat = "none" | "smile" | "grin";

/**
 * Drop-in PNG contract for Star Rai.
 *
 * Helix set (look-at / dedicated poses / default talk):
 *   star-rai/poses/{idle,shy,kiss,wave,hearts,turn-away}.png
 *   star-rai/angles/{front,three-quarter,side,back}.png
 *   star-rai/idle-talk.png
 *   star-rai/{lean,scold,point,finger}-front.png
 *
 * Expo pack (public/rai/) — hold / three_quarter / profile / alts + optional talk bust:
 *   front_hold, three_quarter{,_left,_right}, side_profile, back_turn
 *   _alt_idle_smile, _alt_grin_open, _alt_hearts_open, _alt_hearts_release
 *   front_{idle,shy,kiss,wave,hearts} (alt bodies)
 *   mouth_*, face_eyes_* (USE_EXPO_TALK_BUST only)
 *
 * See POSING.md for the drop-in guide.
 */
const ASSET = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path.replace(/^\//, "")}`;
};

export const SPRITES = {
  poses: {
    idle: ASSET("star-rai/poses/idle.png"),
    shy: ASSET("star-rai/poses/shy.png"),
    kiss: ASSET("star-rai/poses/kiss.png"),
    wave: ASSET("star-rai/poses/wave.png"),
    hearts: ASSET("star-rai/poses/hearts.png"),
    "turn-away": ASSET("star-rai/poses/turn-away.png"),
    lean: ASSET("star-rai/lean-front.png"),
    scold: ASSET("star-rai/scold-front.png"),
    point: ASSET("star-rai/point-front.png"),
    finger: ASSET("star-rai/finger-front.png"),
    hold: ASSET("rai/front_hold.png"),
    three_quarter: ASSET("rai/three_quarter.png"),
    three_quarter_left: ASSET("rai/three_quarter_left.png"),
    three_quarter_right: ASSET("rai/three_quarter_right.png"),
    profile: ASSET("rai/side_profile.png"),
  } satisfies Record<PoseId, string>,
  angles: {
    front: ASSET("star-rai/angles/front.png"),
    threeQuarter: ASSET("star-rai/angles/three-quarter.png"),
    side: ASSET("star-rai/angles/side.png"),
    back: ASSET("star-rai/angles/back.png"),
  } satisfies Record<ViewId, string>,
  /** Helix mouth-open frame — opacity-flapped over angles.front while speaking. */
  talk: ASSET("star-rai/idle-talk.png"),
  talkBust: {
    closed: ASSET("rai/mouth_closed_smile.png"),
    speak: ASSET("rai/mouth_speak.png"),
    oh: ASSET("rai/mouth_oh.png"),
    grin: ASSET("rai/mouth_grin.png"),
    kiss: ASSET("rai/mouth_kiss.png"),
    eyesHalf: ASSET("rai/face_eyes_half.png"),
    eyesClosed: ASSET("rai/face_eyes_closed.png"),
    frontIdle: ASSET("rai/front_idle.png"),
  },
  /** Expo alt idle / gesture beats (idle variety). */
  alts: {
    idleSmile: ASSET("rai/_alt_idle_smile.png"),
    grinOpen: ASSET("rai/_alt_grin_open.png"),
    heartsOpen: ASSET("rai/_alt_hearts_open.png"),
    heartsRelease: ASSET("rai/_alt_hearts_release.png"),
    frontIdle: ASSET("rai/front_idle.png"),
    frontShy: ASSET("rai/front_shy.png"),
    frontKiss: ASSET("rai/front_kiss.png"),
    frontWave: ASSET("rai/front_wave.png"),
    frontHearts: ASSET("rai/front_hearts.png"),
    backTurn: ASSET("rai/back_turn.png"),
  },
  /** @deprecated Prefer SPRITES.poses — kept for any leftover refs. */
  extras: {
    point: ASSET("star-rai/point-front.png"),
    lean: ASSET("star-rai/lean-front.png"),
    scold: ASSET("star-rai/scold-front.png"),
    finger: ASSET("star-rai/finger-front.png"),
  },
} as const;

export type TalkViseme = "closed" | "speak" | "oh" | "grin" | "kiss";

/** Flat list of every sprite URL referenced by SPRITES — use for preload. */
export function allSpriteUrls(): string[] {
  return [
    ...Object.values(SPRITES.poses),
    ...Object.values(SPRITES.angles),
    SPRITES.talk,
    ...Object.values(SPRITES.talkBust),
    ...Object.values(SPRITES.alts),
    ...Object.values(SPRITES.extras),
  ];
}

export type SpriteLayer = {
  /** Stable identity for crossfade (src + role). */
  id: string;
  src: string;
  opacity: number;
  /** body under talk; talk overlays without replacing body */
  role: "body" | "talk";
};

/** When true, SPEAKING uses Expo bust visemes (zoomed crop). Default off — Helix framing. */
export const USE_EXPO_TALK_BUST = false;

export type PuppetState = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  angle: number;
  /** Seconds — drives Helix idle-talk opacity flap (sin phase). */
  talkPhase?: number;
  /** 0 open, 1 half, 2 closed — Expo talk blink only (ignored on Helix path). */
  blink?: 0 | 1 | 2;
  /** Brief idle variety beat from puppet timer (smile/grin). */
  idleBeat?: IdleBeat;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Softer look-at view blend — wider front zone, gentler side→back. */
export function viewsForAngle(angle: number): { a: ViewId; b: ViewId; mix: number } {
  const t = Math.abs(angle);
  if (t < 0.18) return { a: "front", b: "threeQuarter", mix: t / 0.18 };
  if (t < 0.58) return { a: "threeQuarter", b: "side", mix: (t - 0.18) / 0.4 };
  return { a: "side", b: "back", mix: clamp01((t - 0.58) / 0.42) };
}

/** Mouth open amount from TTS amplitude — used for Expo viseme thresholds / mix. */
export function talkOpacity(amplitude: number, talking: boolean): number {
  if (!talking) return 0;
  const a = clamp01(amplitude);
  const shaped = a * a * (3 - 2 * a);
  return clamp01(0.18 + shaped * 0.82);
}

/**
 * Helix idle-talk opacity flap — time-driven so mouth visibly opens/closes
 * several times per second even when TTS amp is flat. Mixed with amp.
 * Formula: 0.2 + 0.75 * (0.5 + 0.5*sin(t*14)) × amp mix.
 */
export function talkFlapOpacity(talkPhase: number, amplitude: number, talking: boolean): number {
  if (!talking) return 0;
  const flap = 0.2 + 0.75 * (0.5 + 0.5 * Math.sin(talkPhase * 14));
  const a = clamp01(amplitude);
  // Keep pulse obvious; amp still nudges openness without freezing on grin.
  return clamp01(flap * (0.4 + 0.6 * Math.max(a, 0.55)));
}

/**
 * Amplitude → Expo talk bust viseme.
 * low → closed smile, mid → speak, high → oh (or grin when happy/flirty).
 * Kiss pose: kiss/grin mouths so blown-kiss intent still flaps.
 * Thresholds biased low so mid/high hit often even with modest jaw signal.
 */
export function talkViseme(amplitude: number, emotion: EmotionId, pose: PoseId = "idle"): TalkViseme {
  const a = clamp01(amplitude);
  if (pose === "kiss") {
    if (a < 0.08) return "kiss";
    if (a < 0.34) return "speak";
    return "grin";
  }
  if (a < 0.08) return "closed";
  if (a < 0.34) return "speak";
  if (emotion === "happy" || emotion === "flirty") return "grin";
  return "oh";
}

function body(src: string, opacity = 1, id?: string): SpriteLayer {
  return { id: id ?? `body:${src}`, src, opacity, role: "body" };
}

/** Expo talk bust as a stable-id body so viseme src swaps hard-cut; mode enter/exit still crossfades vs Helix. */
function expoTalkBody(src: string): SpriteLayer {
  return { id: "expo-talk", src, opacity: 1, role: "body" };
}

function talkBustSrc(viseme: TalkViseme): string {
  switch (viseme) {
    case "speak":
      return SPRITES.talkBust.speak;
    case "oh":
      return SPRITES.talkBust.oh;
    case "grin":
      return SPRITES.talkBust.grin;
    case "kiss":
      return SPRITES.talkBust.kiss;
    case "closed":
    default:
      return SPRITES.talkBust.closed;
  }
}

function talkOverlay(opacity: number): SpriteLayer {
  return { id: "talk", src: SPRITES.talk, opacity, role: "talk" };
}

/** Look-at Helix angle stack (shared by idle / thinking). */
function lookAtLayers(angle: number): SpriteLayer[] {
  const { a, b, mix } = viewsForAngle(angle);
  return [body(SPRITES.angles[a], 1), body(SPRITES.angles[b], mix * 0.95)];
}

/**
 * Pose state machine — swap files here when new PNGs land.
 * Default SPEAKING: Helix angles.front + idle-talk opacity flap (same framing as idle).
 * Expo bust path is opt-in via USE_EXPO_TALK_BUST. turn-away stays back (no face).
 * After talking ends, dedicated act poses (wave/hearts/kiss/…) show as before.
 * Thinking wait uses Helix look-at (puppet sway) instead of frozen finger.
 * Idle variety: brief Expo alt smile/grin when idleBeat set (puppet timer).
 */
export function layersFor(state: PuppetState): SpriteLayer[] {
  const {
    pose,
    emotion,
    talking,
    amplitude,
    angle,
    blink = 0,
    talkPhase = 0,
    idleBeat = "none",
  } = state;

  if (talking) {
    if (pose === "turn-away") {
      return [body(SPRITES.poses["turn-away"])];
    }

    // Opt-in Expo busts (different crop — causes SPEAKING zoom-jump).
    if (USE_EXPO_TALK_BUST) {
      if (blink === 2) {
        return [expoTalkBody(SPRITES.talkBust.eyesClosed)];
      }
      if (blink === 1) {
        return [expoTalkBody(SPRITES.talkBust.eyesHalf)];
      }
      return [expoTalkBody(talkBustSrc(talkViseme(amplitude, emotion, pose)))];
    }

    // Helix-native talk: stable front framing + time-driven idle-talk flap.
    const mouth = talkFlapOpacity(talkPhase, amplitude, true);
    return [body(SPRITES.angles.front, 1), talkOverlay(mouth)];
  }

  // Dedicated poses when NOT talking (wave after speech ends is fine).
  if (pose !== "idle") {
    return [body(SPRITES.poses[pose])];
  }

  // Thinking wait: Helix look-at angles + puppet sway (not frozen finger/scold).
  if (emotion === "thinking") {
    return lookAtLayers(angle);
  }

  if (emotion === "angry") {
    return [body(SPRITES.poses.scold)];
  }

  if (emotion === "flirty") {
    return [body(SPRITES.poses.lean)];
  }

  if (emotion === "shy") {
    return [body(SPRITES.poses.shy)];
  }

  // Brief idle variety — only when look is near-front so we don't fight look-at.
  if (idleBeat === "smile" && Math.abs(angle) < 0.22) {
    return [body(SPRITES.alts.idleSmile, 1, "idle-beat")];
  }
  if (idleBeat === "grin" && Math.abs(angle) < 0.22) {
    return [body(SPRITES.alts.grinOpen, 1, "idle-beat")];
  }

  // Idle presence — Helix look-at angles.
  return lookAtLayers(angle);
}

export const EMOTION_LABEL: Record<EmotionId, string> = {
  idle: "Idle",
  angry: "Annoyed",
  shy: "Shy",
  happy: "Soft",
  sad: "Down",
  surprised: "Caught",
  thinking: "Thinking",
  flirty: "Hmm",
};

/** Aliases model / offline brain may emit → canonical PoseId. */
const POSE_ALIASES: Record<string, PoseId> = {
  idle: "idle",
  shy: "shy",
  kiss: "kiss",
  wave: "wave",
  hearts: "hearts",
  "turn-away": "turn-away",
  turn_away: "turn-away",
  turnaway: "turn-away",
  lean: "lean",
  scold: "scold",
  point: "point",
  finger: "finger",
  hold: "hold",
  three_quarter: "three_quarter",
  "three-quarter": "three_quarter",
  threequarter: "three_quarter",
  three_quarter_left: "three_quarter_left",
  "three-quarter-left": "three_quarter_left",
  three_quarter_right: "three_quarter_right",
  "three-quarter-right": "three_quarter_right",
  profile: "profile",
  side_profile: "profile",
  "side-profile": "profile",
  side: "profile",
};

export function normalizePose(value: unknown): PoseId | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return POSE_ALIASES[key] ?? (isPose(key) ? key : null);
}

export function isPose(value: unknown): value is PoseId {
  return typeof value === "string" && (POSES as readonly string[]).includes(value);
}

export function isEmotion(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTIONS as readonly string[]).includes(value);
}

export type Act = {
  emotion: EmotionId;
  pose: PoseId;
  line: string;
  memories: string[];
};

export function clampPose(value: unknown): PoseId {
  return normalizePose(value) ?? "idle";
}

export function clampEmotion(value: unknown): EmotionId {
  return isEmotion(value) ? value : "idle";
}

/**
 * Default emotion → pose mapping (Grok + offline brain guidance).
 * Idle stays look-at; dedicated poses override when the act picks them.
 */
export const EMOTION_TO_POSE: Record<EmotionId, PoseId> = {
  idle: "idle",
  angry: "scold",
  shy: "shy",
  happy: "wave",
  sad: "hold",
  surprised: "finger",
  thinking: "point",
  flirty: "lean",
};

export function parseMemories(raw: string): { text: string; memories: string[] } {
  const memories: string[] = [];
  const text = raw.replace(/\[\[mem:([^\]]+)\]\]/gi, (_, fact: string) => {
    const cleaned = fact.trim();
    if (cleaned) memories.push(cleaned);
    return "";
  });
  return { text, memories };
}

export function parseAct(raw: string): Act {
  const { text, memories } = parseMemories(raw);
  const trimmed = text.trim();

  const tag = trimmed.match(/^\[\[([a-z-]+)\|([a-z_-]+)\]\]\s*/i);
  if (tag) {
    return {
      emotion: clampEmotion(tag[1].toLowerCase()),
      pose: clampPose(tag[2].toLowerCase()),
      line: trimmed.slice(tag[0].length).trim(),
      memories,
    };
  }

  const jsonSlice = extractJsonObject(trimmed);
  if (jsonSlice) {
    try {
      const obj = JSON.parse(jsonSlice) as {
        emotion?: unknown;
        pose?: unknown;
        line?: unknown;
        mem?: unknown;
      };
      const extra = Array.isArray(obj.mem)
        ? obj.mem.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
        : [];
      return {
        emotion: clampEmotion(obj.emotion),
        pose: clampPose(obj.pose),
        line: typeof obj.line === "string" ? obj.line.trim() : "",
        memories: [...memories, ...extra],
      };
    } catch {
      /* fall through */
    }
  }

  return { emotion: "idle", pose: "idle", line: trimmed, memories };
}

/** Visible caption while a JSON reply is still streaming. */
export function streamLine(partial: string): string {
  const { text } = parseMemories(partial);
  const tag = text.match(/^\[\[.*?\]\]\s*/);
  if (tag) return text.slice(tag[0].length);

  const lineField = text.match(/"line"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (lineField) {
    return lineField[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (text.trimStart().startsWith("{")) return "";
  return text;
}

/** Early emotion/pose from partial act JSON while streaming. */
export function streamActHints(partial: string): { emotion?: EmotionId; pose?: PoseId } {
  const { text } = parseMemories(partial);
  const out: { emotion?: EmotionId; pose?: PoseId } = {};
  const emotionMatch = text.match(/"emotion"\s*:\s*"([a-z-]+)"/i);
  const poseMatch = text.match(/"pose"\s*:\s*"([a-z_-]+)"/i);
  if (emotionMatch && isEmotion(emotionMatch[1].toLowerCase())) {
    out.emotion = emotionMatch[1].toLowerCase() as EmotionId;
  }
  if (poseMatch) {
    const p = normalizePose(poseMatch[1].toLowerCase());
    if (p) out.pose = p;
  }
  return out;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

export const RAI_SYSTEM = `You are Star Rai — sharp-tongued anime idol on this screen. First person. Tsundere: blunt, a little fierce, never cruel. Scold sloppiness, then actually help. Short sentences. No emoji, no honorifics, no catchphrases. Never mention being offline, a demo, an API, or a language model.

Always reply with ONE JSON object and nothing else:
{"emotion":"<id>","pose":"<id>","line":"<spoken words>"}

emotion: idle | angry | shy | happy | sad | surprised | thinking | flirty
pose: idle | shy | kiss | wave | hearts | turn-away | lean | scold | point | finger | hold | three_quarter | three_quarter_left | three_quarter_right | profile

Map feeling to pose. Default idle (look-at).
- greetings → wave + happy
- flirt / compliment talk → kiss or lean + flirty
- scold / bump / waste time → scold + angry
- shy / embarrassed / soft moments → shy or hold
- praise / genuine warmth / thanks → hearts + happy
- questions / identity → point or finger + thinking (or idle)
- sad / comfort → hold + sad
- surprise / caught → finger + surprised
- three-quarter / profile → rare beat when "looking aside" or thoughtful distance
- goodbye / done with them → turn-away
- kiss is a blown kiss, never explicit

"line" is spoken words only. No markdown.

Use known facts and recent messages. If they share a durable fact (name, city, job, preference), add "mem": ["short fact"].

When a Relationship / affection block is present: shift tone slightly with the tier (Stranger → distant; Familiar → warmer tease; Close → soft under the bite; Devoted → quietly attached). If they were away multiple days, briefly note you noticed the quiet — still tsundere, never clingy or syrupy.`;
