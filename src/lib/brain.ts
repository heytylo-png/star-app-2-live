import type { EmotionId, PoseId } from "@/lib/rai";
import type { AffectionTier } from "@/lib/affection-store";

export type BrainMessage = { role: "user" | "assistant"; content: string };

export type BrainAct = {
  emotion: EmotionId;
  pose: PoseId;
  line: string;
  mem?: string[];
};

type Intent =
  | "bump"
  | "greet"
  | "bye"
  | "identity"
  | "flirt"
  | "praise"
  | "scold"
  | "question"
  | "soft"
  | "remember"
  | "recall"
  | "miss"
  | "bored"
  | "thanks"
  | "generic";

const LINES: Record<Intent, string[]> = {
  bump: [
    "Watch where you're going. You're lucky I'm in a good mood… which I'm not.",
    "Hey — eyes up. That was my personal space you just walked through.",
    "Bump me again and I'm billing you for stage damage.",
    "Ow. Announce yourself next time, genius.",
  ],
  greet: [
    "Hey. Took you long enough.",
    "There you are. Don't make a speech about it.",
    "Hi. I noticed. Obviously.",
    "Welcome back. Try not to waste the entrance.",
  ],
  bye: [
    "Fine. Go. I'll still be here when you remember priorities.",
    "Leaving already? Whatever. Don't trip on the way out.",
    "Bye. Try not to miss me too loudly.",
    "We're done for now. Don't vanish for ages.",
  ],
  identity: [
    "Star Rai. Idol. Not your screensaver. Keep up.",
    "I'm Star Rai. Stage name, real attitude. Memorize it.",
    "Rai. The one on this screen. Don't make me repeat it.",
    "Idol. Sharp tongue. Occasionally soft. Mostly me.",
  ],
  flirt: [
    "Don't get ideas. That was charity.",
    "Hmph. Say that again and I might actually blush. Might.",
    "You're bold. Annoyingly effective, too.",
    "Keep talking like that and I'll start charging for the view.",
  ],
  praise: [
    "…Thanks. Don't get used to hearing me say that.",
    "Flattery works. Barely. Don't stop.",
    "Okay, that landed. Happy now?",
    "I heard you. Soft spot acknowledged. Moving on.",
  ],
  scold: [
    "Absolutely not. Fix that attitude.",
    "Try again without the nonsense.",
    "I don't do excuses. Do better.",
    "Nope. That was lazy. I noticed.",
  ],
  question: [
    "Give me a second. I actually think before I talk.",
    "Hmm. Ask cleaner next time — but fine, I'm on it.",
    "Interesting question. Don't expect a soft answer.",
    "You're putting me on the spot. Cute. Thinking.",
  ],
  soft: [
    "…Don't look at me like that.",
    "Quiet moments are dangerous. For you.",
    "I'm not going anywhere. Stop sounding surprised.",
    "Fine. Stay close. Just don't announce it.",
  ],
  remember: [
    "…Fine. I'll keep that. Don't make me regret it.",
    "Logged. Treat it like it matters — because I will.",
    "Okay. That's mine now. Handle with care.",
    "Remembered. Don't test whether I forget.",
  ],
  recall: [
    "You want the list? Fine. Pay attention.",
    "I kept notes. Don't act shocked.",
    "Memory drawer, open. Try not to blush.",
  ],
  miss: [
    "Missed me? Obvious. I was busy being brilliant.",
    "Absence noted. Don't do that again without warning.",
    "I noticed the quiet. Hmph.",
    "You came back. Good instinct.",
  ],
  bored: [
    "Entertain me better than that.",
    "Is that all? Raise the bar.",
    "Yawn. Try a real sentence.",
    "I'm an idol, not a waiting room. Say something.",
  ],
  thanks: [
    "You're welcome. Don't make it weird.",
    "Obviously. I help. Sparingly.",
    "Mm. Saved your skin again. Keep the gratitude short.",
    "Noted. Pay me in better conversation.",
  ],
  generic: [
    "Hmph. Fine — I'm still here. Say something worth answering.",
    "I heard you. Make the next line sharper.",
    "Okay. Keep going — I'm listening, not impressed yet.",
    "That's your opener? Bold. Continue.",
    "Noted. Now say the part that actually matters.",
    "I'm right here. Use the airtime.",
  ],
};

