import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import { RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";
import { parseLocalBrain, resetLocalBrainLastLine } from "./local-brain.ts";
import {
  GROK_TURN_MAX,
  STOCK_FLIRT_RE,
  clipUserBeat,
  formatLastUserCue,
  isBareGreeting,
  isCorrectionTurn,
  isPermissionAsk,
  localTrackAct,
  localTrackKey,
  packChatTurns,
  theyClearlyAsked,
} from "./track.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("voice card TRACK / CORRECTION / ASKS", () => {
  it("matches artifacts/star-rai-voice-card.txt and keeps the output contract", () => {
    const disk = readFileSync(join(root, "artifacts/star-rai-voice-card.txt"), "utf8");
    assert.equal(RAI_SYSTEM, disk);
    assert.match(RAI_SYSTEM, /^TRACK$/m);
    assert.match(RAI_SYSTEM, /^CORRECTION$/m);
    assert.match(RAI_SYSTEM, /^ASKS$/m);
    assert.match(RAI_SYSTEM, /last user message is the only beat/i);
    assert.match(RAI_SYSTEM, /that'?s not what I said/i);
    assert.match(RAI_SYSTEM, /Do not invent that they asked you something/);
    assert.match(RAI_SYSTEM, /All you have to do is ask/);
    assert.match(RAI_SYSTEM, /Looking at you\. Don't flinch/);
    assert.match(RAI_SYSTEM, /Then ask already/);
    assert.match(RAI_SYSTEM, /Never kiss/);
    assert.match(
      RAI_SYSTEM,
      /\{"line":"...","emotion":"bratty\|smug\|tired\|shy\|soft\|hype\|glance","pose":"<key or omit>"\}/,
    );
  });
});

describe("track classifiers", () => {
  it("reads a correction and a permission-ask, and does not invent an ask", () => {
    assert.equal(isCorrectionTurn("That's not what i said silly"), true);
    assert.equal(isCorrectionTurn("I didn't say that"), true);
    assert.equal(isCorrectionTurn("All you have to do is ask"), false);
    assert.equal(isPermissionAsk("All you have to do is ask"), true);
    assert.equal(isPermissionAsk("you just have to ask"), true);
    assert.equal(isPermissionAsk("Can you wink?"), false);
    assert.equal(theyClearlyAsked("All you have to do is ask"), false);
    assert.equal(theyClearlyAsked("Can you wink?"), true);
    assert.equal(theyClearlyAsked("What time is it?"), true);
    assert.equal(localTrackKey("That's not what i said silly"), "_correction");
    assert.equal(localTrackKey("All you have to do is ask"), "_permission");
    assert.equal(localTrackKey("Hey. Just got here."), null);
    assert.equal(isBareGreeting("Hey"), true);
    assert.equal(isBareGreeting("Hey. Just got here."), false);
  });

  it("clips the last beat and skips a leading hey", () => {
    assert.equal(clipUserBeat("Hey. Just got here."), "Just got here");
    assert.equal(clipUserBeat("All you have to do is ask"), "All you have to do is ask");
  });
});

describe("local track acts", () => {
  it("does not invent an ask from permission language", () => {
    resetLocalBrainLastLine();
    const act = localTrackAct("All you have to do is ask");
    assert.ok(act);
    assert.doesNotMatch(act.line, STOCK_FLIRT_RE);
    assert.doesNotMatch(act.line, /then ask already|don'?t drag/i);
    assert.match(act.line, /ask/i);
    assert.match(act.line, /not making you ask|not begging/i);
  });

  it("acknowledges a correction instead of a stock flirt", () => {
    resetLocalBrainLastLine();
    const act = localTrackAct("That's not what i said silly");
    assert.ok(act);
    assert.match(act.line, /not what you said|wrong read/i);
    assert.doesNotMatch(act.line, STOCK_FLIRT_RE);
    assert.doesNotMatch(act.line, /looking at you|don'?t flinch/i);
  });

  it("echoes generic chat with their words", () => {
    resetLocalBrainLastLine();
    const act = localTrackAct("Hey. Just got here.");
    assert.ok(act);
    assert.match(act.line, /Just got here/);
    assert.doesNotMatch(act.line, STOCK_FLIRT_RE);
  });
});

describe("composeAct screenshot transcript", () => {
  it("tracks 'All you have to do is ask' without pushing an ask", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "All you have to do is ask" }], undefined, "idle");
    assert.doesNotMatch(act.line, STOCK_FLIRT_RE);
    assert.doesNotMatch(act.line, /then ask already|don'?t drag/i);
    assert.notEqual(act.pose, "kiss");
  });

  it("honors 'That's not what i said silly' and does not stock-flirt", () => {
    resetLocalBrainLastLine();
    const act = composeAct(
      [
        { role: "user", content: "All you have to do is ask" },
        { role: "assistant", content: "Then ask already, tylo. Don't drag it" },
        { role: "user", content: "That's not what i said silly" },
      ],
      undefined,
      "idle",
    );
    assert.match(act.line, /not what you said|wrong read|my miss/i);
    assert.doesNotMatch(act.line, STOCK_FLIRT_RE);
  });
});

describe("pack recent turns", () => {
  it("keeps short threads intact and always retains the last user line", () => {
    const short = [
      { role: "user" as const, content: "All you have to do is ask" },
      { role: "assistant" as const, content: "Then ask already, tylo. Don't drag it" },
      { role: "user" as const, content: "That's not what i said silly" },
    ];
    assert.deepEqual(packChatTurns(short), short);
    const cue = formatLastUserCue(short);
    assert.match(cue, /^LAST USER SAID\nThat's not what i said silly\n/m);
    assert.match(cue, /acknowledge and pivot/i);
  });

  it("caps at GROK_TURN_MAX and drops empty placeholders", () => {
    assert.match(
      readFileSync(join(root, "src/lib/helix.ts"), "utf8"),
      /export const MAX_HISTORY = 16/,
    );
    assert.equal(GROK_TURN_MAX, 16);
    const messages = Array.from({ length: 24 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: i === 23 ? "   " : `turn ${i}`,
    }));
    messages.push({ role: "user", content: "That's not what i said silly" });
    const packed = packChatTurns(messages);
    assert.ok(packed.length <= GROK_TURN_MAX);
    assert.equal(packed.at(-1)?.content, "That's not what i said silly");
    assert.equal(
      packed.some((m) => m.content.trim().length === 0),
      false,
    );
  });
});

describe("local-brain table bans stock flirt", () => {
  it("does not ship stock-flirt spoken lines, and keeps correction rows", () => {
    const map = parseLocalBrain();
    for (const rows of map.values()) {
      for (const row of rows) {
        assert.doesNotMatch(row.line, STOCK_FLIRT_RE, row.line);
      }
    }
    assert.ok((map.get("_correction")?.length ?? 0) >= 2);
    assert.ok((map.get("_permission")?.length ?? 0) >= 2);
    assert.equal(map.has("kiss"), false);
  });
});
