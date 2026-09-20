import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import {
  formatChartFactsBlock,
  HER_CHART,
  isChartBannedLine,
  resolveChartTurn,
} from "./chart.ts";
import { HOROSCOPE_CHEAP_SOURCE, RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";
import { composeGrokSystem, formatMemoryFacts } from "./memory-slots.ts";
import {
  composeHerDay,
  composeSkyDashboard,
  computeSkyFacts,
  formatSkyFactLines,
  moonPhaseLabel,
  sanitizeHerDayBeats,
  tropicalSignFromLongitude,
} from "./sky.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const NOW = new Date("2026-09-19T18:00:00-05:00");
const TZ = "America/Chicago";

describe("cheap horoscope artifact", () => {
  it("matches artifacts/star-rai-horoscope-cheap.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-rai-horoscope-cheap.txt"), "utf8");
    assert.equal(HOROSCOPE_CHEAP_SOURCE, disk);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /STAR RAI — CHEAP REAL HOROSCOPE/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /astronomy-engine/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /No Worker \/sky/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /sun_sign_today/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /moon_sign_today/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /Do NOT invent Fukuoka local sky/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /omit rising/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /Do not copy Co-Star/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /Opening Chart does not auto-post a reading to Chat/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /HER DAY/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /Chart\/her-day/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /once per local day/);
  });

  it("does not change the voice card output contract", () => {
    assert.match(RAI_SYSTEM, /\{"line":/);
    assert.match(RAI_SYSTEM, /LORE USE/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /one tint/);
    assert.match(HOROSCOPE_CHEAP_SOURCE, /your reading for today is/);
  });
});

describe("tropical signs + moon phase", () => {
  it("maps ecliptic longitude 0° Aries through 330° Pisces", () => {
    const cases: [number, string][] = [
      [0, "Aries"],
      [29.9, "Aries"],
      [30, "Taurus"],
      [60, "Gemini"],
      [90, "Cancer"],
      [120, "Leo"],
      [150, "Virgo"],
      [176, "Virgo"],
      [180, "Libra"],
      [210, "Scorpio"],
      [240, "Sagittarius"],
      [270, "Capricorn"],
      [300, "Aquarius"],
      [330, "Pisces"],
      [359.9, "Pisces"],
      [360, "Aries"],
      [-1, "Pisces"],
    ];
    for (const [lon, sign] of cases) {
      assert.equal(tropicalSignFromLongitude(lon), sign, String(lon));
    }
    assert.equal(tropicalSignFromLongitude(Number.NaN), undefined);
  });

  it("labels eight moon-phase bins from elongation", () => {
    assert.equal(moonPhaseLabel(0), "New");
    assert.equal(moonPhaseLabel(45), "Waxing Crescent");
    assert.equal(moonPhaseLabel(90), "First Quarter");
    assert.equal(moonPhaseLabel(135), "Waxing Gibbous");
    assert.equal(moonPhaseLabel(180), "Full");
    assert.equal(moonPhaseLabel(225), "Waning Gibbous");
    assert.equal(moonPhaseLabel(270), "Last Quarter");
    assert.equal(moonPhaseLabel(315), "Waning Crescent");
    assert.equal(moonPhaseLabel(360), "New");
  });
});

describe("client-side ephemeris", () => {
  it("computes tropical sun/moon for a frozen local instant (Virgo, not Fukuoka)", () => {
    const sky = computeSkyFacts(NOW);
    assert.ok(sky);
    assert.equal(sky!.sunSignToday, "Virgo");
    assert.ok(sky!.moonSignToday);
    assert.ok(sky!.moonPhase);
    assert.notEqual(sky!.sunSignToday, HER_CHART.her_sun);
    const lines = formatSkyFactLines(sky);
    assert.ok(lines.some((l) => l.startsWith("sun_sign_today:")));
    assert.doesNotMatch(lines.join("\n"), /Fukuoka|Osaka|Asia\/Tokyo|rising|03:33/i);
  });

  it("fails soft on a bad date and omits empty keys", () => {
    assert.equal(computeSkyFacts(new Date(Number.NaN)), null);
    assert.deepEqual(formatSkyFactLines(null), []);
    assert.deepEqual(formatSkyFactLines(undefined), []);
    assert.deepEqual(formatSkyFactLines({}), []);
  });
});

