import { actForChartTurn, detectChartIntent, type ChartTurn } from "./chart.ts";
import { actForClockTurn, filterClockSpokenLine, type ClockTurn } from "./clock.ts";
import { actForLifeTurn, parseTrackTitle, type LifeTurn } from "./life.ts";
import { localBrainKeyFor, parseLocalBrain, pickLocalBrainLine, usedDefaultBank } from "./local-brain.ts";
import { poseForCallReply } from "./call.ts";
import {
  DEFAULT_EMOTION,
  namedPoseFromText,
  resolveSpokenPose,
  type EmotionId,
  type PoseId,
  type ResolveSpokenPoseOpts,
} from "./rai.ts";
import { filterEchoedLine, isBareGreeting, localTrackAct } from "./track.ts";

export type BrainMessage = { role: "user" | "assistant"; content: string };

export type BrainAct = {
  emotion: EmotionId;
  /** omit = keep the current sheet (kiss / unmapped / _default). */
  pose?: PoseId | null;
  line: string;
  mem?: string[];
  /** Set only by the local brain. Grok replies do not carry this. */
  source?: "local";
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

/** Horoscope / Chart / zodiac copy. A fallback line that matches this is not spoken. */
const ZODIAC_LORE_RE =
  /\b(?:horoscope|zodiac|sun sign|star sign|libra|aries|taurus|gemini|cancer|leo|virgo|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i;

function isZodiacLore(line: string): boolean {
  return ZODIAC_LORE_RE.test(line);
}

/**
 * A mood aside ("I am tired") can open a Chart daily turn. That turn's local
 * line is a horoscope. The fallback does not recite it.
 */
function isUnaskedMoodAside(userText: string): boolean {
  if (detectChartIntent(userText) !== "none") return false;
  return /\b(?:tired|sleepy|exhausted|wiped|drained)\b/i.test(userText);
}

/** Idle-bank line when a tracker has nothing, or its line is Chart lore / a talk caption. */
function spokenFallbackLine(userText: string, line: string): string {
  const talk = new Set((parseLocalBrain().get("talk") ?? []).map((row) => row.line));
  if (!line.trim() || isZodiacLore(line) || (isBareGreeting(userText) && talk.has(line))) {
    const idle = pickLocalBrainLine("idle");
    if (!isZodiacLore(idle.line) && !talk.has(idle.line)) return idle.line;
    return pickLocalBrainLine("_default").line;
  }
  return line;
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
  clockTurn?: ClockTurn,
): BrainAct {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const recentUserText = messages
    .filter((m) => m.role === "user")
    .slice(-6)
    .map((m) => m.content)
    .join("\n");
  const finish = (act: BrainAct): BrainAct => {
    let line = act.line;
    if (clockTurn) {
      line = filterClockSpokenLine(line, {
        now: clockTurn.now,
        recentText: recentUserText,
        askedTime: clockTurn.kind === "ask_time",
      });
    }
    // Time ask keeps the real hour. A named pose command may say the pose.
    // Every other line loses a parrot clause.
    const poseCommand = parseTrackTitle(lastUser) ? null : namedPoseFromText(lastUser);
    if (clockTurn?.kind !== "ask_time" && poseCommand == null) {
      line = filterEchoedLine(line, lastUser);
    }
    return { ...act, line, source: "local" };
  };
  const lifeTitle = parseTrackTitle(lastUser);
  const named = lifeTitle ? null : namedPoseFromText(lastUser);
  const tintCtx = { namedPose: named, currentPose, chartTurn, lifeTurn };
  const chartAct = chartTurn && chartTurn.kind !== "none" ? actForChartTurn(chartTurn) : null;
  const lifeAct = lifeTurn && lifeTurn.kind !== "none" ? actForLifeTurn(lifeTurn) : null;
  const clockAct = clockTurn && clockTurn.kind !== "none" ? actForClockTurn(clockTurn) : null;

  // Chart ask/diary stay local and never yield to Life. Clock ask is the real
  // hour, one beat. Life asks/track comments beat a same-turn Chart daily tint
  // so music is not swallowed by the sun glance.
  const preferChart = Boolean(chartTurn?.localOnly && chartAct);
  const preferClock = Boolean(clockTurn?.localOnly && clockAct && !preferChart);
  const preferLife = Boolean(lifeAct && !preferChart && !preferClock && (lifeTurn?.localOnly || lifeTurn?.kind === "track_change"));

  if (preferChart && chartAct) {
    const mem = extractMemCandidate(lastUser);
    const act: BrainAct = { emotion: chartAct.emotion, line: chartAct.line };
    if (chartAct.pose) act.pose = chartAct.pose;
    if (mem?.length) act.mem = mem;
    return finish(tintSpokenAct(act, tintCtx));
  }
  if (preferClock && clockAct) {
    const mem = extractMemCandidate(lastUser);
    const act: BrainAct = { emotion: clockAct.emotion, line: clockAct.line };
    if (clockAct.pose) act.pose = clockAct.pose;
    if (mem?.length) act.mem = mem;
    return finish(tintSpokenAct(act, tintCtx));
  }
  if (preferLife && lifeAct) {
    const mem = extractMemCandidate(lastUser);
    const act: BrainAct = { emotion: lifeAct.emotion, line: lifeAct.line };
    if (lifeAct.pose) act.pose = lifeAct.pose;
    if (mem?.length) act.mem = mem;
    return finish(tintSpokenAct(act, tintCtx));
  }
  if (chartAct && !isUnaskedMoodAside(lastUser)) {
    const mem = extractMemCandidate(lastUser);
    const act: BrainAct = { emotion: chartAct.emotion, line: chartAct.line };
    if (chartAct.pose) act.pose = chartAct.pose;
    if (mem?.length) act.mem = mem;
    return finish(tintSpokenAct(act, tintCtx));
  }

  const { poseKey, named: keyed } = localBrainKeyFor({
    userText: lastUser,
    currentPose,
    ignoreNamedPose: Boolean(lifeTitle),
  });
  const mem = extractMemCandidate(lastUser);

  // Kiss stays on the body already showing. Idle stays idle — no talk tint.
  // The line is that sheet's bank, or idle lines when the sheet has no rows.
  if (keyed === false) {
    const bankKey = currentPose && !usedDefaultBank(currentPose) ? currentPose : "idle";
    const row = pickLocalBrainLine(bankKey);
    const act: BrainAct = {
      emotion: DEFAULT_EMOTION,
      line: spokenFallbackLine(lastUser, row.line),
      pose: currentPose ?? "idle",
    };
    if (mem?.length) act.mem = mem;
    return finish(act);
  }

  // Generic chat tracks the last user line. The row emotion never picks the sheet.
  if (keyed == null) {
    const tracked = localTrackAct(lastUser);
    const line = spokenFallbackLine(lastUser, tracked?.line ?? "");
    const act: BrainAct = { emotion: DEFAULT_EMOTION, line };
    if (mem?.length) act.mem = mem;
    return finish(tintSpokenAct(act, { ...tintCtx, namedPose: null }));
  }

  // Named command already swapped the sheet. Speak that bank (idle lines if it has none).
  const bankKey = usedDefaultBank(poseKey) ? "idle" : poseKey;
  const row = pickLocalBrainLine(bankKey);
  const act: BrainAct = {
    emotion: DEFAULT_EMOTION,
    line: spokenFallbackLine(lastUser, row.line),
    pose: keyed,
  };
  if (mem?.length) act.mem = mem;
  return finish(tintSpokenAct(act, { ...tintCtx, namedPose: keyed }));
}

/** True once a local-brain act has announced itself. Grok JSON never sets this. */
export function isLocalBrainReply(raw: string): boolean {
  return /"source"\s*:\s*"local"/.test(raw);
}

/**
 * Kiss hold is local-brain only. A Grok reply that mentions kiss still uses
 * Grok's pose and emotion, including when the word is only part of the sentence.
 */
export function shouldHoldLocalKiss(raw: string, named: PoseId | false | null): boolean {
  return named === false && isLocalBrainReply(raw);
}

/** Final sheet for a landed reply. Local kiss keeps the current body. Grok uses the resolver. */
export function poseForLandedReply(
  opts: ResolveSpokenPoseOpts & { raw: string },
): { pose: PoseId; emotion: EmotionId } {
  if (shouldHoldLocalKiss(opts.raw, opts.namedPose ?? null)) {
    return { pose: opts.currentPose ?? "idle", emotion: DEFAULT_EMOTION };
  }
  return { emotion: opts.emotion, pose: poseForCallReply(opts) };
}

export function actToJson(act: BrainAct): string {
  const body: Record<string, unknown> = {};
  if (act.source === "local") body.source = "local";
  body.emotion = act.emotion;
  body.line = act.line;
  if (act.pose) body.pose = act.pose;
  if (act.mem?.length) body.mem = act.mem;
  return JSON.stringify(body);
}
