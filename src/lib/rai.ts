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

export { POSE_CROSSFADE_MS } from "./rai-motion.ts";

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

/**
 * Idle rest + the live `talk` key share the same official full-body frame.
 * Spoken `talk` still holds `talk_official` through the line — frown idle is
 * rest-only (pose tint). Wave/scold/shy/… hold their own sheet.
 */
export function isTalkPathPose(pose: PoseId): boolean {
  return pose === "idle" || pose === "talk";
}

/** Emotions that pin a dedicated PNG even when pose is still idle. */
export function isExpressiveEmotion(emotion: EmotionId): boolean {
  return (
    emotion === "shy" ||
    emotion === "smug" ||
    emotion === "tired" ||
    emotion === "soft" ||
    emotion === "hype"
  );
}

/**
 * Official PNG blink window: rest idle on the frown sheet.
 * Named poses, talk flap, and emotion-named sheets do not blink.
 */
export function canIdleBlink(state: {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  reducedMotion?: boolean;
}): boolean {
  if (state.reducedMotion) return false;
  if (state.talking) return false;
  if (isDedicatedPose(state.pose)) return false;
  if (isExpressiveEmotion(state.emotion)) return false;
  return true;
}

/**
 * Delay before easing back to idle after an act. `null` = do not reset
 * (still speaking).
 *
 * The talk/mood sheet stays on the line she is saying. Once that line is
 * over, the next rest is a few seconds — not the life of the transcript
 * row. Dedicated poses hold at least POSE_HOLD_MIN_MS from landing, and
 * at least POSE_HOLD_AFTER_TALK_MS after speech ends, then idle.png so
 * rest blink can run.
 */
