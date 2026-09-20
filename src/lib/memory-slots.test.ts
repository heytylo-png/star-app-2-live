import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MEMORY_SLOTS_CONTRACT, RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";
import {
  applySlotPatch,
  composeGrokSystem,
  extractName,
  extractRole,
  extractSlotsFromUserText,
  formatMemoryFacts,
  HER_BIO_TOPIC_RE,
  migrateItemsToSlots,
  type MemorySlotState,
} from "./memory-slots.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("memory slots contract", () => {
  it("matches artifacts/star-rai-memory-slots.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-rai-memory-slots.txt"), "utf8");
    assert.equal(MEMORY_SLOTS_CONTRACT, disk);
  });

  it("is a slot contract, not a bio topic list", () => {
    assert.match(MEMORY_SLOTS_CONTRACT, /STAR RAI — MEMORY SLOTS/);
    assert.match(MEMORY_SLOTS_CONTRACT, /never default cameraman/);
    assert.match(MEMORY_SLOTS_CONTRACT, /Do not send empty slots/);
    assert.match(MEMORY_SLOTS_CONTRACT, /Lore bio stays in the voice card/);
    assert.match(MEMORY_SLOTS_CONTRACT, /user_birth_date/);
    assert.match(MEMORY_SLOTS_CONTRACT, /Never send user_rising/);
    assert.match(MEMORY_SLOTS_CONTRACT, /session_on/);
    assert.match(MEMORY_SLOTS_CONTRACT, /daily_playlist/);
    assert.match(MEMORY_SLOTS_CONTRACT, /star-life-one-pager/);
    assert.match(MEMORY_SLOTS_CONTRACT, /star-rai-clock/);
    assert.match(MEMORY_SLOTS_CONTRACT, /CLOCK block/);
    assert.match(MEMORY_SLOTS_CONTRACT, /star-rai-horoscope-cheap/);
    assert.match(MEMORY_SLOTS_CONTRACT, /sun_sign_today/);
    assert.doesNotMatch(MEMORY_SLOTS_CONTRACT, /\bFukuoka\b/);
  });
});

