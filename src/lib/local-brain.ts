import { LOCAL_BRAIN_SOURCE } from "./generated/star-rai-artifacts.ts";
import {
  DEFAULT_EMOTION,
  namedPoseFromText,
  normalizeEmotion,
  normalizePose,
  type EmotionId,
  type PoseId,
} from "./rai.ts";

export type LocalBrainRow = {
  poseKey: string;
  emotion: EmotionId;
  line: string;
};

let lastLine = "";

/** Parse the pose-keyed local-brain table (comments and kiss keys skipped). */
export function parseLocalBrain(source: string = LOCAL_BRAIN_SOURCE): Map<string, LocalBrainRow[]> {
  const map = new Map<string, LocalBrainRow[]>();
  for (const raw of source.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("|");
    if (parts.length < 3) continue;
    const poseKey = (parts[0] ?? "").trim();
    const emotionRaw = (parts[1] ?? "").trim();
    const line = parts.slice(2).join("|").trim();
    if (!poseKey || !line) continue;
    const poseNorm = poseKey.toLowerCase();
    if (poseNorm === "kiss" || poseNorm === "kisses") continue;
    const emotion = normalizeEmotion(emotionRaw) ?? DEFAULT_EMOTION;
    const row: LocalBrainRow = { poseKey: poseNorm, emotion, line };
    const list = map.get(poseNorm);
    if (list) list.push(row);
    else map.set(poseNorm, [row]);
  }
  return map;
}

const BANK = parseLocalBrain();

export function localBrainPoseKeys(): string[] {
  return [...BANK.keys()].filter((k) => k !== "_default" && !k.startsWith("_"));
}

function rowsFor(poseKey: string): LocalBrainRow[] {
  const key = poseKey.trim().toLowerCase();
  return BANK.get(key) ?? BANK.get("_default") ?? [];
}

export function usedDefaultBank(poseKey: string): boolean {
  const key = poseKey.trim().toLowerCase();
  return !BANK.has(key);
}

/**
 * Pick one line for a pose key. Avoids repeating lastLine when another
 * row exists. Unknown keys (and kiss) use `_default`.
 */
export function pickLocalBrainLine(poseKey: string, avoid: string = lastLine): LocalBrainRow {
  const rows = rowsFor(poseKey);
  if (!rows.length) {
    const fallback: LocalBrainRow = {
      poseKey: "_default",
      emotion: DEFAULT_EMOTION,
      line: "Say that again — with the real detail~",
    };
    lastLine = fallback.line;
    return fallback;
  }
  const filtered = avoid ? rows.filter((r) => r.line !== avoid) : rows;
  const pool = filtered.length ? filtered : rows;
  const row = pool[Math.floor(Math.random() * pool.length)] ?? rows[0]!;
  lastLine = row.line;
  return row;
}

export function resetLocalBrainLastLine(): void {
  lastLine = "";
}

/** Resolve which pose key the local brain should speak for. */
export function localBrainKeyFor(opts: {
  userText: string;
  currentPose?: PoseId | null;
  /**
   * Track-title sentences ("I'm listening to Super Shy") are not pose commands.
   * "shy" inside the title must not swap the sheet.
   */
  ignoreNamedPose?: boolean;
}): { poseKey: string; named: PoseId | false | null; keepCurrent: boolean } {
  const named = opts.ignoreNamedPose ? null : namedPoseFromText(opts.userText);
  if (named === false) {
    return {
      poseKey: opts.currentPose ?? "idle",
      named,
      keepCurrent: true,
    };
  }
  if (named) {
    return { poseKey: named, named, keepCurrent: false };
  }
  return {
    poseKey: opts.currentPose ?? "idle",
    named: null,
    keepCurrent: true,
  };
}

/**
 * Canonical live-chat pose for a local-brain table key.
 * `_default` / unknown / kiss → null (keep current body).
 */
export function poseFromBrainKey(poseKey: string): PoseId | null {
  const key = poseKey.trim().toLowerCase();
  if (!key || key === "_default") return null;
  return normalizePose(key);
}