export function poseResetDelayMs(opts: {
  pose: PoseId;
  emotion?: EmotionId;
  talking: boolean;
  actLandedAt: number;
  now?: number;
  /**
   * Music Set reply is still the spoken bubble. Frown idle is the next rest,
   * not this line — even a minute after speech ends.
   */
  nowPlayingBubble?: boolean;
}): number | null {
  if (opts.talking) return null;
  if (opts.nowPlayingBubble) return null;
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
 * Settle delay for the pose just put on a spoken bubble.
 *
 * `lifeKind` is the Life turn that produced the line (`track_change` when
 * Music Set / now_playing just changed). A normal line still settles a few
 * seconds after speech. A Music Set line whose pose is talk | content | smug
 * stays on that bubble — idle.png is the next rest, not this reply.
 */
export function spokenBubbleResetDelay(opts: {
  pose: PoseId;
  emotion?: EmotionId;
  talking: boolean;
  actLandedAt: number;
  now?: number;
  lifeKind?: string | null;
}): number | null {
  const nowPlayingBubble =
    opts.lifeKind === "track_change" &&
    (NOW_PLAYING_TINT_POSES as readonly string[]).includes(opts.pose);
  return poseResetDelayMs({
    pose: opts.pose,
    emotion: opts.emotion,
    talking: opts.talking,
    actLandedAt: opts.actLandedAt,
    now: opts.now,
    nowPlayingBubble,
  });
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
  /** Shipping PNG-puppet wave: retoned full-body (TyLo dark sheet → idle/live cheek). */
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
  /**
   * Rest-idle lid crops — one file per eye hole, not full plates.
   * RGBA soft ellipses: 01 closing, 02 half, closed = official lids (hold).
   * Full-canvas 782/783 plates live at public/rai/idle_blink*.png and are not mounted.
   */
  idleBlink01L: ASSET("rai/idle_blink_01_l.png"),
  idleBlink01R: ASSET("rai/idle_blink_01_r.png"),
  idleBlink02L: ASSET("rai/idle_blink_02_l.png"),
  idleBlink02R: ASSET("rai/idle_blink_02_r.png"),
  idleBlinkL: ASSET("rai/idle_blink_l.png"),
  idleBlinkR: ASSET("rai/idle_blink_r.png"),
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

/**
 * Two eye holes on the 1008×1792 live idle canvas.
 * Soft RGBA ellipses composite here. Both holes are 80×40 so the right
 * rect stops before the ear. Bangs above y=202, ahoge, mouth, and collar
 * stay outside. Keep in sync with scripts/bake-idle-blink.py.
 */
export const IDLE_BLINK_EYE_HOLES = [
  { x: 432, y: 202, w: 80, h: 40 },
  { x: 508, y: 202, w: 80, h: 40 },
] as const;

/** Live idle canvas the holes are registered onto. */
export const IDLE_BLINK_CANVAS = { width: 1008, height: 1792 } as const;

/** Full-plate blink files. Never drawn. Eye crops are copied onto idle. */
export function isFullBlinkPlate(src: string): boolean {
  return /\/idle_blink(?:_0[12])?\.png(?:\?|$)/.test(src);
}

/**
 * Two eye-rect crops for rest blink. 1 closing, 2 half, ≥3 closed.
 * Null when open. Not the full-canvas plates.
 */
export function idleBlinkEyeSrcs(blink: number): readonly [string, string] | null {
  if (blink === 1) return [SPRITES.idleBlink01L, SPRITES.idleBlink01R];
  if (blink === 2) return [SPRITES.idleBlink02L, SPRITES.idleBlink02R];
  if (blink >= 3) return [SPRITES.idleBlinkL, SPRITES.idleBlinkR];
  return null;
}

export function idleBlinkEyeUrls(): string[] {
  return [1, 2, 3].flatMap((frame) => {
    const pair = idleBlinkEyeSrcs(frame);
    return pair ? [...pair] : [];
  });
}

/** Flat list of every sprite URL referenced by SPRITES — use for preload. */
export function allSpriteUrls(): string[] {
  return [
    ...idleBlinkEyeUrls(),
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
  /**
   * body = one full sheet. talk = viseme overlay.
   * eyes = one eye-rect crop (see `eye`). Never a second full plate.
   */
  role: "body" | "talk" | "eyes";
  /** Present only for role "eyes". Pixel rect on the 1008×1792 idle canvas. */
  eye?: { x: number; y: number; w: number; h: number };
};

/** When true, SPEAKING uses Expo bust visemes (zoomed crop). Default off. */
export const USE_EXPO_TALK_BUST = false;

export type PuppetState = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  angle: number;
  /** Seconds — drives official talk-sheet opacity flap (sin phase). */
  talkPhase?: number;
  /**
   * 0 open. Official rest blink: 1 closing, 2 half, 3 closed. The idle layer
   * list does not change — `idleBlinkEyeSrcs` is copied onto the live bitmap.
   * Expo talk bust (flag on) still uses 1/2 with face_eyes_* while speaking.
   */
  blink?: 0 | 1 | 2 | 3;
  /** Brief idle variety beat from puppet timer (smile/grin). Official pack ignores Expo alts. */
  idleBeat?: IdleBeat;
  /** Skip mouth flap; show a static talk sheet. */
  reducedMotion?: boolean;
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
 * Official talk-sheet opacity flap — time-driven so the mouth opens/closes
 * even when TTS amp is flat. Mixed with amp. Two oscillators (~1.8 Hz + ~1 Hz)
 * so it does not strobe. Range roughly 0.12–0.95 while speaking.
 */
export function talkFlapOpacity(talkPhase: number, amplitude: number, talking: boolean): number {
  if (!talking) return 0;
  const a = clamp01(amplitude);
  const osc = 0.5 + 0.5 * Math.sin(talkPhase * 11.5);
  const osc2 = 0.5 + 0.5 * Math.sin(talkPhase * 6.7 + 0.8);
  const flap = 0.12 + 0.88 * (osc * 0.72 + osc2 * 0.28);
  return clamp01(flap * (0.35 + 0.65 * Math.max(a, 0.5)));
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
 * Dedicated act poses (including the spoken `talk` key) hold their sheet
 * through speech. Frown idle is rest-only — never the body under a spoken
 * bubble or mid-line. Mood pins still apply when the pose key is still idle.
 * Expo mouth_* / face_eyes_* busts stay off — they are portrait crops and
 * would fight the long-shot pack. kiss is not a key — callers must keep the
 * current body.
 */
export function layersFor(state: PuppetState): SpriteLayer[] {
  const {
    pose,
    emotion,
    talking,
    amplitude,
    blink = 0,
    reducedMotion = false,
  } = state;

  // Dedicated act poses own the stage — hold talk/mood through the line.
  if (isDedicatedPose(pose)) {
    return [body(SPRITES.poses[pose])];
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
  if (emotion === "soft") {
    return [body(SPRITES.poses.content)];
  }
  if (emotion === "hype") {
    return [body(SPRITES.poses.peace)];
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
    // Spoken / talking never sits on frown idle. Hold the talk sheet.
    return [body(SPRITES.poses.talk)];
  }

  // Rest blink does not add a layer and does not swap this sheet. The mounted
  // idle bitmap stays up; the painter copies two eye rects onto it. A second
  // image, or drawing the rest of the blink plate, moves the body.
  void reducedMotion;
  void blink;
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
 * Emotion → pose when the act omitted / unknown / kiss (pose tint).
 * Idle is rest-only — bratty spoken lines use talk, not frown idle.
 */
export const EMOTION_TO_POSE: Record<EmotionId, PoseId> = {
  bratty: "talk",
  smug: "smug",
  tired: "tired",
  shy: "shy",
  soft: "content",
  hype: "peace",
  glance: "think",
};

/** now_playing just set (omitted / unknown / kiss). */
export const NOW_PLAYING_TINT_POSES = ["talk", "content", "smug"] as const satisfies readonly PoseId[];
/** Chart beat (omitted / unknown / kiss). Idle is rest-only — not in this set. */
export const CHART_BEAT_TINT_POSES = [
  "content",
  "think",
  "smug",
  "tired",
  "talk",
] as const satisfies readonly PoseId[];
export const HYPE_TINT_POSES = ["peace", "wave"] as const satisfies readonly PoseId[];

export type NowPlayingTintPose = (typeof NOW_PLAYING_TINT_POSES)[number];
export type ChartBeatTintPose = (typeof CHART_BEAT_TINT_POSES)[number];

function hashSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function pickTint<T>(list: readonly T[], seed: string): T {
  return list[hashSeed(seed) % list.length]!;
}

/** True when the act did not land a dedicated live sheet (omit / kiss / idle). */
export function needsPoseTint(pose: PoseId | null | undefined): boolean {
  return pose == null || pose === "idle";
}

export function inferEmotionPose(emotion: EmotionId, seed = ""): PoseId {
  if (emotion === "hype") return pickTint(HYPE_TINT_POSES, seed || "hype");
  return EMOTION_TO_POSE[emotion];
}

export type ResolveSpokenPoseOpts = {
  /** Local command path — wins even over a model key. `false` = kiss (unmapped). */
  namedPose?: PoseId | false | null;
  /** Live key from the model / local act. idle / null / kiss → infer. */
  modelPose?: PoseId | null;
  emotion: EmotionId;
  spoken?: boolean;
  nowPlayingJustSet?: boolean;
  chartBeat?: boolean;
  chartTintPose?: PoseId;
  lifeTintPose?: PoseId;
  seed?: string;
  /** Dedicated current body is kept until tint inference applies. */
  currentPose?: PoseId | null;
};

/**
 * Pose for a spoken bubble.
 *
 * 1. User-named pose command wins (sheet already swapped).
 * 2. now_playing just set (Music Set), when the pose was omitted / idle / kiss
 *    or is the tint we stamped → talk | content | smug. A different live model
 *    key still falls through.
 * 3. Emotion tired tints to the tired sheet — never grin / peace / wave —
 *    unless step 2 already placed a Music Set sheet.
 * 4. Live model key (not idle / kiss) is used as-is.
 * 5. Omitted / unknown / kiss / idle → context tint, else keep a dedicated
 *    current body, else infer from emotion. Never leave frown idle under
 *    a spoken line. Idle is the next rest, after that bubble.
 */
export function resolveSpokenPose(opts: ResolveSpokenPoseOpts): PoseId {
  if (opts.namedPose) return opts.namedPose;

  const seed = opts.seed?.trim() || opts.emotion;

  // Music Set: omitted / idle / kiss, or the tint already on the act.
  // A different live key (wink, wave, …) is priority 2 and falls through.
  if (opts.nowPlayingJustSet) {
    const tint =
      opts.lifeTintPose && (NOW_PLAYING_TINT_POSES as readonly string[]).includes(opts.lifeTintPose)
        ? opts.lifeTintPose
        : null;
    if (tint && (needsPoseTint(opts.modelPose) || opts.modelPose === tint)) return tint;
    if (!tint && needsPoseTint(opts.modelPose)) return pickTint(NOW_PLAYING_TINT_POSES, seed);
  }

  // Tired is a rest face. Model/context keys like talk/peace/wave land as grins.
  if (opts.emotion === "tired") return EMOTION_TO_POSE.tired;

  if (opts.modelPose && isDedicatedPose(opts.modelPose)) return opts.modelPose;

  if (opts.chartBeat) {
    if (opts.chartTintPose && (CHART_BEAT_TINT_POSES as readonly string[]).includes(opts.chartTintPose)) {
      return opts.chartTintPose;
    }
    return pickTint(CHART_BEAT_TINT_POSES, seed);
  }

  if (opts.currentPose && isDedicatedPose(opts.currentPose)) {
    return opts.currentPose;
  }

  if (opts.spoken === false) return "idle";
  return inferEmotionPose(opts.emotion, seed);
}

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

/** True when Grok (or any brain) returned a JSON act with a non-empty line. */
export function isValidActJson(raw: string): boolean {
  const slice = extractJsonObject(raw);
  if (!slice) return false;
  try {
    const obj = JSON.parse(slice) as { line?: unknown };
    return typeof obj.line === "string" && obj.line.trim().length > 0;
  } catch {
    return false;
  }
}

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

/**
 * Pose tint for a partially streamed spoken act.
 *
 * Voice-card JSON is `{"line","emotion","pose"}` — the spoken bubble can go
 * live before pose/emotion keys. Tint as soon as the line (or a hint) is
 * visible so frown idle never sits mid-line on that bubble.
 */
export function streamSpokenAct(
  partial: string,
  opts: Omit<ResolveSpokenPoseOpts, "emotion" | "modelPose" | "spoken"> = {},
): { emotion: EmotionId; pose: PoseId } | null {
  const live = streamLine(partial);
  const hints = streamActHints(partial);
  if (!live && !hints.emotion && !hints.pose) return null;
  const emotion = hints.emotion ?? DEFAULT_EMOTION;
  return {
    emotion,
    pose: resolveSpokenPose({
      ...opts,
      namedPose: opts.namedPose,
      modelPose: hints.pose ?? null,
      emotion,
      spoken: true,
      seed: opts.seed?.trim() || live,
    }),
  };
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

/** Voice card baked from artifacts/star-rai-voice-card.txt (sync script). */
export { RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";
