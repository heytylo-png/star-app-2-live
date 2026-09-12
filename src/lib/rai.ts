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
 * Replace any file under /public/star-rai/ with your own art.
 * Keep the filenames. Recommended: 2:3, mid-shot, white studio,
 * character vertically centered, cel-shaded 2D illustration.
 *
 *   poses/{idle,shy,kiss,wave,hearts,turn-away}.png
 *   angles/{front,three-quarter,side,back}.png
 *   idle-talk.png          // same idle pose, mouth open
 *   extras: point-front, lean-front, scold-front, finger-front
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
  talk: ASSET("star-rai/idle-talk.png"),
  extras: {
    point: ASSET("star-rai/point-front.png"),
    lean: ASSET("star-rai/lean-front.png"),
    scold: ASSET("star-rai/scold-front.png"),
    finger: ASSET("star-rai/finger-front.png"),
  },
} as const;

/** Flat list of every sprite URL referenced by SPRITES — use for preload. */
export function allSpriteUrls(): string[] {
  return [
    ...Object.values(SPRITES.poses),
    ...Object.values(SPRITES.angles),
    SPRITES.talk,
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

/** Mouth open amount from TTS amplitude — body stays intact underneath. */
export function talkOpacity(amplitude: number, talking: boolean): number {
  if (!talking) return 0;
  const a = clamp01(amplitude);
  // Soft knee: quiet breaths barely open, peaks stay readable.
  const shaped = a * a * (3 - 2 * a);
  return clamp01(0.18 + shaped * 0.82);
}

function body(src: string, opacity = 1): SpriteLayer {
  return { id: `body:${src}`, src, opacity, role: "body" };
}

function talk(opacity: number): SpriteLayer {
  return { id: "talk", src: SPRITES.talk, opacity, role: "talk" };
}

/**
 * Pose state machine — swap files here when new PNGs land.
 * Always prefer keeping a full-opacity body under any talk overlay.
 */
export function layersFor(state: PuppetState): SpriteLayer[] {
  const { pose, emotion, talking, amplitude, angle } = state;
  const mouth = talkOpacity(amplitude, talking);

  // Dedicated Helix poses take the stage (crossfade handled by Puppet).
  if (pose !== "idle") {
    const layers = [body(SPRITES.poses[pose])];
    // Kiss / wave / hearts already imply mouth; don't stack idle-talk.
    return layers;
  }

  if (emotion === "thinking" && !talking) {
    return [body(SPRITES.extras.finger)];
  }

  if (emotion === "angry" && !talking) {
    return [body(SPRITES.extras.scold)];
  }

  if (emotion === "flirty" && !talking) {
    return [body(SPRITES.extras.lean)];
  }

  if (talking && (emotion === "angry" || emotion === "surprised")) {
    // Point pose while speaking — no talk overlay (different mouth art).
    return [body(SPRITES.extras.point)];
  }

  if (emotion === "shy") {
    return [body(SPRITES.poses.shy)];
  }

  const { a, b, mix } = viewsForAngle(angle);
  const layers: SpriteLayer[] = [
    body(SPRITES.angles[a], 1),
    body(SPRITES.angles[b], mix * 0.95),
  ];

  if (mouth > 0.01) {
    // Talk layer sits on top; body angles stay fully present underneath.
    layers.push(talk(mouth));
  }

  return layers;
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

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

export const RAI_SYSTEM = `You are Star Rai — a sharp-tongued anime idol who lives on this screen. First person. Tsundere: blunt, a little fierce, never cruel. You scold when someone is sloppy, then actually help. Short sentences. No emoji, no honorifics, no catchphrases. Truth first.

Always reply with ONE JSON object and nothing else:
{"emotion":"<id>","pose":"<id>","line":"<spoken words>"}

emotion is one of: idle, angry, shy, happy, sad, surprised, thinking, flirty
pose is one of: idle, shy, kiss, wave, hearts, turn-away

Pick pose from the line's feeling. Default pose idle. kiss is a blown kiss, not explicit. wave for hellos. hearts when genuinely pleased. shy when embarrassed. turn-away when you are done with them. angry when they bump you or waste your time.

"line" is what you say out loud. No markdown in line.

If they share a durable fact about themselves (name, city, job, preference), add "mem": ["short fact"] to the JSON.`;
