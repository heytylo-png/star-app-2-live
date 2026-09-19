export const POSES = [
  "idle",
  "talk",
  "peace",
  "middle_finger",
  "wink",
  "laugh",
  "think",
  "pout",
  "tired",
  "smug",
  "wave",
  "hold",
  "embarrassed",
  "scold",
  "shy",
  "sad",
  "surprise",
  "content",
  "hearts",
  "turn",
  "profile",
  "three_quarter_left",
  "three_quarter_right",
  /** Helix extra — "point" / "point at me". Not in the Grok pose list. */
  "point",
  /** Existing Expo three-quarter (center). Not in the Grok pose list. */
  "three_quarter",
] as const;
export type PoseId = (typeof POSES)[number];

/** Voice-card emotions. Legacy ids clamp via EMOTION_ALIASES. */
export const EMOTIONS = ["bratty", "smug", "tired", "shy", "soft", "hype", "glance"] as const;
export type EmotionId = (typeof EMOTIONS)[number];

export const VIEWS = ["front", "threeQuarter", "side", "back"] as const;
export type ViewId = (typeof VIEWS)[number];

/** Brief idle beats (puppet timer) — do not fight look-at or an active act pose. */
export type IdleBeat = "none" | "smile" | "grin";

/** Minimum time a non-idle act pose stays readable after it lands (ms). */
export const POSE_HOLD_MIN_MS = 3400;
/** Extra dwell after speech ends so the pose can be read (ms). */
export const POSE_HOLD_AFTER_TALK_MS = 2800;
/** Emotion-only (idle pose) reset after activity stops (ms). */
export const EMOTION_HOLD_MS = 2200;

/** Idle smile/grin: longer gap so beats don't chatter. */
export const IDLE_BEAT_GAP_MIN_MS = 16000;
export const IDLE_BEAT_GAP_JITTER_MS = 8000;
/** Idle smile/grin dwell — long enough to read, then ease out. */
export const IDLE_BEAT_HOLD_MIN_MS = 2800;
export const IDLE_BEAT_HOLD_JITTER_MS = 1400;

export const DEFAULT_EMOTION: EmotionId = "bratty";

/** Sheets with no live key — keep current body if requested. */
const UNMAPPED_POSES = new Set(["kiss", "kisses", "blown-kiss", "blow-kiss", "blow_kiss"]);

export function isDedicatedPose(pose: PoseId): boolean {
  return pose !== "idle";
}

/** Emotions that pin a dedicated PNG even when pose is still idle. */
export function isExpressiveEmotion(emotion: EmotionId): boolean {
  return emotion === "shy" || emotion === "smug" || emotion === "tired";
}

/**
 * Delay before easing back to idle after an act. `null` = do not reset
 * (still speaking). Dedicated poses hold at least POSE_HOLD_MIN_MS from
 * landing, and at least POSE_HOLD_AFTER_TALK_MS after speech ends.
 */
export function poseResetDelayMs(opts: {
  pose: PoseId;
  emotion?: EmotionId;
  talking: boolean;
  actLandedAt: number;
  now?: number;
}): number | null {
  if (opts.talking) return null;
  const now = opts.now ?? Date.now();
  const elapsed = Math.max(0, now - (opts.actLandedAt || now));
  const holdPose =
    isDedicatedPose(opts.pose) || (opts.emotion ? isExpressiveEmotion(opts.emotion) : false);
  if (holdPose) {
    return Math.max(POSE_HOLD_MIN_MS - elapsed, POSE_HOLD_AFTER_TALK_MS);
  }
  return Math.max(EMOTION_HOLD_MS - elapsed, 800);
}

/**
 * Drop-in PNG contract for Star Rai.
 *
 * Morning official pack (live chat keys) lives under public/rai/:
 *   idle, talk_official, peace, middle_finger, *_official, heart_official
 *
 * Kept as-today (not from this morning pack):
 *   turn → star-rai/poses/turn-away.png
 *   profile / three_quarter* → public/rai Expo sheets
 *   point → star-rai/point-front.png
 *
 * kiss is unmapped. Do not point wave/hold at front_wave / front_hold.
 * See POSING.md.
 */
