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
  CLOCK_TZ_FALLBACK,
  actForClockTurn,
  clockTimeZone,
  extractTimezone,
  formatClockFactsBlock,
  hourBand,
  isClockAsk,
  readLocalNow,
  resolveClockTurn,
  spokenClockHour,
} from "./clock.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const NOW = new Date("2026-09-19T01:20:00-05:00");
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
    assert.match(block, /^tz: America\/Chicago/m);
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
    assert.equal(act.line, "1 AM.");
    assert.ok(act.line.split(/\s+/).length <= 3);
  });
});

describe("clock ask path + grok composition", () => {
  it("detects where-you-are time asks and ignores meetup scheduling", () => {
    assert.equal(isClockAsk("What time is it where you are?"), true);
    assert.equal(isClockAsk("what time is it"), true);
    assert.equal(isClockAsk("what's the time"), true);
    assert.equal(isClockAsk("Hey. Just got here."), false);
    assert.equal(isClockAsk("Let's meet Saturday at 7pm"), false);
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
    assert.equal(act.line, "1 AM.");
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