describe("formatMemoryFacts", () => {
  it("returns empty when nothing is known", () => {
    assert.equal(formatMemoryFacts({}), "");
  });

  it("omits empty slots and default cameraman", () => {
    const block = formatMemoryFacts(
      { name: "Tylo", mood: "", role: undefined },
      { streakDays: 1, relationship: "Familiar" },
    );
    assert.match(block, /^MEMORY FACTS\n/);
    assert.match(block, /^name: Tylo$/m);
    assert.match(block, /^relationship: Familiar$/m);
    assert.doesNotMatch(block, /^mood:/m);
    assert.doesNotMatch(block, /^role:/m);
    assert.doesNotMatch(block, /cameraman/i);
    assert.doesNotMatch(block, /^streak:/m);
  });

  it("includes streak only at 2+ days and chart/life only when filled", () => {
    const slots: MemorySlotState = {
      last_topic: "night talking",
      last_choice: "wave",
      chart: { date: "saturday", time: "7pm", place: "Shibuya" },
      life: { on: true, now_playing: "lo-fi", mood_tag: "smug" },
    };
    const block = formatMemoryFacts(slots, { streakDays: 3, relationship: "Close" });
    assert.match(block, /^last_topic: night talking$/m);
    assert.match(block, /^last_choice: wave$/m);
    assert.match(block, /^streak: 3 days$/m);
    assert.match(block, /^relationship: Close$/m);
    assert.match(block, /^date: saturday$/m);
    assert.match(block, /^time: 7pm$/m);
    assert.match(block, /^place: Shibuya$/m);
    assert.match(block, /^session_on: true$/m);
    assert.match(block, /^now_playing: lo-fi$/m);
    assert.match(block, /^mood_tag: smug$/m);
  });

  it("omits chart when empty and life when the session is off", () => {
    const block = formatMemoryFacts({
      chart: { date: "  ", place: "" },
      life: { on: false, now_playing: "lo-fi" },
    });
    assert.equal(block, "");
  });

  it("omits now_playing/playlist when the session is on but those fields are empty", () => {
    const block = formatMemoryFacts({ name: "Tylo", life: { on: true } });
    assert.match(block, /^name: Tylo$/m);
    assert.match(block, /^session_on: true$/m);
    assert.doesNotMatch(block, /now_playing|mood_tag|daily_playlist/);
  });

  it("omits standing Life keys when session is off even if a playlist is stored", () => {
    const block = formatMemoryFacts({
      name: "Tylo",
      life: {
        on: false,
        daily_playlist: ["Super Shy", "ETA", "Cool With You", "How Sweet"],
      },
    });
    assert.match(block, /^name: Tylo$/m);
    assert.doesNotMatch(block, /session_on|now_playing|daily_playlist|mood_tag/);
  });

  it("emits natal Chart v1 keys when filled and never rising or her bio", () => {
    const block = formatMemoryFacts({
      user_birth_date: "1994-04-12",
      user_birth_time: "14:00",
      user_birth_place: "Chicago",
      user_sun: "Aries",
      chart_source: "setup",
    });
    assert.match(block, /^user_birth_date: 1994-04-12$/m);
    assert.match(block, /^user_birth_time: 14:00$/m);
    assert.match(block, /^user_birth_place: Chicago$/m);
    assert.match(block, /^user_sun: Aries$/m);
    assert.match(block, /^chart_source: setup$/m);
    assert.doesNotMatch(block, /user_rising|her_sun|Fukuoka|Libra/);
  });

  it("does not dump timezone into MEMORY FACTS (CLOCK owns it)", () => {
    const block = formatMemoryFacts({ name: "Tylo", timezone: "America/Los_Angeles" });
    assert.match(block, /^name: Tylo$/m);
    assert.doesNotMatch(block, /timezone|America\/Los_Angeles/);
  });

  it("never emits her bio as topics", () => {
    const block = formatMemoryFacts({ name: "Tylo" }, { relationship: "Stranger" });
    assert.doesNotMatch(block, HER_BIO_TOPIC_RE);
    assert.doesNotMatch(block, /Fukuoka|Osaka|Libra|parents|abroad/i);
    assert.doesNotMatch(block, /Known facts about this person/);
  });
});

describe("extractSlotsFromUserText", () => {
  it("fills name when they say it; never invents one", () => {
    assert.equal(extractName("My name is Tylo"), "Tylo");
    assert.equal(extractName("Hey. Just got here."), undefined);
    assert.equal(extractName("Remember that I like talking to you at night."), undefined);
    assert.equal(extractName("My name is the person talking"), undefined);
    const patch = extractSlotsFromUserText("Call me Sam.");
    assert.equal(patch.name, "Sam");
  });

  it("sets role only on explicit role language — no default cameraman", () => {
    assert.equal(extractRole("Hey."), undefined);
    assert.equal(extractRole("I'm an engineer"), undefined);
    assert.equal(extractRole("I live in Tokyo"), undefined);
    assert.equal(extractRole("I'm your photographer"), "photographer");
    assert.equal(extractRole("My role is cameraman"), "cameraman");
    const none = extractSlotsFromUserText("Who are you supposed to be?");
    assert.equal(none.role, undefined);
    const stated = extractSlotsFromUserText("I'm your cameraman.");
    assert.equal(stated.role, "cameraman");
    const rejected = extractSlotsFromUserText("I'm not your cameraman.");
    assert.equal(rejected.role, "");
  });

  it("does not put city or birthday into chart without a date setup", () => {
    const city = extractSlotsFromUserText("I live in Tokyo. My birthday is March 5.");
    assert.equal(city.chart, undefined);
    assert.equal(city.role, undefined);
    assert.equal(city.name, undefined);
  });

  it("fills chart slots from a meetup line", () => {
    const patch = extractSlotsFromUserText("Let's meet Saturday at 7pm in Shibuya.");
    assert.equal(patch.chart?.date, "saturday");
    assert.equal(patch.chart?.time, "7pm");
    assert.equal(patch.chart?.place, "Shibuya");
  });

  it("starts a life session from now playing and omits it after stop", () => {
    const on = extractSlotsFromUserText("I'm listening to lo-fi beats.");
    assert.equal(on.life?.on, true);
    assert.match(on.life?.now_playing ?? "", /lo-fi/i);
    const off = extractSlotsFromUserText("stop listening", {}, { life: { on: true, now_playing: "lo-fi" } });
    assert.equal(off.life?.on, false);
  });

  it("does not treat Super Shy as a shy pose command", () => {
    const patch = extractSlotsFromUserText("I'm listening to Super Shy.");
    assert.equal(patch.life?.now_playing, "Super Shy");
    assert.equal(patch.last_choice, undefined);
  });

  it("updates last_choice from a pose command without dumping it as last_topic", () => {
    const patch = extractSlotsFromUserText("wave", { lastChoice: "wave" });
    assert.equal(patch.last_choice, "wave");
    assert.equal(patch.last_topic, undefined);
  });

  it("stores last_topic from a real chat line, not her bio", () => {
    const patch = extractSlotsFromUserText("Remember that I like talking to you at night.");
    assert.match(patch.last_topic ?? "", /talking to you at night/i);
    const bio = extractSlotsFromUserText("Fukuoka");
    assert.equal(bio.last_topic, undefined);
  });

  it("records user mood when they state it — does not invent", () => {
    assert.equal(extractSlotsFromUserText("I'm tired.").mood, "tired");
    assert.match(extractSlotsFromUserText("I'm tired.").last_topic ?? "", /tired/i);
    assert.equal(extractSlotsFromUserText("Hey.").mood, undefined);
  });

  it("sets timezone only from explicit zone language, never Fukuoka lore", () => {
    assert.equal(extractSlotsFromUserText("My timezone is America/New_York").timezone, "America/New_York");
    assert.equal(extractSlotsFromUserText("I'm on Central time").timezone, "America/Chicago");
    assert.equal(extractSlotsFromUserText("I live in Fukuoka").timezone, undefined);
  });
});

