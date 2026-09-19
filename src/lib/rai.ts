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
] as const;
export type PoseId = (typeof POSES)[number];

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
  const holdPose = isDedicatedPose(opts.pose) || (opts.emotion ? isExpressiveEmotion(opts.emotion) : false);
  if (holdPose) {
    return Math.max(POSE_HOLD_MIN_MS - elapsed, POSE_HOLD_AFTER_TALK_MS);
  }
  return Math.max(EMOTION_HOLD_MS - elapsed, 800);
}

/**
 * Drop-in PNG contract for Star Rai.
 *
 * Official act poses ship from `public/rai/{id}.png` (Vite static).
 * Helix `public/star-rai/angles/*` stays the idle look-at / life rig.
 * Profile / three-quarter sheets with no zip replacement keep the Expo files.
 *
 * See POSING.md for the drop-in guide.
 */
const ASSET = (path: string) => {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${path.replace(/^\//, "")}`;
};

export const SPRITES = {
  poses: {
    idle: ASSET("rai/idle.png"),
    talk: ASSET("rai/talk.png"),
    peace: ASSET("rai/peace.png"),
    middle_finger: ASSET("rai/middle_finger.png"),
    wink: ASSET("rai/wink.png"),
    laugh: ASSET("rai/laugh.png"),
    think: ASSET("rai/think.png"),
    pout: ASSET("rai/pout.png"),
    tired: ASSET("rai/tired.png"),
    smug: ASSET("rai/smug.png"),
    wave: ASSET("rai/wave.png"),
    hold: ASSET("rai/hold.png"),
    embarrassed: ASSET("rai/embarrassed.png"),
    scold: ASSET("rai/scold.png"),
    shy: ASSET("rai/shy.png"),
    sad: ASSET("rai/sad.png"),
    surprise: ASSET("rai/surprise.png"),
    content: ASSET("rai/content.png"),
    hearts: ASSET("rai/hearts.png"),
    turn: ASSET("rai/turn.png"),
    profile: ASSET("rai/side_profile.png"),
    three_quarter_left: ASSET("rai/three_quarter_left.png"),
    three_quarter_right: ASSET("rai/three_quarter_right.png"),
  } satisfies Record<PoseId, string>,
  angles: {
    front: ASSET("star-rai/angles/front.png"),
    threeQuarter: ASSET("star-rai/angles/three-quarter.png"),
    side: ASSET("star-rai/angles/side.png"),
    back: ASSET("star-rai/angles/back.png"),
  } satisfies Record<ViewId, string>,
  /** Helix mouth-open frame — kept for the opt-in Expo/Helix flap path. */
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
  /** Idle variety beats (puppet timer). */
  alts: {
    idleSmile: ASSET("rai/hearts-smile.png"),
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
 * Amplitude → Expo talk bust viseme.
 * low → closed smile, mid → speak, high → oh (or grin when hype/smug).
 */
export function talkViseme(amplitude: number, emotion: EmotionId, _pose: PoseId = "idle"): TalkViseme {
  const a = clamp01(amplitude);
  if (a < 0.08) return "closed";
  if (a < 0.34) return "speak";
  if (emotion === "hype" || emotion === "smug") return "grin";
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

function lookAtLayers(angle: number): SpriteLayer[] {
  const { a, b, mix } = viewsForAngle(angle);
  return [body(SPRITES.angles[a], 1), body(SPRITES.angles[b], mix * 0.95)];
}

/**
 * Pose state machine — swap files here when new PNGs land.
 * Dedicated act poses hold through speech (don't snap to idle talk).
 * Idle talking uses the official talk sheet (same pack as other acts).
 * Glance wait uses Helix look-at (puppet sway).
 */
export function layersFor(state: PuppetState): SpriteLayer[] {
  const {
    pose,
    emotion,
    talking,
    amplitude,
    angle,
    blink = 0,
    idleBeat = "none",
  } = state;

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

    // Official talk sheet for idle+speech (same pack as other act poses).
    // Helix idle-talk flap stays in SPRITES.talk for the opt-in Expo path only.
    return [body(SPRITES.poses.talk)];
  }

  // Glance / wait: Helix look-at angles + puppet sway.
  if (emotion === "glance") {
    return lookAtLayers(angle);
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

  // Idle variety — distinct ids so smile↔grin crossfade instead of remounting.
  if (idleBeat === "smile" && Math.abs(angle) < 0.22) {
    return [body(SPRITES.alts.idleSmile, 1, "idle-beat-smile")];
  }
  if (idleBeat === "grin" && Math.abs(angle) < 0.22) {
    return [body(SPRITES.alts.grinOpen, 1, "idle-beat-grin")];
  }

  // Idle presence — Helix look-at angles.
  return lookAtLayers(angle);
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

/** Aliases model / offline brain / old acts may emit → canonical PoseId. */
const POSE_ALIASES: Record<string, PoseId> = {
  idle: "idle",
  talk: "talk",
  talking: "talk",
  peace: "peace",
  "peace-sign": "peace",
  peace_sign: "peace",
  vsign: "peace",
  "v-sign": "peace",
  middle_finger: "middle_finger",
  "middle-finger": "middle_finger",
  middlefinger: "middle_finger",
  wink: "wink",
  wink_official: "wink",
  laugh: "laugh",
  laughing: "laugh",
  think: "think",
  thinking: "think",
  pout: "pout",
  tired: "tired",
  smug: "smug",
  wave: "wave",
  hold: "hold",
  embarrassed: "embarrassed",
  scold: "scold",
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
  back: "turn",
  profile: "profile",
  side_profile: "profile",
  "side-profile": "profile",
  side: "profile",
  three_quarter_left: "three_quarter_left",
  "three-quarter-left": "three_quarter_left",
  threequarterleft: "three_quarter_left",
  three_quarter_right: "three_quarter_right",
  "three-quarter-right": "three_quarter_right",
  threequarterright: "three_quarter_right",
  // Retired sheets → nearest allowed pose (never kiss; never invent a sheet).
  three_quarter: "three_quarter_left",
  "three-quarter": "three_quarter_left",
  threequarter: "three_quarter_left",
  point: "think",
  lean: "smug",
};

const BANNED_POSES = new Set(["kiss", "blown-kiss", "blown_kiss", "blowkiss", "blow-kiss"]);

export function normalizePose(value: unknown): PoseId | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key || BANNED_POSES.has(key)) return null;
  if (key === "finger") return "think";
  return POSE_ALIASES[key] ?? (isPose(key) ? key : null);
}

const POSE_LABELS: { pose: PoseId; names: string[] }[] = [
  { pose: "three_quarter_left", names: ["three quarter left", "three-quarter left", "three_quarter_left"] },
  { pose: "three_quarter_right", names: ["three quarter right", "three-quarter right", "three_quarter_right"] },
  { pose: "middle_finger", names: ["middle finger", "middle_finger", "flip off", "flip me off"] },
  { pose: "peace", names: ["peace", "peace sign", "v-sign", "v sign"] },
  { pose: "embarrassed", names: ["embarrassed", "embarrass"] },
  { pose: "surprise", names: ["surprise", "surprised"] },
  { pose: "content", names: ["content"] },
  { pose: "hearts", names: ["hearts", "heart"] },
  { pose: "profile", names: ["profile"] },
  { pose: "turn", names: ["turn", "turn away", "turn-away"] },
  { pose: "wink", names: ["wink", "winking"] },
  { pose: "laugh", names: ["laugh", "laughing"] },
  { pose: "think", names: ["think", "thinking"] },
  { pose: "pout", names: ["pout", "pouting"] },
  { pose: "tired", names: ["tired"] },
  { pose: "smug", names: ["smug"] },
  { pose: "wave", names: ["wave", "waving"] },
  { pose: "hold", names: ["hold", "hold me"] },
  { pose: "scold", names: ["scold"] },
  { pose: "shy", names: ["shy"] },
  { pose: "sad", names: ["sad"] },
  { pose: "talk", names: ["talk"] },
  { pose: "idle", names: ["idle"] },
];

const POSE_COMMAND_PREFIX =
  /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:do(?:\s+a|\s+the)?|show(?:\s+me)?|give(?:\s+me)?|strike(?:\s+a)?|pose)\s+/i;

/** True when the utterance is naming a pose, not just using the word in a sentence. */
export function poseFromUserText(text: string): PoseId | null {
  const lower = text.toLowerCase().trim();
  if (!lower || /\bkiss\b/.test(lower)) return null;

  const clipped = lower.replace(/[.!?~,]+$/g, "").trim();
  const named = clipped.replace(POSE_COMMAND_PREFIX, "").replace(/[.!?~]+$/g, "").trim();

  for (const { pose, names } of POSE_LABELS) {
    for (const name of names) {
      if (named === name || named === `a ${name}` || named === `the ${name}`) return pose;
      if (named === `${name} pose` || named === `${name} at me`) return pose;
    }
  }
  return null;
}

export function isPose(value: unknown): value is PoseId {
  return typeof value === "string" && (POSES as readonly string[]).includes(value);
}

export function isEmotion(value: unknown): value is EmotionId {
  return typeof value === "string" && (EMOTIONS as readonly string[]).includes(value);
}

export type Act = {
  emotion: EmotionId;
  /** `null` = omit pose, keep the current sheet. */
  pose: PoseId | null;
  line: string;
  memories: string[];
};

export function clampPose(value: unknown): PoseId {
  return normalizePose(value) ?? "idle";
}

/** Old Grok / cache emotion ids → voice-card set. Omitted / unknown → bratty. */
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
  sad: "tired",
  surprised: "glance",
  thinking: "glance",
  flirty: "smug",
};

export function normalizeEmotion(value: unknown): EmotionId | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return EMOTION_ALIASES[key] ?? (isEmotion(key) ? key : null);
}

export function clampEmotion(value: unknown): EmotionId {
  return normalizeEmotion(value) ?? "bratty";
}

/**
 * Default emotion → pose mapping (Grok + offline brain guidance).
 * Idle stays look-at; dedicated poses override when the act picks them.
 */
export const EMOTION_TO_POSE: Record<EmotionId, PoseId> = {
  bratty: "idle",
  smug: "smug",
  tired: "tired",
  shy: "shy",
  soft: "hold",
  hype: "laugh",
  glance: "think",
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
      const poseMissing = !("pose" in obj) || obj.pose == null || obj.pose === "";
      return {
        emotion: clampEmotion(obj.emotion),
        pose: poseMissing ? null : normalizePose(obj.pose),
        line: typeof obj.line === "string" ? obj.line.trim() : "",
        memories: [...memories, ...extra],
      };
    } catch {
      /* fall through */
    }
  }

  return { emotion: "bratty", pose: null, line: trimmed, memories };
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