describe("CHART/SKY grok block", () => {
  it("appends filled sky keys when Chart fires and omits them on fail-soft", () => {
    const withSky = resolveChartTurn({
      userText: "Hey. Just got here.",
      chatOpen: true,
      userSun: "Aries",
      lastTopic: "Hey. Just got here.",
      alreadyFiredDate: null,
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(withSky.kind, "daily");
    assert.match(withSky.factsBlock ?? "", /^CHART$/m);
    assert.match(withSky.factsBlock ?? "", /^today_date: 2026-09-19$/m);
    assert.match(withSky.factsBlock ?? "", /^her_sun: Libra$/m);
    assert.match(withSky.factsBlock ?? "", /^user_sun: Aries$/m);
    assert.match(withSky.factsBlock ?? "", /^sun_sign_today: Virgo$/m);
    assert.match(withSky.factsBlock ?? "", /^moon_sign_today: /m);
    assert.match(withSky.factsBlock ?? "", /^moon_phase: /m);
    assert.match(withSky.factsBlock ?? "", /Do not invent Fukuoka local sky/);
    const keysOnly = (withSky.factsBlock ?? "").split("\n\n")[0] ?? "";
    assert.doesNotMatch(keysOnly, /user_rising|rising:|Fukuoka|03:33|Osaka|Asia\/Tokyo/);

    const omitted = formatChartFactsBlock({
      todayDate: "2026-09-19",
      userSun: "Aries",
      sky: null,
    });
    assert.match(omitted, /^CHART\ntoday_date: 2026-09-19\nher_sun: Libra\nuser_sun: Aries\n\n/m);
    assert.doesNotMatch(omitted, /sun_sign_today|moon_sign_today|moon_phase/);

    const forced = resolveChartTurn({
      userText: "Hey. Just got here.",
      chatOpen: true,
      userSun: "Aries",
      alreadyFiredDate: null,
      now: NOW,
      timeZone: TZ,
      sky: null,
    });
    assert.equal(forced.kind, "daily");
    assert.doesNotMatch(forced.factsBlock ?? "", /sun_sign_today/);
  });

  it("rides voice card + MEMORY FACTS without dumping a planet essay", () => {
    const facts = formatMemoryFacts({
      name: "Tylo",
      last_topic: "rough day",
      user_sun: "Aries",
      chart_source: "setup",
    });
    const chart = formatChartFactsBlock({
      todayDate: "2026-09-19",
      userSun: "Aries",
      lastTopic: "rough day",
      sky: computeSkyFacts(NOW),
    });
    const system = composeGrokSystem(RAI_SYSTEM, `${facts}\n\n${chart}`);
    assert.ok(system.startsWith(RAI_SYSTEM));
    assert.match(system, /MEMORY FACTS\nname: Tylo/);
    assert.match(system, /^sun_sign_today: Virgo$/m);
    assert.match(system, /Tint one line only/);
    assert.doesNotMatch(facts, /sun_sign_today|her_sun|Fukuoka/);
    const act = composeAct([{ role: "user", content: "Hey." }], chart, "idle", {
      kind: "daily",
      localOnly: false,
      dateKey: "2026-09-19",
      tintPose: "think",
      userSun: "Aries",
      lastTopic: "Hey.",
      factsBlock: chart,
    });
    assert.doesNotMatch(act.line, /your reading for today is/i);
    assert.equal(isChartBannedLine(act.line), false);
  });
});

describe("sparse Chart dashboard copy", () => {
  it("builds a short Star Rai theme + Do/Don't from sky facts", () => {
    const dash = composeSkyDashboard({
      todayDate: "2026-09-19",
      weekday: "Saturday",
      userSun: "Aries",
      herSun: "Libra",
      sky: {
        sunSignToday: "Virgo",
        moonSignToday: "Gemini",
        moonPhase: "Waning Crescent",
      },
    });
    assert.equal(dash.weekday, "Saturday");
    assert.equal(dash.dateLine, "Sep 19");
    assert.ok(dash.theme.length > 0 && dash.theme.length <= 96);
    assert.ok(dash.doLine);
    assert.ok(dash.dontLine);
    assert.equal(isChartBannedLine(dash.theme), false);
    assert.doesNotMatch(dash.theme, /your reading for today is/i);
    assert.doesNotMatch(`${dash.theme} ${dash.doLine} ${dash.dontLine}`, /Fukuoka|Co-Star|mercury|venus|mars/i);
    const keys = dash.labels.map((l) => l.key);
    assert.deepEqual(keys, ["you", "her", "sun", "moon", "phase"]);
    assert.equal(dash.labels.find((l) => l.key === "you")?.value, "Aries");
    assert.equal(dash.labels.find((l) => l.key === "her")?.value, "Libra");
  });

  it("omits Do/Don't and sky labels when ephemeris is missing", () => {
    const dash = composeSkyDashboard({
      todayDate: "2026-09-19",
      weekday: "Saturday",
      sky: null,
    });
    assert.equal(dash.doLine, undefined);
    assert.equal(dash.dontLine, undefined);
    assert.match(dash.theme, /quiet/i);
    assert.equal(dash.labels.some((l) => l.key === "sun" || l.key === "moon"), false);
    assert.equal(dash.labels.find((l) => l.key === "her")?.value, "Libra");
    assert.equal(dash.labels.some((l) => l.key === "you"), false);
  });
});

describe("her day copy", () => {
  const sky = {
    sunSignToday: "Virgo" as const,
    moonSignToday: "Gemini" as const,
    moonPhase: "Waning Crescent" as const,
  };

  it("describes Star Rai's day from natal Libra + today's sky, not user_sun", () => {
    const her = composeHerDay({
      todayDate: "2026-09-19",
      herSun: HER_CHART.her_sun,
      sky,
    });
    assert.equal(her.heading, "Her day");
    assert.equal(her.natal, "Libra");
    assert.equal(her.source, "local");
    assert.equal(her.skyLine, "Virgo sun · Gemini moon · Waning Crescent");
    assert.ok(her.beats.length >= 1 && her.beats.length <= 3);
    const text = her.beats.join(" ");
    assert.match(text, /Libra|Virgo|Gemini|Waning Crescent/);
    assert.doesNotMatch(text, /Aries|your reading for today is|Fukuoka|Osaka|03:33|Co-Star/i);
    assert.equal(her.beats.some((b) => isChartBannedLine(b)), false);
    her.beats.forEach((b) => assert.ok(b.length <= 88));
  });

  it("stays distinct from the you+me theme glance", () => {
    const dash = composeSkyDashboard({
      todayDate: "2026-09-19",
      weekday: "Saturday",
      userSun: "Aries",
      herSun: "Libra",
      sky,
    });
    const her = composeHerDay({ todayDate: "2026-09-19", herSun: "Libra", sky });
    assert.notEqual(her.beats.join(" "), dash.theme);
    assert.doesNotMatch(her.beats.join(" "), /Aries next to Libra/);
  });

  it("fails soft when sky is missing and never dumps bio", () => {
    const her = composeHerDay({ todayDate: "2026-09-19", sky: null });
    assert.equal(her.natal, "Libra");
    assert.equal(her.skyLine, undefined);
    assert.ok(her.beats.length >= 1);
    assert.match(her.beats.join(" "), /Libra/);
    assert.doesNotMatch(her.beats.join(" "), /Fukuoka|03:33|mercury/i);
  });

  it("sanitizes Grok prose into 1–3 beats and rejects banned copy", () => {
    assert.deepEqual(
      sanitizeHerDayBeats("Virgo over Libra air — that's on me today.\nGemini moon — keep yours."),
      ["Virgo over Libra air — that's on me today.", "Gemini moon — keep yours."],
    );
    assert.equal(sanitizeHerDayBeats("Your reading for today is Virgo."), null);
    assert.equal(sanitizeHerDayBeats("Born in Fukuoka at 03:33."), null);
    assert.equal(sanitizeHerDayBeats("Mercury is in my first house."), null);
    assert.equal(sanitizeHerDayBeats("   "), null);
  });
});