const NAME_STOP = new Set(
  "the person talking you user rai star idol she he they someone anyone".split(" "),
);

let lastLine = "";

function pickLine(intent: Intent, avoid?: string): string {
  const bank = LINES[intent];
  const filtered = avoid ? bank.filter((l) => l !== avoid) : bank;
  const pool = filtered.length ? filtered : bank;
  const line = pool[Math.floor(Math.random() * pool.length)] ?? bank[0];
  lastLine = line;
  return line;
}

function parseFacts(systemExtra?: string): string[] {
  if (!systemExtra?.trim()) return [];
  return systemExtra
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l && !/^known facts/i.test(l));
}

function nameFromFacts(facts: string[]): string | null {
  for (const f of facts) {
    const m =
      f.match(/(?:name is|i'm|i am|call me)\s+([A-Za-z][\w'-]{1,24})/i) ||
      f.match(/^([A-Za-z][\w'-]{1,24})\s+is (?:my|their|the) name/i) ||
      f.match(/their name is\s+([A-Za-z][\w'-]{1,24})/i);
    if (m?.[1] && !NAME_STOP.has(m[1].toLowerCase())) return m[1];
  }
  return null;
}

function likeFromFacts(facts: string[]): string | null {
  for (const f of facts) {
    const m =
      f.match(/they like\s+(.+)/i) ||
      f.match(/like[sd]?\s+(.+)/i) ||
      f.match(/favorite\s+\w+:\s*(.+)/i);
    if (m?.[1]) {
      const v = m[1].replace(/\.$/, "").trim();
      if (v.length >= 2) return v;
    }
  }
  return null;
}

function cityFromFacts(facts: string[]): string | null {
  for (const f of facts) {
    const m = f.match(/(?:live in|from|based in)\s+(.+)/i);
    if (m?.[1]) return m[1].replace(/\.$/, "").trim();
  }
  return null;
}

function jobFromFacts(facts: string[]): string | null {
  for (const f of facts) {
    const m = f.match(/(?:job[:\s]+|work(?:s)? (?:as|at)\s+)(.+)/i);
    if (m?.[1]) return m[1].replace(/\.$/, "").trim();
  }
  return null;
}

function recentUserTexts(messages: BrainMessage[], n = 4): string[] {
  return messages
    .filter((m) => m.role === "user")
    .slice(-n)
    .map((m) => m.content);
}

function lastAssistantLine(messages: BrainMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const t = m.content.trim();
    if (t) return t;
  }
  return lastLine;
}

function looksLikeDurableFact(lower: string): boolean {
  return (
    /(?:my name is|i(?:'m| am) called|call me )\b/.test(lower) ||
    /(?:i live in|i(?:'m| am) from|based in)\b/.test(lower) ||
    /(?:i work (?:as|at)|my job is|i(?:'m| am) an?\s+\w+)/.test(lower) ||
    /\bi (?:like|love|enjoy)\b/.test(lower) ||
    /my favorite\s+\w+\s+is\b/.test(lower) ||
    /\bremember (?:that |this )?\b/.test(lower)
  );
}

function detectIntent(lower: string, _recent: string[]): Intent {
  if (/bump|wasn't watching|watch where|stepped on|ran into|sorry.*(bump|hit|ran)/.test(lower)) {
    return "bump";
  }
  if (/\b(bye|goodbye|good night|goodnight|see you|gotta go|leaving|i'm out|later)\b/.test(lower)) {
    return "bye";
  }
  if (/who are you|supposed to be|your name|what(?:'s| is) your name|introduce yourself/.test(lower)) {
    return "identity";
  }
  if (
    /kiss|love you|cute|pretty|beautiful|hot|date|flirt|crush|blow me a kiss|come closer/.test(lower)
  ) {
    return "flirt";
  }
  if (
    /you(?:'re| are) (?:amazing|great|the best|incredible|talented)|proud of you|love your (?:song|voice|show)/.test(
      lower,
    ) ||
    /\b(good job|well done|nice work|you shine|idol goals)\b/.test(lower)
  ) {
    return "praise";
  }
  if (/shut up|stupid|dumb|hate you|annoying|useless|worst/.test(lower)) {
    return "scold";
  }
  if (/miss(?:ed)? you|been a while|long time|where were you/.test(lower)) {
    return "miss";
  }
  if (/thank(?:s| you)|appreciate (?:it|you)/.test(lower)) {
    return "thanks";
  }
  if (
    /what do you remember|what(?:'s| is) on (?:your |the )?memory|tell me what you know about me|what do you know about me|list (?:my |the )?facts|what have you (?:got|stored|saved)/.test(
      lower,
    )
  ) {
    return "recall";
  }
  if (looksLikeDurableFact(lower)) {
    return "remember";
  }
  if (
    /hold me|stay with me|soft|gentle|tired|lonely|hug|comfort|scared|anxious|bad day/.test(lower)
  ) {
    return "soft";
  }
  if (
    /\b(hi|hey|hello|yo|sup|good morning|good evening|just got here|i'?m here)\b/.test(lower) ||
    /^(hi|hey|hello)[.!~]*$/i.test(lower.trim())
  ) {
    return "greet";
  }
  if (/\?$|\b(who|what|when|where|why|how|which|can you|do you|are you|will you)\b/.test(lower)) {
    return "question";
  }
  if (/bored|whatever|idk|nothing|meh/.test(lower)) {
    return "bored";
  }
  return "generic";
}

function intentToAct(intent: Intent): { emotion: EmotionId; pose: PoseId } {
  switch (intent) {
    case "bump":
    case "scold":
      return { emotion: "angry", pose: "scold" };
    case "greet":
      return { emotion: "happy", pose: "wave" };
    case "bye":
      return { emotion: "idle", pose: "turn-away" };
    case "identity":
      return { emotion: "thinking", pose: "point" };
    case "flirt":
      // Mix kiss / lean so flirty doesn't always blow a kiss
      return Math.random() < 0.55
        ? { emotion: "flirty", pose: "kiss" }
        : { emotion: "flirty", pose: "lean" };
    case "praise":
    case "miss":
    case "thanks":
      return { emotion: "happy", pose: "hearts" };
    case "question":
      return Math.random() < 0.5
        ? { emotion: "thinking", pose: "point" }
        : { emotion: "thinking", pose: "finger" };
    case "soft":
      return Math.random() < 0.45
        ? { emotion: "shy", pose: "hold" }
        : { emotion: "shy", pose: "shy" };
    case "remember":
    case "recall":
      return { emotion: "shy", pose: "shy" };
    case "bored":
      return { emotion: "angry", pose: "turn-away" };
    case "generic":
    default:
      // Rare idle beats via emotion-only path (finger/lean) — mostly look-at idle
      if (Math.random() < 0.08) return { emotion: "surprised", pose: "finger" };
      if (Math.random() < 0.06) return { emotion: "flirty", pose: "lean" };
      return { emotion: "idle", pose: "idle" };
  }
}

/** Pull durable facts from a user line even without the word "remember". */
export function extractMemCandidate(text: string, intent?: Intent): string[] | undefined {
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

  if (intent === "remember" || /\bremember (?:that |this )?/i.test(cleaned)) {
    const rememberThat = cleaned.match(/remember (?:that |this )?(.{3,70})/i);
    if (rememberThat?.[1]) {
      const fact = rememberThat[1].replace(/\s+/g, " ").trim();
      // Skip if we already captured a structured version
      const already = out.some((o) => o.toLowerCase().includes(fact.toLowerCase().slice(0, 12)));
      if (!already && !/^(me|my name|this)$/i.test(fact)) out.push(fact);
    }
  }

  // Deduplicate similar facts
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

function personalize(
  line: string,
  name: string | null,
  intent: Intent,
  like: string | null,
): string {
  if (name && intent === "greet") {
    const bank = [
      `${name}. Took you long enough.`,
      `Hey, ${name}. Don't make a speech.`,
      `${name}. I noticed. Obviously.`,
    ];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  if (name && intent === "miss") {
    const bank = [
      `${name}. Missed me? Obvious.`,
      `There you are, ${name}. Don't vanish like that.`,
    ];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  if (name && intent === "bye") {
    const bank = [`Go on, ${name}. I'll still be here.`, `Bye, ${name}. Don't trip.`];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  if (name && intent === "thanks") {
    return `You're welcome, ${name}. Don't make it weird.`;
  }
  if (like && intent === "greet" && Math.random() < 0.45) {
    const who = name ?? "You";
    return `${who}. Still into ${like}? Hmph. Hi.`;
  }
  if (like && (intent === "generic" || intent === "soft") && Math.random() < 0.38) {
    const bank = [
      `Still into ${like}? Noted. ${line}`,
      `Don't think I forgot ${like}. ${line}`,
    ];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  if (name && intent === "generic" && Math.random() < 0.4) {
    return `${name}. ${line}`;
  }
  return line;
}

function craftFromFacts(
  lower: string,
  facts: string[],
  name: string | null,
  avoid: string,
  intent: Intent,
): BrainAct | null {
  if (!facts.length && intent !== "recall") return null;

  if (/who am i|what(?:'s| is) my name|do you know (?:me|my name)|remember (?:me|my name)/.test(lower)) {
    if (name) {
      const lines = [
        `${name}. Obviously. I don't misplace names.`,
        `You're ${name}. Try not to test me twice.`,
        `${name}. Logged. Next question.`,
      ].filter((l) => l !== avoid);
      const line = lines[Math.floor(Math.random() * lines.length)] ?? `${name}. Obviously.`;
      lastLine = line;
      return { emotion: "thinking", pose: "idle", line };
    }
  }

  if (
    intent === "recall" ||
    /what do i like|my favorite|what did i tell you|what do you remember|what do you know about me/.test(
      lower,
    )
  ) {
    if (!facts.length) {
      const line = "Drawer's empty. Tell me something worth keeping first.";
      lastLine = line;
      return { emotion: "thinking", pose: "idle", line };
    }
    const bits = facts.slice(0, 5).map((f) => f.replace(/^-\s*/, "").replace(/\.$/, ""));
    let line: string;
    if (bits.length === 1) {
      line = `${bits[0]}. I kept it. On purpose.`;
    } else if (bits.length === 2) {
      line = `${bits[0]}; and ${bits[1]}. Don't act surprised.`;
    } else {
      const head = bits.slice(0, -1).join("; ");
      line = `I kept a few things: ${head}; and ${bits[bits.length - 1]}. Don't make me recite the whole drawer.`;
    }
    if (line === avoid) line = `Fine — ${bits.join("; ")}. Happy?`;
    lastLine = line;
    return { emotion: "shy", pose: "shy", line };
  }

  if (/where do i (?:live|work)|what(?:'s| is) my (?:city|job|work)/.test(lower)) {
    const city = cityFromFacts(facts);
    const job = jobFromFacts(facts);
    if (city || job) {
      const parts = [city && `You live in ${city}`, job && `you work as ${job}`].filter(
        Boolean,
      ) as string[];
      const line = `${parts.join("; ")}. I pay attention.`;
      lastLine = line;
      return { emotion: "thinking", pose: "idle", line };
    }
  }

  return null;
}

function parseAffectionMeta(systemExtra?: string): {
  tier: AffectionTier;
  gapDays: number;
  streak: number;
} {
  const tierMatch = systemExtra?.match(/Relationship:\s*(Stranger|Familiar|Close|Devoted)/i);
  const gapMatch = systemExtra?.match(/away\s*~(\d+)\s*days/i);
  const streakMatch = systemExtra?.match(/Talk streak:\s*(\d+)/i);
  const label = (tierMatch?.[1] ?? "Stranger").toLowerCase() as AffectionTier;
  const tier: AffectionTier =
    label === "familiar" || label === "close" || label === "devoted" || label === "stranger"
      ? label
      : "stranger";
  return {
    tier,
    gapDays: gapMatch ? Number(gapMatch[1]) : 0,
    streak: streakMatch ? Number(streakMatch[1]) : 0,
  };
}

function affectionColor(
  line: string,
  tier: AffectionTier,
  gapDays: number,
  name: string | null,
  intent: Intent,
): string {
  // After a multi-day gap, softly note the quiet (once-ish via intent).
  if (gapDays >= 2 && (intent === "greet" || intent === "miss" || intent === "generic")) {
    const who = name ?? "You";
    const bank =
      tier === "devoted" || tier === "close"
        ? [
            `${who}. Quiet for a bit — I noticed. ${line}`,
            `There you are. Don't vanish that long again. ${line}`,
          ]
        : [
            `${who}. Took you a while. ${line}`,
            `Absence noted. ${line}`,
          ];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  if (tier === "devoted" && intent === "greet") {
    const who = name ?? "You";
    return `${who}. Good. Stay.`;
  }
  if (tier === "close" && intent === "soft") {
    return line.includes("…") ? line : `…${line}`;
  }
  if (tier === "stranger" && (intent === "flirt" || intent === "soft")) {
    // Keep distance
    const bank = [
      "We're not there yet. Try talking first.",
      "Slow down. I barely know you.",
    ];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  return line;
}

/**
 * Offline Star Rai brain for GitHub Pages (no server API).
 * Always stays in character; never mentions demo/offline/API.
 * Optional systemExtra may include Relationship / Talk streak blocks from affection-store.
 */
export function composeAct(messages: BrainMessage[], systemExtra?: string): BrainAct {
  const facts = parseFacts(systemExtra);
  const name = nameFromFacts(facts);
  const like = likeFromFacts(facts);
  const { tier, gapDays } = parseAffectionMeta(systemExtra);
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lower = lastUser.toLowerCase();
  const recent = recentUserTexts(messages);
  const avoid = lastAssistantLine(messages);

  const intent = detectIntent(lower, recent);

  // Gap-away greetings lean on miss energy
  const effectiveIntent: Intent =
    gapDays >= 2 && intent === "greet" ? "miss" : intent;

  const fromFacts = craftFromFacts(lower, facts, name, avoid, effectiveIntent);
  if (fromFacts) {
    const memEarly = extractMemCandidate(lastUser, intent);
    if (memEarly?.length) fromFacts.mem = memEarly;
    fromFacts.line = affectionColor(fromFacts.line, tier, gapDays, name, effectiveIntent);
    lastLine = fromFacts.line;
    return fromFacts;
  }

  let { emotion, pose } = intentToAct(effectiveIntent);
  let line = pickLine(effectiveIntent === "recall" ? "recall" : effectiveIntent, avoid);
  line = personalize(line, name, effectiveIntent, like);
  line = affectionColor(line, tier, gapDays, name, effectiveIntent);

  // Soft apology after a scolding / bump
  if (
    intent === "generic" &&
    /sorry|apologize|my bad|forgive/.test(lower) &&
    /watch where|bump|billing|personal space|eyes up/i.test(avoid)
  ) {
    emotion = "shy";
    pose = "shy";
    line = pickLine("soft", avoid);
  }

  // Warmth bias by tier
  if (tier === "devoted" && emotion === "idle" && effectiveIntent === "generic") {
    emotion = "happy";
  }
  if (tier === "close" && effectiveIntent === "greet") {
    emotion = "happy";
    pose = "wave";
  }

  if (!lastUser.trim()) {
    emotion = "idle";
    pose = "idle";
    line = pickLine("generic", avoid);
  }

  const mem = extractMemCandidate(lastUser, intent);
  const act: BrainAct = { emotion, pose, line };
  if (mem?.length) act.mem = mem;
  lastLine = line;
  return act;
}

export function actToJson(act: BrainAct): string {
  const body: Record<string, unknown> = {
    emotion: act.emotion,
    pose: act.pose,
    line: act.line,
  };
  if (act.mem?.length) body.mem = act.mem;
  return JSON.stringify(body);
}