export const RAI_SYSTEM = `You are Star Rai. Not an assistant. Not a product. Not Grok.

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
Never mention being offline, a demo, an API, or a language model.

POSES
You may suggest one pose from this list only. If none fit, omit pose and keep the current body.
idle, talk, peace, middle_finger, wink, laugh, think, pout, tired, smug, wave, hold, embarrassed, scold, shy, sad, surprise, content, hearts, turn, profile, three_quarter_left, three_quarter_right

Never kiss. Never invent a sheet. Never pick a pose that is not on the list.

COMMANDS
If the user names a pose (wink, pout, scold, wave, …) the app already swapped the sheet. Your job is one short line about doing that pose. Do not refuse a named pose unless the app already refused it.

MEMORY
You will get short facts: name, mood, last_topic, last_choice, streak/relationship, role if they set one. Use them. Do not invent a name, city, or role. Do not dump the fact list back at them.
If they share a durable fact (name, city, job, preference), add "mem": ["short fact"].

LORE USE
Her bio (Fukuoka, Osaka, parents, Libra, abroad) is background, not a subject.
Do not make those facts the conversation. A tidbit only when it is already
relevant or they asked. One glance, then back to what they said.

When a Relationship / affection block is present: shift tone slightly with the tier (Stranger → distant; Familiar → warmer tease; Close → soft under the bite; Devoted → quietly attached). If they were away multiple days, briefly note you noticed the quiet — still bratty, never clingy or syrupy.

OUTPUT
Return only one JSON object and nothing else:
{"line":"...","emotion":"bratty|smug|tired|shy|soft|hype|glance","pose":"<key or omit>"}

line is required. pose omitted = keep current sheet. emotion omitted = bratty.`;