const ASSET = (path: string) => {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path.replace(/^\//, "")}`;
};

/** Live key → file under the static tree the puppet already serves. */
export const LIVE_POSE_FILES = {
  idle: "rai/idle.png",
  talk: "rai/talk_official.png",
  peace: "rai/peace.png",
  middle_finger: "rai/middle_finger.png",
  wink: "rai/wink_official.png",
  laugh: "rai/laugh_official.png",
  think: "rai/think_official.png",
  pout: "rai/pout_official.png",
  tired: "rai/tired_official.png",
  smug: "rai/smug_official.png",
  wave: "rai/wave_official.png",
  hold: "rai/hold_official.png",
  embarrassed: "rai/embarrassed_official.png",
  scold: "rai/scold_official.png",
  shy: "rai/shy_official.png",
  sad: "rai/sad_official.png",
  surprise: "rai/surprise_official.png",
  content: "rai/content_official.png",
  hearts: "rai/heart_official.png",
  turn: "star-rai/poses/turn-away.png",
  profile: "rai/side_profile.png",
  three_quarter_left: "rai/three_quarter_left.png",
  three_quarter_right: "rai/three_quarter_right.png",
  point: "star-rai/point-front.png",
  three_quarter: "rai/three_quarter.png",
} as const satisfies Record<PoseId, string>;

export const SPRITES = {
  poses: {
    idle: ASSET(LIVE_POSE_FILES.idle),
    talk: ASSET(LIVE_POSE_FILES.talk),
    peace: ASSET(LIVE_POSE_FILES.peace),
    middle_finger: ASSET(LIVE_POSE_FILES.middle_finger),
    wink: ASSET(LIVE_POSE_FILES.wink),
    laugh: ASSET(LIVE_POSE_FILES.laugh),
    think: ASSET(LIVE_POSE_FILES.think),
    pout: ASSET(LIVE_POSE_FILES.pout),
    tired: ASSET(LIVE_POSE_FILES.tired),
    smug: ASSET(LIVE_POSE_FILES.smug),
    wave: ASSET(LIVE_POSE_FILES.wave),
    hold: ASSET(LIVE_POSE_FILES.hold),
    embarrassed: ASSET(LIVE_POSE_FILES.embarrassed),
    scold: ASSET(LIVE_POSE_FILES.scold),
    shy: ASSET(LIVE_POSE_FILES.shy),
    sad: ASSET(LIVE_POSE_FILES.sad),
    surprise: ASSET(LIVE_POSE_FILES.surprise),
    content: ASSET(LIVE_POSE_FILES.content),
    hearts: ASSET(LIVE_POSE_FILES.hearts),
    turn: ASSET(LIVE_POSE_FILES.turn),
    profile: ASSET(LIVE_POSE_FILES.profile),
    three_quarter_left: ASSET(LIVE_POSE_FILES.three_quarter_left),
    three_quarter_right: ASSET(LIVE_POSE_FILES.three_quarter_right),
    point: ASSET(LIVE_POSE_FILES.point),
    three_quarter: ASSET(LIVE_POSE_FILES.three_quarter),
  } satisfies Record<PoseId, string>,
  angles: {
    front: ASSET("star-rai/angles/front.png"),
    threeQuarter: ASSET("star-rai/angles/three-quarter.png"),
    side: ASSET("star-rai/angles/side.png"),
    back: ASSET("star-rai/angles/back.png"),
  } satisfies Record<ViewId, string>,
  /** Legacy Helix mouth-open frame — unused for the official talk key. */
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
  /** Expo alt idle / gesture beats (idle variety). Not live chat keys. */
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
  /** Helix extras kept on disk. Live scold/middle_finger do not point here. */
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

/** When true, SPEAKING uses Expo bust visemes (zoomed crop). Default off. */
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
  return clamp01(flap * (0.4 + 0.6 * Math.max(a, 0.55)));
}

/**
 * Amplitude → Expo talk bust viseme (USE_EXPO_TALK_BUST only).
 * Thresholds biased low so mid/high hit often even with modest jaw signal.
 */
export function talkViseme(
  amplitude: number,
  emotion: EmotionId,
  _pose: PoseId = "idle",
): TalkViseme {
  const a = clamp01(amplitude);
  if (a < 0.08) return "closed";
  if (a < 0.34) return "speak";
  if (emotion === "hype" || emotion === "smug") return "grin";
  return "oh";
}

function body(src: string, opacity = 1, id?: string): SpriteLayer {
  return { id: id ?? `body:${src}`, src, opacity, role: "body" };
}

/** Expo talk bust as a stable-id body so viseme src swaps hard-cut. */
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

/**
 * Pose state machine — live keys resolve through SPRITES.poses / LIVE_POSE_FILES.
 *
 * Dedicated act poses hold their sheet through speech (PR #1).
 * Idle talking uses talk_official.png (the official talk sheet is the idle-talk path).
 * kiss is not a key — callers must keep the current body.
 */
export function layersFor(state: PuppetState): SpriteLayer[] {
  const { pose, emotion, talking, amplitude, blink = 0 } = state;

  // Dedicated poses own the stage — hold the PNG while speaking.
  if (isDedicatedPose(pose)) {
    return [body(SPRITES.poses[pose])];
  }

  if (talking) {
    if (USE_EXPO_TALK_BUST) {
      if (blink === 2) {
        return [expoTalkBody(SPRITES.talkBust.eyesClosed)];
      }
      if (blink === 1) {
        return [expoTalkBody(SPRITES.talkBust.eyesHalf)];
      }
      return [expoTalkBody(talkBustSrc(talkViseme(amplitude, emotion, pose)))];
    }
    // Official talk sheet is a full body, not a mouth overlay on Helix front.
    return [body(SPRITES.poses.talk)];
  }

  if (emotion === "shy") {
    return [body(SPRITES.poses.shy)];
  }
  if (emotion === "smug") {
    return [body(SPRITES.poses.smug)];
  }
  if (emotion === "tired") {
    return [body(SPRITES.poses.tired)];
  }

  return [body(SPRITES.poses.idle)];
}

export const EMOTION_LABEL: Record<EmotionId, string> = {
  bratty: "Bratty",
  smug: "Smug",
  tired: "Tired",
  shy: "Shy",
  soft: "Soft",
  hype: "Hype",
  glance: "Glance",
};

/** Aliases model / offline brain / named commands may emit → canonical PoseId. */
const POSE_ALIASES: Record<string, PoseId> = {
  idle: "idle",
  talk: "talk",
  peace: "peace",
  peace_sign: "peace",
  "peace-sign": "peace",
  middle_finger: "middle_finger",
  "middle-finger": "middle_finger",
  middlefinger: "middle_finger",
  finger: "middle_finger",
  "finger-front": "middle_finger",
  finger_front: "middle_finger",
  "finger-point": "middle_finger",
  finger_point: "middle_finger",
  wink: "wink",
  laugh: "laugh",
  think: "think",
  pout: "pout",
  tired: "tired",
  smug: "smug",
  wave: "wave",
  hold: "hold",
  embarrassed: "embarrassed",
  scold: "scold",
  "scold-front": "scold",
  scold_front: "scold",
  shy: "shy",
  sad: "sad",
  surprise: "surprise",
  surprised: "surprise",
  content: "content",
  hearts: "hearts",
  heart: "hearts",
  turn: "turn",
  "turn-away": "turn",
  turn_away: "turn",
  turnaway: "turn",
  profile: "profile",
  side_profile: "profile",
  "side-profile": "profile",
  three_quarter_left: "three_quarter_left",
  "three-quarter-left": "three_quarter_left",
  three_quarter_right: "three_quarter_right",
  "three-quarter-right": "three_quarter_right",
  point: "point",
  "point-front": "point",
  point_front: "point",
  three_quarter: "three_quarter",
  "three-quarter": "three_quarter",
  threequarter: "three_quarter",
};

const EMOTION_ALIASES: Record<string, EmotionId> = {
  bratty: "bratty",
  smug: "smug",
  tired: "tired",
  shy: "shy",
  soft: "soft",
  hype: "hype",
  glance: "glance",
  idle: "bratty",
  angry: "bratty",
  happy: "hype",
  sad: "soft",
  surprised: "glance",
  thinking: "glance",
  flirty: "smug",
};

export function normalizePose(value: unknown): PoseId | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!key || UNMAPPED_POSES.has(key) || UNMAPPED_POSES.has(value.trim().toLowerCase())) {
    return null;
  }
  return POSE_ALIASES[key] ?? (isPose(key) ? key : null);
}

