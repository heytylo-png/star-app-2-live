import { actForChartTurn, type ChartTurn } from "./chart.ts";
import { actForLifeTurn, parseTrackTitle, type LifeTurn } from "./life.ts";
import { localBrainKeyFor, pickLocalBrainLine } from "./local-brain.ts";
import { namedPoseFromText, resolveSpokenPose, type EmotionId, type PoseId } from "./rai.ts";

export type BrainMessage = { role: "user" | "assistant"; content: string };

export type BrainAct = {
  emotion: EmotionId;
  /** omit = keep the current sheet (kiss / unmapped / _default). */
  pose?: PoseId | null;
  line: string;
  mem?: string[];
};

const NAME_STOP = new Set(
  "the person talking you user rai star idol she he they someone anyone".split(" "),
);

/** Pull durable facts from a user line even without the word "remember". */
export function extractMemCandidate(text: string): string[] | undefined {
  const out: string[] = [];
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;

  const name = cleaned.match(
    /(?:my name is|i(?:'m| am) called|call me)\s+([A-Za-z][\w'-]{1,24})/i,
  );
  if (name?.[1] && !NAME_STOP.has(name[1].toLowerCase())) {
    out.push(`Their name is ${name[1]}`);
  }

  const city = cleaned.match(
    /(?:i live in|i(?:'m| am) from|based in)\s+([A-Za-z][\w .'-]{1,40}?)(?:[.!,]|$)/i,
  );
  if (city?.[1]) out.push(`They live in ${city[1].trim()}`);

  const job = cleaned.match(
    /(?:i work (?:as|at)|my job is)\s+([^.!?,]{2,50})|i(?:'m| am) an?\s+([A-Za-z][\w -]{2,40})/i,
  );
  if (job) {
    const j = (job[1] || job[2] || "").trim();
    if (j && !/^(idol|fan|idiot|mess)$/i.test(j)) out.push(`Their job: ${j}`);
  }

  const like = cleaned.match(/\bi (?:like|love|enjoy)\s+([^.!?,]{2,60})/i);
  if (like?.[1] && !/^(you|talking to you|this|that)\b/i.test(like[1].trim())) {
    out.push(`They like ${like[1].trim()}`);
  }

  const fav = cleaned.match(/my favorite\s+(\w+)\s+is\s+([^.!?,]{2,50})/i);
  if (fav) out.push(`Favorite ${fav[1]}: ${fav[2].trim()}`);

  if (/\bremember (?:that |this )?/i.test(cleaned)) {
    const rememberThat = cleaned.match(/remember (?:that |this )?(.{3,70})/i);
    if (rememberThat?.[1]) {
      const fact = rememberThat[1].replace(/\s+/g, " ").trim();
      const already = out.some((o) => o.toLowerCase().includes(fact.toLowerCase().slice(0, 12)));
      if (!already && !/^(me|my name|this)$/i.test(fact)) out.push(fact);
    }
  }

  const uniq: string[] = [];
  for (const item of out) {
    const key = item.toLowerCase();
    if (uniq.some((u) => u.toLowerCase() === key || u.toLowerCase().includes(key) || key.includes(u.toLowerCase()))) {
      continue;
    }
    uniq.push(item.slice(0, 80));
  }
  return uniq.length ? uniq.slice(0, 3) : undefined;
}

function tintSpokenAct(
  act: BrainAct,
  ctx: {
    namedPose?: PoseId | false | null;
    currentPose?: PoseId | null;
    chartTurn?: ChartTurn;
    lifeTurn?: LifeTurn;
  },
): BrainAct {
  const pose = resolveSpokenPose({
    namedPose: ctx.namedPose,
    modelPose: act.pose ?? null,
    emotion: act.emotion,
    spoken: true,
    nowPlayingJustSet: ctx.lifeTurn?.kind === "track_change",
    chartBeat: ctx.chartTurn?.kind === "daily",
    chartTintPose: ctx.chartTurn?.tintPose,
    lifeTintPose: ctx.lifeTurn?.tintPose,
    seed: act.line,
    currentPose: ctx.currentPose,
  });
  return { ...act, pose };
}

/**
 * Offline Star Rai brain for GitHub Pages (no server API).
 * Lines come from artifacts/star-rai-local-brain.txt, keyed by the current
 * (or just-named) pose. Memory facts are still extracted; affection/Grok extras
 * stay on the Grok path.
 */
export function composeAct(
  messages: BrainMessage[],
  _systemExtra?: string,
  currentPose?: PoseId | null,
  chartTurn?: ChartTurn,
  lifeTurn?: LifeTurn,
): BrainAct {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lifeTitle = parseTrackTitle(lastUser);
  const named = lifeTitle ? null : namedPoseFromText(lastUser);
  const tintCtx = { namedPose: named, currentPose, chartTurn, lifeTurn };
  const chartAct = chartTurn && chartTurn.kind !== "none" ? actForChartTurn(chartTurn) : null;
  const lifeAct = lifeTurn && lifeTurn.kind !== "none" ? actForLifeTurn(lifeTurn) : null;

  // Chart ask/diary stay local and never yield to Life. Life asks/track comments
  // beat a same-turn Chart daily tint so music is not swallowed by the sun glance.
  const preferChart = Boolean(chartTurn?.localOnly && chartAct);
  const preferLife = Boolean(lifeAct && !preferChart && (lifeTurn?.localOnly || lifeTurn?.kind === "track_change"));

  if (preferChart && chartAct) {
    const mem = extractMemCandidate(lastUser);
    const act: BrainAct = { emotion: chartAct.emotion, line: chartAct.line };
    if (chartAct.pose) act.pose = chartAct.pose;
    if (mem?.length) act.mem = mem;
    return tintSpokenAct(act, tintCtx);
  }
  if (preferLife && lifeAct) {
    const mem = extractMemCandidate(lastUser);
    const act: BrainAct = { emotion: lifeAct.emotion, line: lifeAct.line };
    if (lifeAct.pose) act.pose = lifeAct.pose;
    if (mem?.length) act.mem = mem;
    return tintSpokenAct(act, tintCtx);
  }
  if (chartAct) {
    const mem = extractMemCandidate(lastUser);
    const act: BrainAct = { emotion: chartAct.emotion, line: chartAct.line };
    if (chartAct.pose) act.pose = chartAct.pose;
    if (mem?.length) act.mem = mem;
    return tintSpokenAct(act, tintCtx);
  }

  const { poseKey, named: keyed } = localBrainKeyFor({
    userText: lastUser,
    currentPose,
  });
  const row = pickLocalBrainLine(poseKey);
  const mem = extractMemCandidate(lastUser);

  const act: BrainAct = { emotion: row.emotion, line: row.line };
  // Named pose commands already swapped the sheet; echo the key. Kiss / omitted → tint.
  if (keyed) act.pose = keyed;
  if (mem?.length) act.mem = mem;
  return tintSpokenAct(act, { ...tintCtx, namedPose: keyed });
}

export function actToJson(act: BrainAct): string {
  const body: Record<string, unknown> = {
    emotion: act.emotion,
    line: act.line,
  };
  if (act.pose) body.pose = act.pose;
  if (act.mem?.length) body.mem = act.mem;
  return JSON.stringify(body);
}
