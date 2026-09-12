import type { EmotionId, PoseId } from "@/lib/rai";

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
    if (m?.[1] && !/^(the|person|talking|you|user)$/i.test(m[1])) return m[1];
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
    /remember|don'?t forget|my name is|i(?:'m| am) called|call me |i live in|i work|i like |favorite/.test(
      lower,
    )
  ) {
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
      return { emotion: "angry", pose: "idle" };
    case "greet":
      return { emotion: "happy", pose: "wave" };
    case "bye":
      return { emotion: "idle", pose: "turn-away" };
    case "identity":
      return { emotion: "thinking", pose: "idle" };
    case "flirt":
      return { emotion: "flirty", pose: "kiss" };
    case "praise":
    case "miss":
    case "thanks":
      return { emotion: "happy", pose: "hearts" };
    case "question":
      return { emotion: "thinking", pose: "idle" };
    case "soft":
    case "remember":
      return { emotion: "shy", pose: "shy" };
    case "bored":
      return { emotion: "angry", pose: "turn-away" };
    case "generic":
    default:
      return { emotion: "idle", pose: "idle" };
  }
}

function extractMemCandidate(text: string, intent: Intent): string[] | undefined {
  if (intent !== "remember" && !/my name is|i(?:'m| am) called|call me |remember that/i.test(text)) {
    return undefined;
  }
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!cleaned) return undefined;

  const name = text.match(/(?:my name is|i(?:'m| am) called|call me)\s+([A-Za-z][\w'-]{1,24})/i);
  if (name?.[1]) return [`Their name is ${name[1]}`];

  const like = text.match(/i like ([^.!?,]{3,60})/i);
  if (like?.[1]) return [`They like ${like[1].trim()}`];

  const rememberThat = text.match(/remember (?:that )?(.{3,70})/i);
  if (rememberThat?.[1]) return [rememberThat[1].replace(/\s+/g, " ").trim()];

  return [cleaned];
}

function personalize(line: string, name: string | null, intent: Intent): string {
  if (!name) return line;
  if (intent === "greet") {
    const bank = [
      `${name}. Took you long enough.`,
      `Hey, ${name}. Don't make a speech.`,
      `${name}. I noticed. Obviously.`,
    ];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  if (intent === "miss") {
    const bank = [
      `${name}. Missed me? Obvious.`,
      `There you are, ${name}. Don't vanish like that.`,
    ];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  if (intent === "bye") {
    const bank = [`Go on, ${name}. I'll still be here.`, `Bye, ${name}. Don't trip.`];
    return bank[Math.floor(Math.random() * bank.length)]!;
  }
  return line;
}

function craftFromFacts(
  lower: string,
  facts: string[],
  name: string | null,
  avoid: string,
): BrainAct | null {
  if (!facts.length) return null;

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

  if (/what do i like|my favorite|what did i tell you|what do you remember/.test(lower)) {
    const nugget = facts.find((f) => /like|favor|prefer|love /i.test(f)) ?? facts[0];
    if (nugget) {
      const fact = nugget.replace(/^-\s*/, "");
      const lines = [
        `You told me: ${fact}. Don't act surprised.`,
        `${fact}. I kept it. On purpose.`,
      ].filter((l) => l !== avoid);
      const line = lines[Math.floor(Math.random() * lines.length)] ?? fact;
      lastLine = line;
      return { emotion: "shy", pose: "shy", line };
    }
  }

  return null;
}

/**
 * Offline Star Rai brain for GitHub Pages (no server API).
 * Always stays in character; never mentions demo/offline/API.
 */
export function composeAct(messages: BrainMessage[], systemExtra?: string): BrainAct {
  const facts = parseFacts(systemExtra);
  const name = nameFromFacts(facts);
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lower = lastUser.toLowerCase();
  const recent = recentUserTexts(messages);
  const avoid = lastAssistantLine(messages);

  const fromFacts = craftFromFacts(lower, facts, name, avoid);
  if (fromFacts) return fromFacts;

  const intent = detectIntent(lower, recent);
  let { emotion, pose } = intentToAct(intent);
  let line = pickLine(intent, avoid);
  line = personalize(line, name, intent);

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
