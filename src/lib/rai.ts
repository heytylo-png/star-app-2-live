import { POSE_CROSSFADE_MS, type IdleBlinkFrame, type IdleMouthFrame } from "./rai-motion.ts";
import { bridgeFiles } from "./pose-bridge.ts";

export { POSE_CROSSFADE_MS, type IdleBlinkFrame, type IdleMouthFrame };

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

/**
 * Idle rest + the live `talk` key share the same official full-body frame.
 * A user-named `talk` command still holds `talk_official`. Automatic spoken
 * lines stay on idle (SPOKEN_TALK_TO_IDLE) so the idle mouth can chew.
 * Wave/scold/shy/… hold their own sheet.
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
 * Rest blink is on.
 *
 * Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
 * One <img> / texture, hard cuts only: 02 → 03 → 04 → 03 → 02 in ~300ms
 * (do not skip 02), then hold 01. 01 is a byte copy of public/rai/idle.png.
 * 02–04 change lids only. Never a stack, never two PNGs, never a blend.
 */
export const IDLE_BLINK_ENABLED = true;

/**
 * Official PNG blink window: rest idle on the frown sheet.
 * Named poses, talk flap, and emotion-named sheets do not blink.
 * Blink is on — see IDLE_BLINK_ENABLED. Approved by TyLo on 2026-09-26
 * (807-referenced painted lids, pass 4b).
 */
export function canIdleBlink(state: {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  reducedMotion?: boolean;
}): boolean {
  if (!IDLE_BLINK_ENABLED) return false;
  if (state.reducedMotion) return false;
  if (state.talking) return false;
  if (isDedicatedPose(state.pose)) return false;
  if (isExpressiveEmotion(state.emotion)) return false;
  return true;
}

/**
 * Idle talking mouth is on.
 *
 * TyLo: "Wire it" (2026-09-27). While she speaks on the idle pose, the rest
 * <img> hard-cuts through the baked mouth sheets (idle_mouth_02–06; 01 closed
 * is the rest sheet itself). Same rule as the blink: one image, full sheets,
 * no crossfade, no stack, no mouth sticker, no face_* bust. Other poses and
 * mood sheets are untouched. talk_official.png is never a viseme.
 */
export const IDLE_MOUTH_ENABLED = true;

/**
 * Mouth window: a spoken line on the idle pose, no mood sheet pinned.
 * `talking` is real TTS. `lineLive` is a text line still streaming or inside
 * its chew window, so a reply with no audio still chews. Blink is paused
 * for this whole window.
 */
export function canIdleMouth(state: {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  /** Caption is streaming, or the text-only chew window is still open. */
  lineLive?: boolean;
  reducedMotion?: boolean;
}): boolean {
  if (!IDLE_MOUTH_ENABLED) return false;
  if (USE_EXPO_TALK_BUST) return false;
  if (!state.talking && !state.lineLive) return false;
  if (state.reducedMotion) return false;
  if (isDedicatedPose(state.pose)) return false;
  if (isExpressiveEmotion(state.emotion)) return false;
  return true;
}

/** Text-only chew: long enough for 01 → 02 → 03 → 02 → 01, not a stuck mouth. */
export const TEXT_CHEW_MS_PER_CHAR = 55;
export const TEXT_CHEW_MIN_MS = 600;
export const TEXT_CHEW_MAX_MS = 3000;

/** Minimum time the idle mouth stays up for a line that has no TTS audio. */
export function textChewMs(line: string): number {
  const chars = line.trim().length;
  if (chars <= 0) return 0;
  const raw = chars * TEXT_CHEW_MS_PER_CHAR;
  return Math.min(TEXT_CHEW_MAX_MS, Math.max(TEXT_CHEW_MIN_MS, raw));
}

/** Absolute deadline for that minimum, from the moment the line first appeared. */
export function textChewDeadline(startedAt: number, line: string): number {
  const ms = textChewMs(line);
  if (!ms || !startedAt) return 0;
  return startedAt + ms;
}

export type TextChewArm = {
  /** When the caption first appeared. 0 means this line has not armed yet. */
  start: number;
  /** Absolute deadline. 0 means the window is closed. */
  until: number;
};

/**
 * Arm or extend a text chew from the original start.
 * A chunk that arrives after the window has closed must not pick a new start.
 */
export function armTextChewState(prev: TextChewArm, line: string, now: number): TextChewArm {
  if (!textChewMs(line)) return prev;
  const start = prev.start || now;
  return { start, until: textChewDeadline(start, line) };
}

/** Deadline reached. Drop `until` and keep `start` so the next chunk cannot re-arm. */
export function expireTextChew(prev: TextChewArm, now: number): TextChewArm {
  if (prev.until && now >= prev.until) return { start: prev.start, until: 0 };
  return prev;
}