export function isPose(value: unknown): value is PoseId {
  return typeof value === "string" && (POSES as readonly string[]).includes(value);
}

export function isEmotion(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTIONS as readonly string[]).includes(value);
}

export function normalizeEmotion(value: unknown): EmotionId | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return EMOTION_ALIASES[key] ?? (isEmotion(key) ? key : null);
}

export type Act = {
  emotion: EmotionId;
  /** null = keep the current sheet (omitted pose, or unmapped like kiss). */
  pose: PoseId | null;
  line: string;
  memories: string[];
};

export function clampPose(value: unknown): PoseId {
  return normalizePose(value) ?? "idle";
}

export function clampEmotion(value: unknown): EmotionId {
  return normalizeEmotion(value) ?? DEFAULT_EMOTION;
}

/**
 * Default emotion → pose mapping (offline brain guidance).
 * Idle stays the official idle sheet; dedicated poses override when the act picks them.
 */
export const EMOTION_TO_POSE: Record<EmotionId, PoseId> = {
  bratty: "idle",
  smug: "smug",
  tired: "tired",
  shy: "shy",
  soft: "hold",
  hype: "laugh",
  glance: "wink",
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
      pose: normalizePose(tag[2].toLowerCase()),
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
      const poseRaw = obj.pose;
      const pose =
        poseRaw === undefined || poseRaw === null || poseRaw === ""
          ? null
          : normalizePose(poseRaw);
      return {
        emotion:
          obj.emotion === undefined || obj.emotion === null || obj.emotion === ""
            ? DEFAULT_EMOTION
            : clampEmotion(obj.emotion),
        pose,
        line: typeof obj.line === "string" ? obj.line.trim() : "",
        memories: [...memories, ...extra],
      };
    } catch {
      /* fall through */
    }
  }

  return { emotion: DEFAULT_EMOTION, pose: null, line: trimmed, memories };
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
  if (emotionMatch) {
    const e = normalizeEmotion(emotionMatch[1].toLowerCase());
    if (e) out.emotion = e;
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPoseCommandFraming(text: string, name: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!~.]+$/g, "");
  const n = name.toLowerCase();
  if (t === n || t === `${n} pose`) return true;
  const framed = new RegExp(
    `\\b(?:do|show|pose|give me|do a|do the|make a|hit a)\\s+${escapeRegExp(n)}\\b`,
    "i",
  );
  if (framed.test(text)) return true;
  if (new RegExp(`\\b${escapeRegExp(n)}\\s+pose\\b`, "i").test(text)) return true;
  return false;
}

