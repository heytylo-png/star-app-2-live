import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import {
  CHART_TINT_POSES,
  CHART_TZ_FALLBACK,
  HER_CHART,
  actForChartTurn,
  composeDiaryEntry,
  detectChartIntent,
  extractNatalFromUserText,
  formatChartFactsBlock,
  formatHerDayFactsBlock,
  isChartBannedLine,
  isDayOrMoodTopic,
  localDateKey,
  natalFromSetup,
  parseMonthDay,
  pickChartTintPose,
  resolveChartTurn,
  sunFromBirthDate,
  sunFromMonthDay,
} from "./chart.ts";
import { composeGrokSystem, formatMemoryFacts } from "./memory-slots.ts";
import { CHART_V1_SOURCE, RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const NOW = new Date("2026-09-19T18:00:00-05:00");
const TZ = "America/Chicago";

describe("Chart v1 artifact", () => {
  it("matches artifacts/star-chart-v1.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-chart-v1.txt"), "utf8");
    assert.equal(CHART_V1_SOURCE, disk);
    assert.match(CHART_V1_SOURCE, /STAR RAI — CHART v1/);
    assert.match(CHART_V1_SOURCE, /user_birth_date/);
    assert.match(CHART_V1_SOURCE, /Leave user_rising empty/);
  });

  it("keeps her constants in the spec without changing the voice card", () => {
    assert.match(CHART_V1_SOURCE, /her_sun: Libra/);
    assert.match(RAI_SYSTEM, /LORE USE/);
    assert.match(RAI_SYSTEM, /\{"line":/);
    assert.equal(HER_CHART.her_sun, "Libra");
    assert.equal(HER_CHART.birth_date, "2000-09-29");
    assert.equal(HER_CHART.birth_place, "Fukuoka");
  });
});

describe("tropical sun table", () => {
  it("maps inclusive month-day boundaries (year ignored)", () => {
    const cases: [number, number, string][] = [
      [12, 21, "Sagittarius"],
      [12, 22, "Capricorn"],
      [1, 19, "Capricorn"],
      [1, 20, "Aquarius"],
      [2, 18, "Aquarius"],
      [2, 19, "Pisces"],
      [3, 20, "Pisces"],
      [3, 21, "Aries"],
      [4, 19, "Aries"],
      [4, 20, "Taurus"],
      [5, 20, "Taurus"],
      [5, 21, "Gemini"],
      [6, 20, "Gemini"],
      [6, 21, "Cancer"],
      [7, 22, "Cancer"],
      [7, 23, "Leo"],
      [8, 22, "Leo"],
      [8, 23, "Virgo"],
      [9, 22, "Virgo"],
      [9, 23, "Libra"],
      [9, 29, "Libra"],
      [10, 22, "Libra"],
      [10, 23, "Scorpio"],
      [11, 21, "Scorpio"],
      [11, 22, "Sagittarius"],
      [2, 29, "Pisces"],
    ];
    for (const [m, d, sign] of cases) {
      assert.equal(sunFromMonthDay(m, d), sign, `${m}-${d}`);
    }
    assert.equal(sunFromBirthDate("2000-09-29"), "Libra");
    assert.equal(sunFromBirthDate("1994-04-12"), "Aries");
    assert.equal(sunFromBirthDate("03-05"), "Pisces");
    assert.equal(parseMonthDay("March 5, 1994")?.month, 3);
    assert.equal(sunFromBirthDate("March 5"), "Pisces");
  });
});

describe("setup natal slots", () => {
  it("fills user_birth_* + derived sun + chart_source and omits rising", () => {
    const natal = natalFromSetup({ date: "1994-04-12", time: "14:00", place: "Chicago" });
    assert.equal(natal.user_birth_date, "1994-04-12");
    assert.equal(natal.user_birth_time, "14:00");
    assert.equal(natal.user_birth_place, "Chicago");
    assert.equal(natal.user_sun, "Aries");
    assert.equal(natal.chart_source, "setup");
    assert.equal("user_rising" in natal, false);

    const facts = formatMemoryFacts(natal);
    assert.match(facts, /^user_birth_date: 1994-04-12$/m);
    assert.match(facts, /^user_sun: Aries$/m);
    assert.match(facts, /^chart_source: setup$/m);
    assert.doesNotMatch(facts, /user_rising/);
    assert.doesNotMatch(facts, /her_sun|Fukuoka|Libra|03:33/);
  });

  it("does not put a birthday line into meetup chart slots", () => {
    const patch = extractNatalFromUserText("My birthday is March 5.");
    assert.equal(patch.user_birth_date, "03-05");
    assert.equal(patch.user_sun, "Pisces");
    assert.equal(patch.chart_source, "chat");
    assert.equal(patch.chart, undefined);
  });
});