describe("migrateItemsToSlots", () => {
  it("promotes a stored name fact and ignores city/job dumps as role", () => {
    const slots = migrateItemsToSlots(
      [
        { text: "They live in Tokyo" },
        { text: "Their name is Tylo" },
        { text: "Their job: engineer" },
      ],
      {},
    );
    assert.equal(slots.name, "Tylo");
    assert.equal(slots.role, undefined);
    assert.equal(slots.chart, undefined);
  });
});

describe("composeGrokSystem", () => {
  it("is voice card plus filled slots only", () => {
    const facts = formatMemoryFacts({ name: "Tylo", last_choice: "wave" }, { relationship: "Familiar" });
    const system = composeGrokSystem(RAI_SYSTEM, facts);
    assert.ok(system.startsWith(RAI_SYSTEM));
    assert.ok(system.endsWith(facts));
    assert.equal(system, `${RAI_SYSTEM}\n\n${facts}`);
    assert.match(system, /STAR RAI — VOICE CARD/);
    assert.match(system, /MEMORY FACTS\nname: Tylo\nlast_choice: wave\nrelationship: Familiar/);
    assert.doesNotMatch(system, /Known facts about this person/);
    assert.doesNotMatch(system, /Tone: Keep some distance/);
    const factsPart = system.slice(RAI_SYSTEM.length);
    assert.doesNotMatch(factsPart, /Fukuoka|Osaka|Libra/);
    assert.match(RAI_SYSTEM, /LORE USE/);
  });

  it("does not append a blank facts block", () => {
    assert.equal(composeGrokSystem(RAI_SYSTEM, ""), RAI_SYSTEM);
    assert.equal(composeGrokSystem(RAI_SYSTEM, "  "), RAI_SYSTEM);
    assert.equal(composeGrokSystem(RAI_SYSTEM, null), RAI_SYSTEM);
  });
});

describe("applySlotPatch", () => {
  it("keeps prior name when a later turn has no name", () => {
    const first = applySlotPatch({}, { name: "Tylo" });
    const second = applySlotPatch(first, { last_topic: "night chats" });
    assert.equal(second.name, "Tylo");
    assert.equal(second.last_topic, "night chats");
  });
});