/**
 * The chew deadline holds the idle-return timer only while this pose can
 * actually run the idle mouth. Named poses and mood sheets use main's timing.
 */
export function chewHoldsIdleReturn(opts: {
  pose: PoseId;
  emotion: EmotionId;
  chewUntil: number;
  now: number;
  reducedMotion?: boolean;
}): boolean {
  if (!(opts.chewUntil > opts.now)) return false;
  return canIdleMouth({
    pose: opts.pose,
    emotion: opts.emotion,
    talking: false,
    lineLive: true,
    reducedMotion: opts.reducedMotion,
  });
}

/**
 * True while a reply should drive the idle mouth.
 * Streaming or TTS keeps it open. After the text lands with no audio, the
 * chew deadline (55 ms/char, 0.6–3 s) keeps a short line through one cycle.
 */
export function idleMouthLineLive(opts: {
  caption: string;
  sending: boolean;
  talking: boolean;
  now: number;
  chewUntil: number;
}): boolean {
  if (!opts.caption.trim()) return false;
  if (opts.sending || opts.talking) return true;
  return opts.chewUntil > opts.now;
}

/**
 * Delay before easing back to idle after an act. `null` = do not reset
 * (still speaking).
 *
 * The talk/mood sheet stays on the line she is saying. Once that line is
 * over, the next rest is a few seconds — not the life of the transcript
 * row. Dedicated poses hold at least POSE_HOLD_MIN_MS from landing, and
 * at least POSE_HOLD_AFTER_TALK_MS after speech ends, then idle.png.
 * Rest blink is on (IDLE_BLINK_ENABLED). Approved by TyLo on 2026-09-26
 * (807-referenced painted lids, pass 4b).
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

/** Reading pace for a line on screen: about 22 characters a second, a fast reader. */
export const SMUG_READ_MS_PER_CHAR = 45;
/** Quiet tail after the beat (speech and reading) is over, before smug lets go. */
export const SMUG_BEAT_TAIL_MS = 1500;

/** The smug sheet is up: the pose, or idle carrying the smug emotion. */
export function holdsSmugBeat(pose: PoseId, emotion: EmotionId): boolean {
  return pose === "smug" || (pose === "idle" && emotion === "smug");
}

/**
 * Smug lasts until its beat is over, and the beat belongs to the LINE, not to
 * the pose: it runs from the moment the line lands (is the current bubble) for
 * its reading time (45 ms a character, never under the 3.4 s minimum) or until
 * speech ends, whichever is later, plus a 1.5 s tail. The pose resolving
 * earlier (a tag at ~1.5 s, the line at ~6 s) starts nothing: the clock is the
 * line's landing. No landing yet (`lineLandedAt` 0) counts from now, so a timer
 * can never be armed against a line that is not on screen. Returns ms from now.
 * Other poses keep their normal timing (callers only use this for holdsSmugBeat).
 */
export function smugBeatResetDelayMs(opts: {
  line: string;
  /** When the line became the current bubble; 0 when it has not landed. */
  lineLandedAt: number;
  /** When speech ended; 0 when the line was not voiced. */
  speechEndedAt: number;
  now?: number;
}): number {
  const now = opts.now ?? Date.now();
  const landed = opts.lineLandedAt || now;
  const readEnd = landed + Math.max(POSE_HOLD_MIN_MS, opts.line.trim().length * SMUG_READ_MS_PER_CHAR);
  const beatEnd = Math.max(readEnd, opts.speechEndedAt || 0) + SMUG_BEAT_TAIL_MS;
  return Math.max(0, beatEnd - now);
}

/** What the stage is doing with the smug beat (puppet `data-rai-pose-phase`). */
export type PosePhase = "idle" | "bridge-in" | "hold" | "bridge-out";

/** Once the hip is up it stays at least this long before the beat may release it (a late decode never flashes it). */
export const SMUG_MIN_VISIBLE_HOLD_MS = 1500;
/** Longest the release waits for the stage to show the hip at all (frames still decoding). Matches BRIDGE_WAIT_MAX_MS. */
export const SMUG_RELEASE_WAIT_CAP_MS = 30_000;

/**
 * The beat timer fired: may smug go back to idle now? 0 = yes. Otherwise ms to
 * wait and ask again. The hip has to have actually been on stage for a visible
 * hold: entry still playing, or the frames not decoded yet (stage still on idle),
 * both wait, up to the cap. The exit's own bridge never waits.
 */
export function smugReleaseWaitMs(opts: {
  phase: PosePhase;
  /** When the stage reached `hold` (0 if it has not). */
  holdSince: number;
  /** How long this release has already waited. */
  waitedMs: number;
  now?: number;
}): number {
  if (opts.waitedMs >= SMUG_RELEASE_WAIT_CAP_MS) return 0;
  const now = opts.now ?? Date.now();
  if (opts.phase === "bridge-out") return 0;
  if (opts.phase === "hold") {
    const shown = opts.holdSince ? now - opts.holdSince : 0;
    return Math.max(0, SMUG_MIN_VISIBLE_HOLD_MS - shown);
  }
  return 150;
}

