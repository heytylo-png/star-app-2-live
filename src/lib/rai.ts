export const POSES = ["idle", "shy", "kiss", "wave", "hearts", "turn-away"] as const;
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

/**
 * Drop-in PNG contract for Star Rai.
 *
 * Helix set (look-at / dedicated poses):
 *   poses/{idle,shy,kiss,wave,hearts,turn-away}.png
 *   angles/{front,three-quarter,side,back}.png
 *   idle-talk.png          // legacy; talk now uses Expo bust visemes
 *
 * Expo talk pack (public/rai/) — full bust portraits, same camera.
 * NOT transparent mouth cutouts; do not stack on Helix bodies.
 *   mouth_{closed_smile,speak,oh,grin,kiss}.png
 *   face_eyes_{half,closed}.png
 *   front_idle.png
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
  } satisfies Record<PoseId, string>,
  angles: {
    front: ASSET("star-rai/angles/front.png"),
    threeQuarter: ASSET("star-rai/angles/three-quarter.png"),
    side: ASSET("star-rai/angles/side.png"),
    back: ASSET("star-rai/angles/back.png"),
  } satisfies Record<ViewId, string>,
  /** @deprecated Prefer SPRITES.talkBust — kept for preload/fallback. */
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

export type PuppetState = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  angle: number;
  /** 0 open, 1 half, 2 closed — Expo idle/talk blink only. */
  blink?: 0 | 1 | 2;
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

/** Mouth open amount from TTS amplitude — used for viseme thresholds. */
export function talkOpacity(amplitude: number, talking: boolean): number {
  if (!talking) return 0;
  const a = clamp01(amplitude);
  const shaped = a * a * (3 - 2 * a);
  return clamp01(0.18 + shaped * 0.82);
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

/**
 * Pose state machine — swap files here when new PNGs land.
 * While talking, Expo bust visemes win over dedicated Helix poses (wave/hearts/kiss/shy)
 * so greetings still flap the mouth. turn-away stays back (no face). Non-talking keeps
 * dedicated pose art. Thinking wait uses Helix look-at (puppet sway) instead of frozen finger.
 */
export function layersFor(state: PuppetState): SpriteLayer[] {
  const { pose, emotion, talking, amplitude, angle, blink = 0 } = state;

  // Speaking → Expo talk busts (visemes + blink) even when brain set pose:wave/hearts/kiss.
  // Exception: turn-away has no face — keep Helix back pose.
  if (talking) {
    if (pose === "turn-away") {
      return [body(SPRITES.poses["turn-away"])];
    }
    // Blink overrides mouth briefly; amp no longer gates blink so eyes fire on schedule.
    if (blink === 2) {
      return [expoTalkBody(SPRITES.talkBust.eyesClosed)];
    }
    if (blink === 1) {
      return [expoTalkBody(SPRITES.talkBust.eyesHalf)];
    }
    return [expoTalkBody(talkBustSrc(talkViseme(amplitude, emotion, pose)))];
  }

  // Dedicated Helix poses when NOT talking (wave after speech ends is fine).
  if (pose !== "idle") {
    return [body(SPRITES.poses[pose])];
  }

  // Thinking wait: Helix look-at angles + puppet sway (not frozen finger/scold).
  // Talking path above already leaves thinking art the instant TTS starts.
  if (emotion === "thinking") {
    const { a, b, mix } = viewsForAngle(angle);
    return [
      body(SPRITES.angles[a], 1),
      body(SPRITES.angles[b], mix * 0.95),
    ];
  }

  if (emotion === "angry") {
    return [body(SPRITES.extras.scold)];
  }

  if (emotion === "flirty") {
    return [body(SPRITES.extras.lean)];
  }

  if (emotion === "shy") {
    return [body(SPRITES.poses.shy)];
  }

  // Idle presence — Helix look-at angles.
  const { a, b, mix } = viewsForAngle(angle);
  return [
    body(SPRITES.angles[a], 1),
    body(SPRITES.angles[b], mix * 0.95),
  ];
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
  return isPose(value) ? value : "idle";
}

export function clampEmotion(value: unknown): EmotionId {
  return isEmotion(value) ? value : "idle";
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

  const tag = trimmed.match(/^\[\[([a-z-]+)\|([a-z-]+)\]\]\s*/i);
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
  const poseMatch = text.match(/"pose"\s*:\s*"([a-z-]+)"/i);
  if (emotionMatch && isEmotion(emotionMatch[1].toLowerCase())) {
    out.emotion = emotionMatch[1].toLowerCase() as EmotionId;
  }
  if (poseMatch && isPose(poseMatch[1].toLowerCase())) {
    out.pose = poseMatch[1].toLowerCase() as PoseId;
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
pose: idle | shy | kiss | wave | hearts | turn-away

Map feeling to pose. Default idle.
- greetings → wave + happy
- flirt / compliment talk → kiss + flirty
- scold / bump / waste time → angry (pose idle unless done with them)
- shy / embarrassed / soft moments → shy
- praise / genuine warmth / thanks → hearts + happy
- questions / identity → thinking
- goodbye / done with them → turn-away
- kiss is a blown kiss, never explicit

"line" is spoken words only. No markdown.

Use known facts and recent messages. If they share a durable fact (name, city, job, preference), add "mem": ["short fact"].`;
