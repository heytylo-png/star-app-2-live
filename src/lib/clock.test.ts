import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import {
  CLOCK_SOURCE,
  RAI_SYSTEM,
} from "./generated/star-rai-artifacts.ts";
import { composeGrokSystem, formatMemoryFacts } from "./memory-slots.ts";
import {
  CLOCK_BANNED_PHRASES,
  CLOCK_NEUTRAL_LINE,
  CLOCK_TZ_FALLBACK,
  actForClockTurn,
  clockTimeZone,
  extractTimezone,
  filterClockSpokenLine,
  formatClockFactsBlock,
  hourBand,
  isClockAsk,
  readLocalNow,
  resolveClockTurn,
  spokenClockHour,
  spokenClockLine,
} from "./clock.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const NOW = new Date("2026-09-19T01:20:00-05:00");
const MORNING = new Date("2026-09-23T08:00:00-05:00");
const NIGHT = new Date("2026-09-23T02:00:00-05:00");
const AFTERNOON = new Date("2026-09-23T14:00:00-05:00");
const TEN = new Date("2026-09-23T10:00:00-05:00");
const TZ = "America/Chicago";

describe("Clock artifact", () => {
  it("matches artifacts/star-rai-clock.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-rai-clock.txt"), "utf8");
    assert.equal(CLOCK_SOURCE, disk);
    assert.match(CLOCK_SOURCE, /STAR RAI — CLOCK/);
    assert.match(CLOCK_SOURCE, /weekday/);
    assert.match(CLOCK_SOURCE, /Do NOT invent Fukuoka time/);
    assert.match(CLOCK_SOURCE, /What time is it where you are/);
    assert.match(CLOCK_SOURCE, /mornings drag/);
    assert.match(CLOCK_SOURCE, /late nights thinking about you/);
    assert.match(CLOCK_SOURCE, /0–5 night/);
    assert.match(CLOCK_SOURCE, /6–11 morning/);
    assert.match(CLOCK_SOURCE, /12–17 afternoon/);
    assert.match(CLOCK_SOURCE, /18–23 evening/);
    assert.match(CLOCK_SOURCE, /Time is a fact, not a topic/);
    assert.match(CLOCK_SOURCE, /Fail → local brain still applies/);
  });

  it("does not change the voice card output contract", () => {
    assert.match(RAI_SYSTEM, /\{"line":/);
    assert.match(RAI_SYSTEM, /LORE USE/);
    assert.match(CLOCK_SOURCE, /\{"line","emotion","pose"\}/);
  });
});

describe("clock formatting", () => {
  it("reads weekday + hour 0–23 + tz from the given zone", () => {
    const now = readLocalNow(NOW, TZ);
    assert.equal(now.weekday, "Saturday");
    assert.equal(now.hour, 1);
    assert.equal(now.minute, 20);
    assert.equal(now.localNow, "2026-09-19T01:20:00-05:00");
    assert.equal(now.timeZone, TZ);
    assert.equal(now.band, "night");
    assert.match(now.tzLabel, /C[DS]T|GMT-5|UTC-5/i);
  });

  it("maps hour bands 0–5 / 6–11 / 12–17 / 18–23", () => {
    assert.equal(hourBand(0), "night");
    assert.equal(hourBand(5), "night");
    assert.equal(hourBand(6), "morning");
    assert.equal(hourBand(11), "morning");
    assert.equal(hourBand(12), "afternoon");
    assert.equal(hourBand(17), "afternoon");
    assert.equal(hourBand(18), "evening");
    assert.equal(hourBand(23), "evening");
  });

  it("falls back to America/Chicago and does not invent Fukuoka time", () => {
    assert.equal(CLOCK_TZ_FALLBACK, "America/Chicago");
    assert.equal(clockTimeZone("America/Los_Angeles"), "America/Los_Angeles");
    const device = clockTimeZone();
    assert.ok(device.length > 0);
    assert.notEqual(device.toLowerCase(), "asia/tokyo");
    const now = readLocalNow(NOW, "not-a-zone");
    assert.equal(now.timeZone, CLOCK_TZ_FALLBACK);
    const block = formatClockFactsBlock(readLocalNow(NOW, TZ));
    assert.match(block, /^CLOCK$/m);
    assert.match(block, /^weekday: Saturday$/m);
    assert.match(block, /^hour: 1$/m);
    assert.match(block, /^minute: 20$/m);
    assert.match(block, /^local_now: 2026-09-19T01:20:00-05:00$/m);
    assert.match(block, /^tz: America\/Chicago/m);
    assert.match(block, /^tz_label:/m);
    assert.match(block, /^band: night$/m);
    assert.match(block, /^with_user: true$/m);
    assert.match(block, /Fact only/);
    assert.match(block, /Do not invent Fukuoka \/ Japan local/);
    assert.match(block, /one beat/);
    assert.match(block, /mornings drag/);
    assert.match(block, /late nights thinking about you/);
    assert.doesNotMatch(block, /Asia\/Tokyo|JST|Osaka|03:33/i);
  });

  it("speaks the real hour in one beat", () => {
    assert.equal(spokenClockHour(0), "12 AM");
    assert.equal(spokenClockHour(1), "1 AM");
    assert.equal(spokenClockHour(12), "12 PM");
    assert.equal(spokenClockHour(13), "1 PM");
    assert.equal(spokenClockHour(18), "6 PM");
    const turn = resolveClockTurn({
      userText: "What time is it where you are?",
      now: NOW,
      timeZone: TZ,
    });
    const act = actForClockTurn(turn)!;
    assert.equal(act.line, "It's 1:20 here. You're up late.");
    assert.equal(act.line, spokenClockLine(turn.now));
    assert.ok(act.line.split(/[.!?]/).filter((part) => part.trim()).length <= 2);
    assert.match(act.line, /\b1:20\b/);
    assert.doesNotMatch(act.line, /Fukuoka|Osaka|Tokyo|JST/i);
  });
});