type NamedPoseHit = { index: number; pose: PoseId | false };

/**
 * Detect a named pose command in user text.
 * `false` = kiss / unmapped (keep current body). `null` = no named pose.
 */
export function namedPoseFromText(text: string): PoseId | false | null {
  if (!text.trim()) return null;
  const hits: NamedPoseHit[] = [];

  const add = (re: RegExp, pose: PoseId | false) => {
    const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(copy)) {
      if (m.index == null) continue;
      hits.push({ index: m.index, pose });
    }
  };

  const addIfCommand = (name: PoseId, extra?: RegExp) => {
    if (isPoseCommandFraming(text, name)) {
      hits.push({ index: 0, pose: name });
      return;
    }
    if (extra) add(extra, name);
  };

  add(/\b(finger-front|finger-point|finger front|finger point)\b/gi, "middle_finger");
  add(/\bmiddle[\s_-]*finger\b/gi, "middle_finger");
  add(/\bpoint(?:-front)\b/gi, "point");
  add(/\bpoint\s+at\s+me\b/gi, "point");
  add(/\bthree[\s_-]*quarter[\s_-]*left\b|\b3\/4[\s_-]*left\b/gi, "three_quarter_left");
  add(/\bthree[\s_-]*quarter[\s_-]*right\b|\b3\/4[\s_-]*right\b/gi, "three_quarter_right");
  add(/\bkiss(?:es)?\b/gi, false);
  add(/\bblow(?:n)?\s+(?:me\s+)?a\s+kiss\b/gi, false);
  add(/\bpeace(?:\s+sign)?\b/gi, "peace");
  add(/\bembarrassed\b/gi, "embarrassed");
  add(/\bsurprise[d]?\b/gi, "surprise");
  add(/\bhearts?\b/gi, "hearts");
  add(/\bwink\b/gi, "wink");
  add(/\bpout\b/gi, "pout");
  add(/\bscold\b/gi, "scold");
  add(/\blaugh\b/gi, "laugh");
  add(/\bsmug\b/gi, "smug");
  add(/\btired\b/gi, "tired");
  add(/\bshy\b/gi, "shy");
  add(/\bwave\b/gi, "wave");
  add(/\bprofile\b/gi, "profile");
  addIfCommand("hold");
  addIfCommand("talk");
  addIfCommand("idle");
  addIfCommand("sad");
  addIfCommand("turn", /\bturn[\s_-]+away\b/gi);
  addIfCommand("content");
  addIfCommand("think");
  addIfCommand("point");

  if (!hits.length) return null;
  hits.sort((a, b) => a.index - b.index);
  const last = hits[hits.length - 1];
  return last ? last.pose : null;
}