describe("daily Chart fire", () => {
  it("fires once per local day when Chat is open and user_sun is known", () => {
    const first = resolveChartTurn({
      userText: "Hey. Just got here.",
      chatOpen: true,
      userSun: "Aries",
      lastTopic: "Hey. Just got here.",
      alreadyFiredDate: null,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(first.kind, "daily");
    assert.equal(first.localOnly, false);
    assert.ok(first.factsBlock);
    assert.match(first.factsBlock!, /^CHART$/m);
    assert.match(first.factsBlock!, /^today_date: 2026-09-19$/m);
    assert.match(first.factsBlock!, /^her_sun: Libra$/m);
    assert.match(first.factsBlock!, /^user_sun: Aries$/m);
    assert.match(first.factsBlock!, /Tint one line only/);
    assert.ok(CHART_TINT_POSES.includes(first.tintPose!));
    assert.equal((CHART_TINT_POSES as readonly string[]).includes("idle"), false);
    assert.notEqual(first.tintPose, "idle");

    const second = resolveChartTurn({
      userText: "Still here.",
      chatOpen: true,
      userSun: "Aries",
      alreadyFiredDate: "2026-09-19",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(second.kind, "none");
    assert.equal(second.factsBlock, undefined);
  });

  it("skips Chart without user_sun unless day/mood or they asked", () => {
    const skip = resolveChartTurn({
      userText: "Hey. Just got here.",
      chatOpen: true,
      alreadyFiredDate: null,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(skip.kind, "none");

    const mood = resolveChartTurn({
      userText: "I'm tired.",
      chatOpen: true,
      mood: "tired",
      lastTopic: "I'm tired.",
      alreadyFiredDate: null,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(mood.kind, "daily");
    assert.doesNotMatch(mood.factsBlock ?? "", /^user_sun:/m);

    const closed = resolveChartTurn({
      userText: "I'm tired.",
      chatOpen: false,
      mood: "tired",
      userSun: "Aries",
      alreadyFiredDate: null,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(closed.kind, "none");
  });

  it("fires again the same day only if they asked", () => {
    const asked = resolveChartTurn({
      userText: "what's my horoscope today",
      chatOpen: true,
      userSun: "Aries",
      alreadyFiredDate: "2026-09-19",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(asked.kind, "daily");
  });

  it("uses America/Chicago as the timezone fallback", () => {
    assert.equal(CHART_TZ_FALLBACK, "America/Chicago");
    assert.equal(localDateKey(NOW, TZ), "2026-09-19");
    assert.ok(isDayOrMoodTopic("rough day", undefined));
    assert.equal(isDayOrMoodTopic("night talking", undefined), false);
  });
});

describe("ask path + diary", () => {
  it("answers her sign / birthday / origin locally and short", () => {
    const sign = resolveChartTurn({
      userText: "what's your sign",
      chatOpen: true,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(sign.kind, "ask_sign");
    assert.equal(sign.localOnly, true);
    const signAct = actForChartTurn(sign)!;
    assert.match(signAct.line, /^Libra\./);
    assert.ok(signAct.line.split(" ").length <= 8);

    const bday = resolveChartTurn({
      userText: "when is your birthday",
      chatOpen: true,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(actForChartTurn(bday)?.line, "Sept 29.");

    const origin = resolveChartTurn({
      userText: "where are you from",
      chatOpen: true,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(origin.kind, "ask_origin");
    assert.match(actForChartTurn(origin)!.line, /^(Fukuoka|Osaka)\./);
    assert.doesNotMatch(actForChartTurn(origin)!.line, /Fukuoka.*Osaka|Osaka.*Fukuoka/);
  });

  it("asks for a birthday once on match/today with no date", () => {
    const first = resolveChartTurn({
      userText: "are we compatible",
      chatOpen: true,
      askedBirthday: false,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(first.kind, "ask_need_birthday");
    assert.equal(actForChartTurn(first)?.line, "Tell me your birthday if you want that.");

    const again = resolveChartTurn({
      userText: "horoscope today",
      chatOpen: true,
      askedBirthday: true,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(again.kind, "none");
  });

  it("writes 3–5 diary sentences on ask and reuses the same local day", () => {
    assert.equal(detectChartIntent("write your diary"), "diary");
    const first = resolveChartTurn({
      userText: "write your diary",
      chatOpen: true,
      lastTopic: "night talking",
      userSun: "Aries",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(first.kind, "diary");
    assert.equal(first.localOnly, true);
    const count = (first.diaryText ?? "").split(/(?<=[.!?])\s+/).filter(Boolean).length;
    assert.ok(count >= 3 && count <= 5, first.diaryText);
    assert.doesNotMatch(first.diaryText ?? "", /your reading for today is/i);
    assert.equal(isChartBannedLine(first.diaryText ?? ""), false);

    const reuse = resolveChartTurn({
      userText: "show diary",
      chatOpen: true,
      existingDiary: first.diaryText,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(reuse.diaryText, first.diaryText);

    const composed = composeDiaryEntry({ todayDate: "2026-09-19" });
    const n = composed.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    assert.ok(n >= 3 && n <= 5);
  });
});

describe("Grok request composition", () => {
  it("is voice card + MEMORY FACTS + CHART block when Chart fires", () => {
    const facts = formatMemoryFacts({
      name: "Tylo",
      last_topic: "rough day",
      user_birth_date: "1994-04-12",
      user_sun: "Aries",
      chart_source: "setup",
    });
    const chart = formatChartFactsBlock({
      todayDate: "2026-09-19",
      userSun: "Aries",
      lastTopic: "rough day",
    });
    const extra = `${facts}\n\n${chart}`;
    const system = composeGrokSystem(RAI_SYSTEM, extra);
    assert.ok(system.startsWith(RAI_SYSTEM));
    assert.match(system, /MEMORY FACTS\nname: Tylo/);
    assert.match(system, /^user_sun: Aries$/m);
    assert.match(system, /^chart_source: setup$/m);
    assert.match(system, /^CHART\ntoday_date: 2026-09-19\nher_sun: Libra\nuser_sun: Aries$/m);
    const factsOnly = facts;
    assert.doesNotMatch(factsOnly, /her_sun|Fukuoka|03:33/);
    assert.doesNotMatch(factsOnly, /user_rising/);
  });

  it("keeps kiss unmapped and tints daily local acts from the allowed set", () => {
    const pose = pickChartTintPose("2026-09-19");
    assert.ok(CHART_TINT_POSES.includes(pose));
    const act = composeAct([{ role: "user", content: "Hey." }], "", "idle", {
      kind: "daily",
      localOnly: false,
      dateKey: "2026-09-19",
      tintPose: pose,
      userSun: "Aries",
      lastTopic: "Hey.",
    });
    assert.equal(act.pose, pose);
    assert.doesNotMatch(act.line, /your reading for today is/i);
    assert.equal(isChartBannedLine(act.line), false);

    const kiss = composeAct([{ role: "user", content: "kiss" }], "", "wave");
    assert.equal(kiss.pose, "wave");
  });

  it("builds a Chart/her-day ask without user_sun or natal bio", () => {
    const block = formatHerDayFactsBlock({
      todayDate: "2026-09-19",
      sky: {
        sunSignToday: "Virgo",
        moonSignToday: "Gemini",
        moonPhase: "Waning Crescent",
      },
    });
    assert.match(block, /^CHART$/m);
    assert.match(block, /^ask: her-day$/m);
    assert.match(block, /^today_date: 2026-09-19$/m);
    assert.match(block, /^her_sun: Libra$/m);
    assert.match(block, /^sun_sign_today: Virgo$/m);
    assert.match(block, /HER day/);
    assert.match(block, /1-3 short lines/);
    const keysOnly = block.split("\n\n")[0] ?? "";
    assert.doesNotMatch(keysOnly, /user_sun|last_topic|Fukuoka|Osaka|03:33|user_rising/);
  });

  it("tints the birthday ask off frown idle on that spoken bubble", () => {
    const act = composeAct([{ role: "user", content: "when is your birthday" }], "", "idle", {
      kind: "ask_birthday",
      localOnly: true,
      dateKey: "2026-09-19",
    });
    assert.equal(act.line, "Sept 29.");
    assert.equal(act.pose, "talk");
    assert.notEqual(act.pose, "idle");
  });
});
