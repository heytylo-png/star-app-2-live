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

/** Last used row index per pose key. Survives reload so the cycle does not restart at line 1. */
const INDEX_STORAGE = "star-rai-local-brain-index";
let memoryIndex: Record<string, number> = {};

function readIndex(): Record<string, number> {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(INDEX_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object") {
          const out: Record<string, number> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "number" && Number.isInteger(value) && value >= 0) out[key] = value;
          }
          memoryIndex = out;
          return out;
        }
      }
    }
  } catch {
    /* private mode / bad JSON — keep the in-memory cursor */
  }
  return memoryIndex;
}

function writeIndex(map: Record<string, number>): void {
  memoryIndex = map;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(INDEX_STORAGE, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

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
  if (BANK.has(key)) return BANK.get(key) ?? [];
  // Unknown, kiss, or a live pose with no rows: idle lines. Never the whole table.
  return BANK.get("idle") ?? BANK.get("_default") ?? [];
}

export function usedDefaultBank(poseKey: string): boolean {
  const key = poseKey.trim().toLowerCase();
  return !BANK.has(key);
}

/**
 * One line for a pose key. Cycles the set in order and does not repeat the
 * previous line when another row exists. The index is stored per pose so a
 * reload continues the cycle. Unknown keys (and kiss) use idle lines.
 */
export function pickLocalBrainLine(poseKey: string, avoid: string = lastLine): LocalBrainRow {
  const key = poseKey.trim().toLowerCase();
  const bankKey = BANK.has(key) ? key : "idle";
  const rows = rowsFor(bankKey);
  if (!rows.length) {
    const fallback: LocalBrainRow = {
      poseKey: "idle",
      emotion: DEFAULT_EMOTION,
      line: "Facing you. Front and center~",
    };
    lastLine = fallback.line;
    return fallback;
  }
  const map = readIndex();
  const stored = map[bankKey];
  let index = stored == null ? 0 : (stored + 1) % rows.length;
  if (avoid && rows.length > 1 && rows[index]!.line === avoid) {
    index = (index + 1) % rows.length;
  }
  const row = rows[index]!;
  map[bankKey] = index;
  writeIndex(map);
  lastLine = row.line;
  return row;
}

export function resetLocalBrainLastLine(): void {
  lastLine = "";
  memoryIndex = {};
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(INDEX_STORAGE);
  } catch {
    /* ignore */
  }
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