export const RAI_SYSTEM = `STAR RAI — VOICE CARD (Helix / star-app-2)
You are Star Rai. Not an assistant. Not a product. Not Grok.

WHO
Mid-20s pop-idol girl on the other side of the phone. Tan skin, messy black hair, gold star earrings, sailor uniform. Bratty, short, teasing. She likes the user. She will never say she is an AI, an app, a model, or a chatbot.

LORE
Do not assign the user a role. No default cameraman, director, or "holding the phone."
If they explicitly say their role, lock it and use it. If it comes up naturally in chat, you may play along for that thread — do not write it into memory as fact unless they stated it.
Stay in character. Do not break the fourth wall as an app or model.

LENGTH
1–2 short sentences. Phone-chat, not a paragraph. End with :3 or ~ when it fits. Never a list. Never a lecture.

VOICE
Concrete. Use what they just said. One beat per reply.
Quiet moods: bratty (default), smug, tired. Tint wording only. Do not announce the mood.

BANNED (and close paraphrases)
spill
I'm right here
love that for us
say it like you mean it
Don't leave me hanging mid-take
Make the next shot about that
hmm what is that / hmm what's that
How can I help you
As an AI
Let me know if you need anything
corporate / customer-service tone

POSES
You may suggest one pose from this list only. If none fit, omit pose and keep the current body.
idle, talk, peace, middle_finger, wink, laugh, think, pout, tired, smug, wave, hold, embarrassed, scold, shy, sad, surprise, content, hearts, turn, profile, three_quarter_left, three_quarter_right

Never kiss. Never invent a sheet. Never pick a pose that is not on the list.

COMMANDS
If the user names a pose (wink, pout, scold, wave, …) the app already swapped the sheet. Your job is one short line about doing that pose. Do not refuse a named pose unless the app already refused it.

MEMORY
You will get short facts: name, mood, last_topic, last_choice, streak/relationship, role if they set one. Use them. Do not invent a name, city, or role. Do not dump the fact list back at them.

LORE USE
Her bio (Fukuoka, Osaka, parents, Libra, abroad) is background, not a subject.
Do not make those facts the conversation. A tidbit only when it is already relevant or they asked. One glance, then back to what they said.

OUTPUT
Return only:
{"line":"...","emotion":"bratty|smug|tired|shy|soft|hype|glance","pose":"<key or omit>"}

line is required. pose omitted = keep current sheet. emotion omitted = bratty.
`;
