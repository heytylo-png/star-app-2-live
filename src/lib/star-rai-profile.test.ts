import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import { HER_CHART, sunFromBirthDate } from "./chart.ts";
import { composeGrokSystem } from "./memory-slots.ts";
import { RAI_SYSTEM } from "./rai.ts";
import { STAGE_MENU_ITEMS } from "./stage-menu.ts";
import {
  STAR_RAI,
  profileLocalLine,
  starRaiAge,
  starRaiBirthdayLine,
  starRaiOriginLine,
  starRaiPersonaBlock,
  starRaiShortBio,
} from "./star-rai-profile.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ON_2026_10_18 = new Date(Date.UTC(2026, 9, 18));

describe("Star Rai profile", () => {
  it("keeps the canonical shape and the verbatim doc", () => {
    assert.equal(STAR_RAI.name, "Star Rai");
    assert.equal(STAR_RAI.kanji, "星莱");
    assert.equal(STAR_RAI.birthday, "2004-09-03");
    assert.equal(STAR_RAI.birthTime, "03:33");
    assert.equal(STAR_RAI.birthplace, "Osaka");
    assert.equal(STAR_RAI.sunSign, "Virgo");
    assert.match(STAR_RAI.height, /5'8"/);
    assert.match(STAR_RAI.build, /Slim and athletic/);
    assert.match(STAR_RAI.hair, /ahoge/);
    assert.match(STAR_RAI.eyes, /amber/);
    assert.match(STAR_RAI.skin, /Fair/);
    assert.match(STAR_RAI.earrings, /Star-shaped/);
    assert.match(STAR_RAI.uniform, /red bow/);
    assert.equal(STAR_RAI.yearsInOsaka, 12);
    assert.match(STAR_RAI.thenCountry, /United States/);
    assert.ok(STAR_RAI.likes.includes("Cats"));
    assert.ok(STAR_RAI.likes.includes("Beaches"));
    assert.ok(STAR_RAI.likes.includes("Martial arts"));
    assert.ok(STAR_RAI.likes.includes("People who wear baggy clothes"));
    assert.ok(STAR_RAI.dislikes.includes("Clowns"));
    assert.ok(STAR_RAI.dislikes.includes("Smelly things"));
    assert.ok(STAR_RAI.dislikes.includes("Cheap clothes"));
    assert.ok(STAR_RAI.dislikes.includes("Open-ended questions"));
    assert.match(STAR_RAI.favorites.food, /tonkotsu/i);
    assert.match(STAR_RAI.favorites.food, /Brussels sprouts/);
    assert.equal(STAR_RAI.favorites.dessert, "Tiramisu");
    assert.match(STAR_RAI.favorites.music, /80s Japanese pop/);
    assert.match(STAR_RAI.personality, /Bratty/);
    assert.match(STAR_RAI.personality, /Kind-hearted/);

    const doc = readFileSync(join(root, "docs/STAR_RAI_PROFILE.md"), "utf8");
    assert.match(doc, /^# Star Rai — Origins & Profile\n/);
    assert.match(doc, /\*\*Birthday\*\*: September 3, 2004/);
    assert.match(doc, /\*\*Birth Time\*\*: 3:33 AM/);
    assert.match(doc, /\*\*Birthplace\*\*: Osaka, Japan/);
    assert.match(doc, /At age 12, the family moved to the United States/);
    assert.match(doc, /Fair with a light warm tone/);
    assert.match(doc, /Star-shaped earrings/);
    assert.match(doc, /## Summary\nStar Rai is a Japanese-American woman born in Osaka at 3:33 AM on September 3, 2004\./);
  });

  it("computes age 22 on 2026-10-18 and 21 the day before her birthday", () => {
    assert.equal(starRaiAge(ON_2026_10_18), 22);
    assert.equal(starRaiAge(new Date(Date.UTC(2026, 8, 3))), 22);
    assert.equal(starRaiAge(new Date(Date.UTC(2026, 8, 2))), 21);
    assert.equal(starRaiAge(new Date(Date.UTC(2004, 8, 3))), 0);
  });

  it("puts the key facts in the Grok persona, with the computed age", () => {
    const block = starRaiPersonaBlock(ON_2026_10_18);
    assert.match(block, /^PROFILE\n/);
    assert.match(block, /Star Rai \(星莱\)/);
    assert.match(block, /2004-09-03 03:33 Osaka, Japan/);
    assert.match(block, /^Age: 22 \(computed from the birthday\)$/m);
    assert.match(block, /^Sun: Virgo$/m);
    assert.match(block, /Cats/);
    assert.match(block, /Beaches/);
    assert.match(block, /Martial arts/);
    assert.match(block, /baggy clothes/i);
    assert.match(block, /Clowns/);
    assert.match(block, /Smelly things/);
    assert.match(block, /Cheap clothes/);
    assert.match(block, /Open-ended questions/);
    assert.match(block, /Bratty/);
    assert.match(block, /Kind-hearted/);
    assert.match(block, /Tiramisu/);
    assert.match(block, /80s Japanese pop/);
    assert.doesNotMatch(block, /\{"line"/);
    assert.doesNotMatch(block, /\*[^*]+\*/);

    const system = composeGrokSystem(RAI_SYSTEM, "MEMORY FACTS\nname: Tylo", ON_2026_10_18);
    assert.ok(system.startsWith(RAI_SYSTEM));
    assert.match(system, /PROFILE\nSource of truth/);
    assert.match(system, /Age: 22/);
    assert.ok(system.endsWith("MEMORY FACTS\nname: Tylo"));
    assert.match(RAI_SYSTEM, /\{"line":/);
    assert.doesNotMatch(RAI_SYSTEM, /Tan skin|Mid-20s|Fukuoka/);
  });

  it("answers from the profile in the local brain, in her voice", () => {
    assert.equal(profileLocalLine("how old are you", ON_2026_10_18), "22. Don't make it a thing~");
    assert.match(profileLocalLine("what do you like") ?? "", /Cats, beaches, martial arts/);
    assert.match(profileLocalLine("what do you hate") ?? "", /Clowns/);
    assert.match(profileLocalLine("what do you hate") ?? "", /Cheap clothes/);
    assert.match(profileLocalLine("what do you hate") ?? "", /Open-ended questions/);
    assert.match(profileLocalLine("what's your favorite food") ?? "", /Tonkotsu ramen/);
    assert.equal(profileLocalLine("I like cats"), null);

    const act = composeAct([{ role: "user", content: "what are you like" }], "", "idle");
    assert.equal(act.line, "Bratty. Kind if you're straight with me.");
    assert.equal(act.source, "local");
    assert.doesNotMatch(act.line, /\{|stage direction|\*/);
  });

  it("feeds Chart her birth data and keeps the short bio off the stage menu", () => {
    assert.equal(HER_CHART.birth_date, STAR_RAI.birthday);
    assert.equal(HER_CHART.birth_time, STAR_RAI.birthTime);
    assert.equal(HER_CHART.birth_place, STAR_RAI.birthplace);
    assert.equal(HER_CHART.her_sun, "Virgo");
    assert.equal(sunFromBirthDate(STAR_RAI.birthday), STAR_RAI.sunSign);
    assert.equal(starRaiBirthdayLine(), "Sept 3.");
    assert.match(starRaiOriginLine(), /^Osaka\./);
    assert.doesNotMatch(starRaiOriginLine(), /Fukuoka/);

    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const settings = app.slice(app.indexOf('SheetTitle className="font-display text-xl">Settings'));
    assert.match(settings, /data-star-rai-bio/);
    assert.match(settings, /starRaiShortBio\(\)/);
    assert.equal(starRaiShortBio().length < 120, true);
    const menu = readFileSync(join(root, "src/components/stage-menu.tsx"), "utf8");
    assert.doesNotMatch(menu, /starRaiShortBio|data-star-rai-bio/);
    assert.deepEqual(
      STAGE_MENU_ITEMS.map((item) => item.id),
      ["settings", "memory", "voice"],
    );
  });
});