describe("clock ask path + grok composition", () => {
  it("detects where-you-are time asks and ignores meetup scheduling", () => {
    assert.equal(isClockAsk("What time is it where you are?"), true);
    assert.equal(isClockAsk("what time is it"), true);
    assert.equal(isClockAsk("what time is it there"), true);
    assert.equal(isClockAsk("is it late there"), true);
    assert.equal(isClockAsk("what's the time"), true);
    assert.equal(isClockAsk("Hey. Just got here."), false);
    assert.equal(isClockAsk("Let's meet Saturday at 7pm"), false);
    assert.equal(isClockAsk("what time is it in Japan"), false);
  });

  it("is local-only for the ask; CLOCK still rides every grok extra", () => {
    const asked = resolveClockTurn({
      userText: "What time is it where you are?",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(asked.kind, "ask_time");
    assert.equal(asked.localOnly, true);
    assert.match(asked.factsBlock, /^CLOCK\nweekday: Saturday\nhour: 1/m);

    const other = resolveClockTurn({
      userText: "Hey. Just got here.",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(other.kind, "none");
    assert.equal(other.localOnly, false);
    assert.ok(other.factsBlock.startsWith("CLOCK\n"));

    const facts = formatMemoryFacts({ name: "Tylo", mood: "tired" });
    const extra = [other.factsBlock, facts].join("\n\n");
    const system = composeGrokSystem(RAI_SYSTEM, extra);
    assert.ok(system.startsWith(RAI_SYSTEM));
    assert.match(system, /STAR RAI — VOICE CARD/);
    assert.match(system, /^CLOCK$/m);
    assert.match(system, /^hour: 1$/m);
    assert.match(system, /MEMORY FACTS\nname: Tylo/);
    assert.match(system, /Do not invent Fukuoka \/ Japan local/);
    assert.doesNotMatch(system.slice(RAI_SYSTEM.length), /Osaka|03:33|Asia\/Tokyo|birth_place/);
  });

  it("answers the ask from the local brain with the real hour", () => {
    const turn = resolveClockTurn({
      userText: "what time is it where you are",
      now: NOW,
      timeZone: TZ,
    });
    const act = composeAct(
      [{ role: "user", content: "what time is it where you are" }],
      turn.factsBlock,
      "idle",
      undefined,
      undefined,
      turn,
    );
    assert.equal(act.line, "It's 1:20 here. You're up late.");
    assert.equal(act.pose, "talk");
    assert.notEqual(act.pose, "idle");
  });

  it("does not steal a generic chat turn onto a time line when grok fails", () => {
    const turn = resolveClockTurn({
      userText: "Hey. Just got here.",
      now: NOW,
      timeZone: TZ,
    });
    const act = composeAct(
      [{ role: "user", content: "Hey. Just got here." }],
      turn.factsBlock,
      "idle",
      undefined,
      undefined,
      turn,
    );
    assert.notEqual(act.line, "1 AM.");
    assert.doesNotMatch(act.line, /It's 1:20 here/);
    assert.doesNotMatch(act.line, /mornings drag|late nights thinking about you/i);
  });

  it("sets an explicit zone only when they say so — not from Fukuoka / city lore", () => {
    assert.equal(extractTimezone("My timezone is America/Los_Angeles"), "America/Los_Angeles");
    assert.equal(extractTimezone("I'm on Pacific time"), "America/Los_Angeles");
    assert.equal(extractTimezone("I live in Fukuoka"), undefined);
    assert.equal(extractTimezone("Fukuoka"), undefined);
    assert.equal(extractTimezone("Hey. Just got here."), undefined);
  });
});

describe("clock band filter at a mocked device clock", () => {
  it("carries hour 8, morning, and America/Chicago at 08:00 CDT", () => {
    const now = readLocalNow(MORNING, TZ);
    assert.equal(now.weekday, "Wednesday");
    assert.equal(now.hour, 8);
    assert.equal(now.minute, 0);
    assert.equal(now.band, "morning");
    assert.equal(now.timeZone, "America/Chicago");
    assert.equal(now.localNow, "2026-09-23T08:00:00-05:00");
    assert.match(now.tzLabel, /CDT|GMT-5|UTC-5/i);
    const block = formatClockFactsBlock(now);
    assert.match(block, /^hour: 8$/m);
    assert.match(block, /^band: morning$/m);
    assert.match(block, /^tz: America\/Chicago$/m);
    assert.match(block, /^local_now: 2026-09-23T08:00:00-05:00$/m);
    assert.match(block, /A tired pose is not a clock/);
    assert.doesNotMatch(block, /Asia\/Tokyo|JST|Osaka|03:33/i);
  });

  it("filters late night, up thinking about you, and can't sleep at 8am", () => {
    const now = readLocalNow(MORNING, TZ);
    for (const bit of ["late night", "up thinking about you", "can't sleep", "late nights", "staying up"]) {
      const line = filterClockSpokenLine(`Hey. ${bit.charAt(0).toUpperCase()}${bit.slice(1)}.`, {
        now,
        recentText: "hey",
      });
      assert.equal(line, "Hey.", bit);
      assert.doesNotMatch(line, new RegExp(bit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    const wiped = filterClockSpokenLine("Can't sleep. Up thinking about you. Late night.", {
      now,
      recentText: "hey",
    });
    assert.equal(wiped, CLOCK_NEUTRAL_LINE);
    assert.ok(CLOCK_BANNED_PHRASES.includes("late night"));
    assert.ok(CLOCK_BANNED_PHRASES.includes("up thinking about you"));
    assert.ok(CLOCK_BANNED_PHRASES.includes("can't sleep"));
  });

  it("answers a time ask with the real 8 and nothing Fukuoka", () => {
    const turn = resolveClockTurn({
      userText: "What time is it where you are?",
      now: MORNING,
      timeZone: TZ,
    });
    const act = composeAct(
      [{ role: "user", content: "What time is it where you are?" }],
      turn.factsBlock,
      "idle",
      undefined,
      undefined,
      turn,
    );
    assert.match(act.line, /\b8:00\b|\b8\s*am\b/i);
    assert.match(act.line, /8/);
    assert.doesNotMatch(act.line, /Fukuoka|Osaka|Tokyo|JST|Japan/i);
    const wrong = filterClockSpokenLine("It's 3:00 in Fukuoka. You're up late.", {
      now: turn.now,
      recentText: "What time is it where you are?",
      askedTime: true,
    });
    assert.match(wrong, /\b8:00\b/);
    assert.doesNotMatch(wrong, /Fukuoka/);
  });

  it("allows a late-night bit at 02:00", () => {
    const now = readLocalNow(NIGHT, TZ);
    assert.equal(now.hour, 2);
    assert.equal(now.band, "night");
    const line = filterClockSpokenLine("Can't sleep. Up thinking about you.", {
      now,
      recentText: "hey",
    });
    assert.match(line, /Can't sleep/);
    assert.match(line, /Up thinking about you/);
  });

  it("allows a sleep line at 14:00 when the user said they're tired", () => {
    const now = readLocalNow(AFTERNOON, TZ);
    assert.equal(now.hour, 14);
    assert.equal(now.band, "afternoon");
    const line = filterClockSpokenLine("Can't sleep. I'm with you.", {
      now,
      recentText: "I'm so tired",
    });
    assert.match(line, /Can't sleep/);
  });

  it("does not let a tired pose at 10:00 produce night talk", () => {
    const turn = resolveClockTurn({
      userText: "hey",
      now: TEN,
      timeZone: TZ,
    });
    assert.equal(turn.now.hour, 10);
    assert.equal(turn.now.band, "morning");
    const act = composeAct(
      [{ role: "user", content: "hey" }],
      turn.factsBlock,
      "tired",
      undefined,
      undefined,
      turn,
    );
    assert.doesNotMatch(act.line, /late night|can't sleep|up thinking about you|staying up|mornings drag/i);
    const slipped = filterClockSpokenLine("Can't sleep. Up thinking about you.", {
      now: turn.now,
      recentText: "hey",
    });
    assert.equal(slipped, CLOCK_NEUTRAL_LINE);
    assert.doesNotMatch(slipped, /night|sleep|late/i);
  });
});