/**
 * Settle delay for the pose just put on a spoken bubble.
 *
 * While `captionLive` is set, that reply is still being said — do not snap
 * to frown idle under it. A transcript caption that remains after she
 * finishes is not live; callers pass `captionLive: false` then so a mood
 * sheet cannot freeze as the standing face. Music Set (`track_change` +
 * talk | content | smug) stays too, even if the caller forgets the caption flag.
 *
 * The next rest is official idle.png (front idle, framing C; blink 01 is a
 * byte copy). Blink is on. Approved by TyLo on 2026-09-26 (807-referenced
 * painted lids, pass 4b).
 */
export function spokenBubbleResetDelay(opts: {
  pose: PoseId;
  emotion?: EmotionId;
  talking: boolean;
  actLandedAt: number;
  now?: number;
  lifeKind?: string | null;
  /** Caption is still the reply on stage. Idle is the next rest, not this line. */
  captionLive?: boolean;
}): number | null {
  if (opts.captionLive) return null;
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
 * Standing face after a spoken bubble's rest timer.
 * Official front idle (idle.png, framing C). Never think, and never a mood sheet.
 */
export function settledRestPose(): PoseId {
  return "idle";
}

/**
 * Standing face once a smug or wink line is over.
 * Official idle (blink 01, the frown rest) so the blink can run and a text
 * line can chew. The idle↔smug bridge is only the transition the puppet
 * plays when this commit leaves the smug sheet — bridge frames are not a rest.
 *
 * Idle plus the smug emotion still paints smug_hold (hand on hip + smirk; see layersFor), so
 * that sheet counts too. Every other pose keeps its normal hold.
 * Call this only after she has stopped speaking.
 */
export function lineEndedRestPose(opts: {
  pose: PoseId;
  emotion: EmotionId;
}): { pose: PoseId; emotion: EmotionId } | null {
  const onSmug = opts.pose === "smug" || (opts.pose === "idle" && opts.emotion === "smug");
  const onWink = opts.pose === "wink";
  if (!onSmug && !onWink) return null;
  return { pose: settledRestPose(), emotion: DEFAULT_EMOTION };
}

/**
 * Milliseconds a finished smug or wink line waits before official idle.
 * Voiced lines snap when speech ends (0). Text-only lines wait out the chew
 * window and the normal pose hold, so the sheet can paint. Never the long
 * smug beat. Null when this pose is not a smug/wink rest.
 */
export function smugWinkTextRestDelayMs(opts: {
  voiced: boolean;
  chewUntil: number;
  pose: PoseId;
  emotion: EmotionId;
  actLandedAt: number;
  now?: number;
}): number | null {
  if (!lineEndedRestPose({ pose: opts.pose, emotion: opts.emotion })) return null;
  if (opts.voiced) return 0;
  const now = opts.now ?? Date.now();
  const chewLeft = Math.max(0, opts.chewUntil - now);
  const poseHold =
    poseResetDelayMs({
      pose: opts.pose,
      emotion: opts.emotion,
      talking: false,
      actLandedAt: opts.actLandedAt,
      now,
    }) ?? 0;
  return Math.max(chewLeft, poseHold);
}

/**
 * Composer Stop square. True only while she is speaking.
 * Thinking, idle, and a bubble that is merely still on screen do not show it.
 */
export function composerShowsStop(talking: boolean): boolean {
  return talking;
}

/** Send while idle, Cancel while a reply is in flight, Stop while she is speaking. */
export function composerActionLabel(opts: {
  talking: boolean;
  sending: boolean;
}): "Send" | "Cancel" | "Stop" {
  if (composerShowsStop(opts.talking)) return "Stop";
  if (opts.sending) return "Cancel";
  return "Send";
}

/** Submit, Enter, and the button abort the in-flight turn. The draft stays. */
export function composerCancelsTurn(opts: { talking: boolean; sending: boolean }): boolean {
  return opts.talking || opts.sending;
}

/**
 * Sheet after the line ends (stream, TTS, or the text chew window).
 * A greeting must not leave wink or talk_official up. A user-named pose, or
 * an explicit reply tag that is not a greeting wink/talk, keeps its sheet.
 * Mouth frame 01 is the closed rest sheet (`idleMouthFrameSrc(1)`).
 */
export function restAfterSpokenLine(opts: {
  pose: PoseId;
  line: string;
  namedPose?: PoseId | false | null;
  replyPose?: PoseId | null;
}): PoseId {
  if (opts.namedPose) return opts.pose;
  const reply = opts.replyPose;
  const greetingWinkOrTalk =
    isGreetingSpokenLine(opts.line) && (reply === "wink" || reply === "talk");
  if (reply && reply !== "idle" && reply !== "talk" && !greetingWinkOrTalk) return opts.pose;
  return settledRestPose();
}

/**
 * A finished line (stream, TTS, or the text chew window) must not leave
 * wink_official or talk_official up when that sheet was only a greeting
 * inference. Named poses and an explicit non-greeting wink tag keep holding.
 * The closed mouth is frame 01 (`idleMouthFrameSrc(1)`), the idle rest sheet.
 */
export function snapGreetingSheet(opts: {
  pose: PoseId;
  line: string;
  namedPose?: PoseId | false | null;
  replyPose?: PoseId | null;
}): boolean {
  if (opts.pose !== "wink" && opts.pose !== "talk") return false;
  return restAfterSpokenLine(opts) === "idle";
}

/**
 * Sheets that ship as true RGBA (cut offline by scripts/cut-alpha.py: enclosed
 * white pockets removed, soft decontaminated edge). The runtime studio-white
 * punch must not run on these; it would only re-fringe them.
 */
export const PRE_CUT_ALPHA_FILES = [
  "rai/idle.png",
  "rai/idle_blink_01_open.png",
  "rai/idle_blink_02_closing.png",
  "rai/idle_blink_03_half.png",
  "rai/idle_blink_04_closed.png",
  "rai/idle_mouth_02_small.png",
  "rai/idle_mouth_03_open.png",
  "rai/idle_mouth_04_oo.png",
  "rai/idle_mouth_05_wide.png",
  "rai/idle_mouth_06_smirk.png",
  // Official pose sheets (own canvases, not the 1008×1792 idle canvas). Offline
  // white-matte cuts: no gAMA/cHRM/iCCP, so they render their raw pixels.
  "rai/shy_official.png",
  "rai/wink_official.png",
  "rai/laugh_official.png",
  "rai/surprise_official.png",
  "rai/smug_official.png",
  "rai/smug_hold.png",
  "rai/content_official.png",
  "rai/sad_official.png",
  "rai/heart_official.png",
  "rai/hold_official.png",
  "rai/talk_official.png",
  "rai/think_official.png",
  "rai/embarrassed_official.png",
  "rai/pout_official.png",
  "rai/middle_finger.png",
  "rai/scold_official.png",
  "rai/tired_official.png",
  "rai/peace.png",
  "rai/side_profile.png",
  "rai/three_quarter_left.png",
  "rai/three_quarter_right.png",
  // Pose-bridge in-betweens (idle <-> smug). Offline cuts, same method as the sheets above.
  "rai/bridge_idle_smug_01.png",
  "rai/bridge_idle_smug_02.png",
  "rai/bridge_idle_smug_03.png",
  "rai/bridge_idle_smug_04.png",
  "rai/bridge_idle_smug_05.png",
  "rai/bridge_idle_smug_06.png",
] as const;

/**
 * Cache key for the pre-cut sheets. The service worker serves same-origin PNGs cache-first, so a
 * returning phone would get the old RGB-on-white file under the bare URL for one visit. Bump this
 * whenever scripts/cut-alpha.py output changes.
 */
export const PRE_CUT_ALPHA_VERSION = "rgba3";

/** False for pre-cut RGBA sheets; true for the RGB-on-white sheets that still need punch-white. */
export function spriteNeedsWhitePunch(src: string): boolean {
  const path = src.split(/[?#]/)[0] ?? src;
  return !PRE_CUT_ALPHA_FILES.some((file) => path === file || path.endsWith(`/${file}`));
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
  const file = path.replace(/^\//, "");
  const preCut = (PRE_CUT_ALPHA_FILES as readonly string[]).includes(file);
  return preCut ? `${prefix}${file}?v=${PRE_CUT_ALPHA_VERSION}` : `${prefix}${file}`;
};

/** Stage src for a pose-bridge frame file (pre-cut, so it carries the cache key). */
export function bridgeFrameSrc(file: string): string {
  return ASSET(file);
}

/** Stage src for a hip-clip frame file (public/rai/hip/*.webp). */
export function hipClipSrc(file: string): string {
  return ASSET(file);
}

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
  smug: "rai/smug_hold.png",
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
   * Baked full-frame rest blink. Byte copies of
   * artifacts/star-rai-blink-frames/baked/. Each file is 1008×1792 on the
   * idle.png canvas (eyes only). 01 open is the idle.png file itself.
   * Mounted while blink is on. Rest holds 01 between cycles.
   * One <img>, hard cuts 02 → 03 → 04 → 03 → 02 in ~300ms,
   * then hold 01. Never a stack, never two PNGs, never a blend.
   * Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
   */
  idleBlinkOpen: ASSET("rai/idle_blink_01_open.png"),
  idleBlinkClosing: ASSET("rai/idle_blink_02_closing.png"),
  idleBlinkHalf: ASSET("rai/idle_blink_03_half.png"),
  idleBlinkClosed: ASSET("rai/idle_blink_04_closed.png"),
  /**
   * Baked idle talking mouth. Byte copies of
   * artifacts/star-rai-blink-frames/baked/idle_mouth_*.png, 1008×1792 RGBA on
   * the idle.png canvas (mouth only). 01 closed is the rest sheet (byte copy
   * of idle.png), so it reuses the blink 01 URL. Hard cuts on the one rest
   * <img> while IDLE_MOUTH_ENABLED.
   */
  idleMouth: {
    closed: ASSET("rai/idle_blink_01_open.png"),
    small: ASSET("rai/idle_mouth_02_small.png"),
    open: ASSET("rai/idle_mouth_03_open.png"),
    oo: ASSET("rai/idle_mouth_04_oo.png"),
    wide: ASSET("rai/idle_mouth_05_wide.png"),
    smirk: ASSET("rai/idle_mouth_06_smirk.png"),
  },
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

/** Baked blink frames and idle.png share this pixel size. */
export const IDLE_FRAME_SIZE = { width: 1008, height: 1792 } as const;

/**
 * Stable layer id for rest idle. Blink steps change `src` only, so the
 * puppet keeps one `<img>` and does not crossfade a second figure.
 */
export const IDLE_REST_LAYER_ID = "body:idle";

/**
 * Retired blink assets that must never mount.
 * Old full plates, L/R oval crops, the eyes pack, and the hole-patch names.
 * The baked full frames (01 open / 02 closing / 03 half / 04 closed) are not in this set.
 */
export function isRetiredBlinkSrc(src: string): boolean {
  return (
    /\/idle_blink(?:_0[12])?\.png(?:\?|$)/.test(src) ||
    /\/idle_blink_(?:open|0[12])_[lr]\.png(?:\?|$)/.test(src) ||
    /\/idle_blink_[lr]\.png(?:\?|$)/.test(src) ||
    /idle_blink_open_brow/.test(src) ||
    /idle_blink_02_open/.test(src) ||
    /star-rai-blink-frames\/eyes\//.test(src) ||
    /star-rai-blink-frames\/tylo-holes/.test(src) ||
    /01-open-brow/.test(src) ||
    /blink-0[23][^\s"'?#]*\.jpe?g(?:\?|#|$)/i.test(src) ||
    /\/blink-frames\/.+\.jpe?g(?:\?|#|$)/i.test(src)
  );
}

/**
 * Full frame for one rest-blink step.
 * 0 rest and 1 are both 01 open (byte copy of idle.png).
 * 2 = 02 closing, 3 = 03 half, 4 = 04 closed.
 * The pass is 02 → 03 → 04 → 03 → 02, then hold 01. Do not skip 02.
 * Live while IDLE_BLINK_ENABLED is true. Hard cut only.
 * Never an opacity blend of two of these sheets.
 * Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
 */
export function idleBlinkFrameSrc(blink: number): string {
  if (blink === 2) return SPRITES.idleBlinkClosing;
  if (blink === 3) return SPRITES.idleBlinkHalf;
  if (blink === 4) return SPRITES.idleBlinkClosed;
  return SPRITES.idleBlinkOpen;
}

/**
 * Full frame for one idle-mouth step. 0 and 1 are 01 closed (the rest sheet).
 * 2 small, 3 open, 4 oo, 5 wide, 6 smirk. Hard cut only.
 */
export function idleMouthFrameSrc(mouth: number): string {
  if (mouth === 2) return SPRITES.idleMouth.small;
  if (mouth === 3) return SPRITES.idleMouth.open;
  if (mouth === 4) return SPRITES.idleMouth.oo;
  if (mouth === 5) return SPRITES.idleMouth.wide;
  if (mouth === 6) return SPRITES.idleMouth.smirk;
  return idleRestSrc();
}

/** The five mouth sheets that are not the rest sheet (02 → 06). */
export function idleMouthFrameUrls(): string[] {
  return [2, 3, 4, 5, 6].map((frame) => idleMouthFrameSrc(frame));
}

/** Rest body. 01 open (byte copy of idle.png) while blink is on. */
export function idleRestSrc(): string {
  return IDLE_BLINK_ENABLED ? SPRITES.idleBlinkOpen : SPRITES.poses.idle;
}

/** The four unique baked frames, in forward order. */
export function idleBlinkFrameUrls(): string[] {
  return [1, 2, 3, 4].map((frame) => idleBlinkFrameSrc(frame));
}

/**
 * Critical path. idle.png, then blink 01 → 04 in the baked order, then the
 * idle mouth 02 → 06 (decoded before the first line can use them).
 * 01 stays after idle.png even though it is a byte copy: the rest layer
 * mounts that URL, and the blink timer waits on all four.
 */
export function startupSpriteUrls(): string[] {
  return [
    SPRITES.poses.idle,
    ...idleBlinkFrameUrls(),
    ...(IDLE_MOUTH_ENABLED ? idleMouthFrameUrls() : []),
  ];
}

/** The seven sheets of the idle <-> smug beat: bridge 01..06, then the smug hold. */
export function smugBeatSheetUrls(): string[] {
  return [...bridgeFiles().map(bridgeFrameSrc), SPRITES.poses.smug];
}

/**
 * Where the stage's first decodes go. idle.png first (the stage cannot paint
 * without it), then the whole smug beat (bridge 01..06 + smug_hold, a
 * named Smug can arrive any moment and has to land on a decoded arm), then the
 * rest of the startup set (blink, mouth). Everything else stays deferred.
 */
export function stagePreloadOrder(opts?: { clip?: boolean }): { first: string; beat: string[]; rest: string[] } {
  const startup = startupSpriteUrls();
  // Clip entry + smug_hold; Helix 01..06 preloaded for the reverse exit (06→01).
  const beat = opts?.clip
    ? [SPRITES.poses.smug, ...bridgeFiles().map(bridgeFrameSrc)]
    : smugBeatSheetUrls();
  const first = startup[0]!;
  return { first, beat: beat.filter((u) => u !== first), rest: startup.slice(1).filter((u) => !beat.includes(u)) };
}

/** Lid pass 02–04. Open hold is 0 or 1. Deferred punches wait this out. */
export function blinkPassInFlight(frame: number): boolean {
  return frame >= 2;
}

/**
 * Pose sheet to fetch now. Startup idle/blink stay on the critical path.
 * Null when the requested sheets are already punched, so a sprite that
 * lands after the pose changed is not treated as the one to show.
 */
export function priorityPoseSrc(
  desired: readonly { src: string }[],
  ready: Readonly<Record<string, unknown>>,
  startup: readonly string[] = startupSpriteUrls(),
): string | null {
  const startupSet = new Set(startup);
  for (const layer of desired) {
    if (startupSet.has(layer.src)) continue;
    if (ready[layer.src] == null) return layer.src;
  }
  return null;
}

/**
 * Unready pose: keep the plates on stage, but the rest layer goes back to
 * the open frame so a mid-blink lid cannot freeze on screen.
 */
export function openRestFallback<T extends { id: string; src: string }>(
  plates: T[],
  openSrc: string,
): T[] {
  return plates.map((layer) =>
    layer.id === IDLE_REST_LAYER_ID ? { ...layer, src: openSrc } : layer,
  );
}

/**
 * Pose sheets the default PNG puppet can mount after first paint.
 * Live keys only (`SPRITES.poses`). Angle sheets, legacy idle-talk,
 * Expo busts, and unused Helix extras stay out — `layersFor` never
 * references them while `USE_EXPO_TALK_BUST` is off and angle is 0.
 */
export function deferredSpriteUrls(opts?: { skipBridge?: boolean }): string[] {
  const skip = new Set(startupSpriteUrls());
  const seen = new Set<string>();
  const urls: string[] = [];
  // Pose-bridge frames lead: six small pre-cut frames, decoded before any other
  // pose sheet, so smug can never be reachable with a frame still missing (a pair
  // with an undecoded frame can only hard-cut).
  for (const file of opts?.skipBridge ? [] : bridgeFiles()) {
    const src = bridgeFrameSrc(file);
    if (skip.has(src) || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
  }
  for (const src of Object.values(SPRITES.poses)) {
    if (skip.has(src) || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
  }
  return urls;
}

/**
 * Catalog URLs the default PNG path never requests.
 * Includes `star-rai/angles/*` (front, three-quarter, side, back).
 * Spine (`?spine=rai`) loads its own cutout pack and does not use these.
 */
export function unusedPngSpriteUrls(): string[] {
  const live = new Set([...startupSpriteUrls(), ...deferredSpriteUrls()]);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const src of [
    ...Object.values(SPRITES.angles),
    SPRITES.talk,
    ...Object.values(SPRITES.talkBust),
    ...Object.values(SPRITES.alts),
    ...Object.values(SPRITES.extras),
  ]) {
    if (live.has(src) || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
  }
  return urls;
}

/** Full SPRITES catalog. Preload uses startupSpriteUrls / deferredSpriteUrls. */
export function allSpriteUrls(): string[] {
  return [
    ...idleBlinkFrameUrls(),
    ...idleMouthFrameUrls(),
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
   * eyes is unused on the official pack (no second image over the body).
   */
  role: "body" | "talk" | "eyes";
  /** Unused on the official PNG pack. */
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
   * Rest blink frame. 0 and 1 are 01 open, 2 is 02 closing, 3 is 03 half,
   * 4 is 04 closed. The idle layer id stays put; only the full-frame src swaps.
   * Expo talk bust (flag on) still uses 1/2 with face_eyes_* while speaking.
   */
  blink?: IdleBlinkFrame;
  /**
   * Idle talking mouth frame (IDLE_MOUTH_ENABLED). Used only while talking on
   * the idle pose. 0/1 = 01 closed, 2 small, 3 open, 4 oo, 5 wide, 6 smirk.
   * Same stable layer id as rest; only the full-frame src swaps.
   */
  mouth?: IdleMouthFrame;
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
    mouth = 0,
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
    if (IDLE_MOUTH_ENABLED) {
      // Speaking on the idle pose: the rest <img> hard-cuts through the baked
      // mouth sheets. Blink is paused (0) for the line. Never talk_official.
      return [body(idleMouthFrameSrc(reducedMotion ? 1 : mouth), 1, IDLE_REST_LAYER_ID)];
    }
    // Spoken / talking never sits on frown idle. Hold the talk sheet.
    return [body(SPRITES.poses.talk)];
  }

  // One full frame. The layer id stays IDLE_REST_LAYER_ID so a blink
  // hard-swaps a single image and never stacks a second figure.
  // Blink is on: hard cuts through the lid pass, then hold 01. No dual-layer opacity.
  // Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
  void reducedMotion;
  if (!IDLE_BLINK_ENABLED) {
    return [body(SPRITES.poses.idle, 1, IDLE_REST_LAYER_ID)];
  }
  return [body(idleBlinkFrameSrc(blink), 1, IDLE_REST_LAYER_ID)];
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
  /** Explicit think emotion. Spoken pose is the chin-rest sheet, not a leftover. */
  think: "glance",
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
 * Bratty spoken lines stay on idle and talk with the idle mouth
 * (SPOKEN_TALK_TO_IDLE). Mood emotions still pin their own sheet.
 */
export const EMOTION_TO_POSE: Record<EmotionId, PoseId> = {
  bratty: "idle",
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

/**
 * Speech talks on the idle sheet. Approved by TyLo on 2026-09-27: every
 * automatic route that would put a spoken line on the `talk` key (bratty tint,
 * a model / local act `talk` key, Music Set / Chart / Life tints, clock lines,
 * the turn-start placeholder) lands on `idle` instead, so the idle mouth plays.
 * A user-named "talk" command still shows talk_official.png. The talk pose and
 * its sheet stay in the catalog.
 */
export const SPOKEN_TALK_TO_IDLE = true;

/** `talk` → `idle` for an automatically chosen spoken pose. Other keys pass through. */
export function routeSpokenTalk(pose: PoseId): PoseId {
  return SPOKEN_TALK_TO_IDLE && pose === "talk" ? "idle" : pose;
}

/** Short greeting openers only. A longer reply is a normal line. */
const GREETING_MAX_WORDS = 6;
const GREETING_MAX_CHARS = 40;
/** Must be the start of the line. Longer phrases before the single words. */
const GREETING_OPEN = /^(?:what'?s up|whats up|hi|hey|hello|yo|sup)\b/;
/**
 * A named-pose word keeps the normal pose path. "hi wink" is not a greeting.
 * Same bare words `namedPoseFromText` matches, plus the command names.
 */
const GREETING_POSE_WORD =
  /\b(?:wink|pout|scold|laugh|smug|tired|shy|wave|profile|peace|kiss(?:es)?|hearts?|embarrassed|surprise[d]?|point|middle[\s_-]*finger|finger[\s-](?:front|point)|hold|talk|idle|sad|content|think|turn[\s_-]+away)\b/;

/**
 * A short greeting opener is not a pose. The line must start with
 * hi / hey / hello / yo / sup / what's up, stay within about 6 words and
 * 40 characters, and not name a pose. "hi there" and "hey~ :3" count.
 * "hey, watch this, I can do a whole trick…" does not.
 */
export function isGreetingSpokenLine(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/:3/g, "")
    .replace(/[!~.?,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > GREETING_MAX_CHARS) return false;
  if (t.split(" ").length > GREETING_MAX_WORDS) return false;
  if (!GREETING_OPEN.test(t)) return false;
  if (GREETING_POSE_WORD.test(t)) return false;
  return true;
}

/** Pose placed on the stage when a new reply turn starts (before its act lands). */
export function spokenTurnStartPose(): PoseId {
  return routeSpokenTalk("talk");
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
  /**
   * Pose already on stage. A new spoken line does not inherit it.
   * Unmapped kiss may keep a dedicated body so kiss does not invent a sheet.
   */
  currentPose?: PoseId | null;
};

/**
 * Pose for a spoken bubble. Every new line resolves from scratch.
 *
 * 1. User-named pose command wins for this turn only (sheet already swapped).
 * 2. now_playing just set (Music Set), when the pose was omitted / idle / kiss
 *    or is the tint we stamped → talk | content | smug. A different live model
 *    key still falls through.
 * 3. Emotion tired tints to the tired sheet — never grin / peace / wave —
 *    unless step 2 already placed a Music Set sheet.
 * 4. Live model key (not idle / kiss) is used as-is. `think` only when that
 *    key, the emotion (think / thinking / glance), the user, or a Chart beat
 *    asks for it.
 * 5. Omitted / unknown / idle → context tint, else infer from emotion.
 *    A leftover think / pout / tired does not carry. Spoken fallback is talk
 *    (bratty), never chin-rest. Unmapped kiss keeps a dedicated current body.
 *    Never leave frown idle under a spoken line. Idle is the next rest.
 */
export function resolveSpokenPose(opts: ResolveSpokenPoseOpts): PoseId {
  if (opts.namedPose) return opts.namedPose;

  const seed = opts.seed?.trim() || opts.emotion;
  // A greeting line does not infer wink or talk. An explicit wink tag on any
  // other line still passes through below; a user-named wink already returned.
  const modelPose =
    isGreetingSpokenLine(seed) && (opts.modelPose === "wink" || opts.modelPose === "talk")
      ? null
      : opts.modelPose;

  // Music Set: omitted / idle / kiss, or the tint already on the act.
  // A different live key (wink, wave, …) is priority 2 and falls through.
  if (opts.nowPlayingJustSet) {
    const tint =
      opts.lifeTintPose && (NOW_PLAYING_TINT_POSES as readonly string[]).includes(opts.lifeTintPose)
        ? opts.lifeTintPose
        : null;
    if (tint && (needsPoseTint(modelPose) || modelPose === tint)) return routeSpokenTalk(tint);
    if (!tint && needsPoseTint(modelPose)) {
      return routeSpokenTalk(pickTint(NOW_PLAYING_TINT_POSES, seed));
    }
  }

  // Tired is a rest face. Model/context keys like talk/peace/wave land as grins.
  if (opts.emotion === "tired") return EMOTION_TO_POSE.tired;

  if (modelPose && isDedicatedPose(modelPose)) return routeSpokenTalk(modelPose);

  if (opts.chartBeat) {
    if (opts.chartTintPose && (CHART_BEAT_TINT_POSES as readonly string[]).includes(opts.chartTintPose)) {
      return routeSpokenTalk(opts.chartTintPose);
    }
    return routeSpokenTalk(pickTint(CHART_BEAT_TINT_POSES, seed));
  }

  // Kiss stays unmapped. Do not invent a sheet, and do not treat that as a
  // reason for the next spoken line to keep think / pout / tired.
  if (opts.namedPose === false && opts.currentPose && isDedicatedPose(opts.currentPose)) {
    return opts.currentPose;
  }

  if (opts.spoken === false) return settledRestPose();
  return routeSpokenTalk(inferEmotionPose(opts.emotion, seed));
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

/**
 * True once the JSON `"line"` value's closing quote is in the buffer.
 * A partial such as `"line":"hi ba` is still open, so a tag-first wink/talk
 * must not resolve yet. The quote is the whole wait — no extra hold after it.
 */
export function streamLineClosed(partial: string): boolean {
  const { text } = parseMemories(partial);
  const open = text.match(/"line"\s*:\s*"/);
  if (!open || open.index == null) return false;
  let i = open.index + open[0].length;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === '"') return true;
    i += 1;
  }
  return false;
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
 *
 * A model wink/talk tag is held until the line's closing quote arrives.
 * Partials ("h", "hi b") are not greetings, so applying that tag early flashes
 * wink_official. The full line then decides: a greeting stays idle and chews,
 * any other line tagged wink swaps on that same quote. Named poses are not held.
 */
export function streamSpokenAct(
  partial: string,
  opts: Omit<ResolveSpokenPoseOpts, "emotion" | "modelPose" | "spoken"> = {},
): { emotion: EmotionId; pose: PoseId } | null {
  const live = streamLine(partial);
  const hints = streamActHints(partial);
  if (!live && !hints.emotion && !hints.pose) return null;
  const emotion = hints.emotion ?? DEFAULT_EMOTION;
  const holdWinkOrTalk =
    !opts.namedPose &&
    !streamLineClosed(partial) &&
    (hints.pose === "wink" || hints.pose === "talk");
  return {
    emotion,
    pose: resolveSpokenPose({
      ...opts,
      namedPose: opts.namedPose,
      modelPose: holdWinkOrTalk ? null : (hints.pose ?? null),
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
  if (isGreetingSpokenLine(text)) return null;
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
