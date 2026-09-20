import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyHerDayGrokRaw, isChartBannedLine, localHerDay } from "./chart.ts";

const SKY = {
  sunSignToday: "Virgo" as const,
  moonSignToday: "Gemini" as const,
  moonPhase: "Waning Crescent" as const,
};

describe("her-day Grok path", () => {
  it("composes a local her-day from natal Libra + sky", () => {
    const copy = localHerDay({ todayDate: "2026-09-19", sky: SKY });
    assert.equal(copy.source, "local");
    assert.equal(copy.heading, "Her day");
    assert.equal(copy.natal, "Libra");
    assert.equal(copy.skyLine, "Virgo sun · Gemini moon · Waning Crescent");
    assert.ok(copy.beats.length >= 1 && copy.beats.length <= 3);
  });

  it("keeps a valid Grok line as her-day beats", () => {
    const local = localHerDay({ todayDate: "2026-09-19", sky: SKY });
    const grok = applyHerDayGrokRaw(
      '{"emotion":"smug","pose":"think","line":"Virgo over my Libra air. Gemini moon — keep yours."}',
      local,
      SKY,
    );
    assert.equal(grok.source, "grok");
    assert.equal(grok.natal, "Libra");
    assert.ok(grok.beats.length >= 1 && grok.beats.length <= 3);
    assert.doesNotMatch(grok.beats.join(" "), /your reading for today is|Fukuoka|Aries/i);
    assert.equal(grok.beats.some((b) => isChartBannedLine(b)), false);
  });

  it("fails soft to local on banned or empty Grok copy", () => {
    const local = localHerDay({ todayDate: "2026-09-19", sky: SKY });
    const banned = applyHerDayGrokRaw(
      '{"line":"Your reading for today is a Mercury transit in Fukuoka."}',
      local,
      SKY,
    );
    assert.equal(banned.source, "local");
    assert.deepEqual(banned.beats, local.beats);

    const empty = applyHerDayGrokRaw('{"emotion":"idle","line":"   "}', local, SKY);
    assert.equal(empty.source, "local");
  });
});
