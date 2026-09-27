import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elevenTtsPlan, requestElevenSpeech, speechTextForTts } from "./voice.ts";

describe("TTS emoticon strip", () => {
  it("drops a trailing :3 and keeps a clock time", () => {
    assert.equal(speechTextForTts("It's 8:30 here :3"), "It's 8:30 here");
  });

  it("keeps normal punctuation, times, and ratios", () => {
    assert.equal(speechTextForTts("It's 8:30 here."), "It's 8:30 here.");
    assert.equal(speechTextForTts("Hello, world!"), "Hello, world!");
    assert.equal(speechTextForTts("What's in my chart today?"), "What's in my chart today?");
    assert.equal(speechTextForTts("You're up early."), "You're up early.");
    assert.equal(speechTextForTts("Keep it 16:9, or 2:1."), "Keep it 16:9, or 2:1.");
    assert.equal(speechTextForTts("See you at 12:05."), "See you at 12:05.");
  });

  it("strips standalone ASCII emoticons", () => {
    assert.equal(speechTextForTts("Hey :D"), "Hey");
    assert.equal(speechTextForTts("Hey :P"), "Hey");
    assert.equal(speechTextForTts("Hey :p"), "Hey");
    assert.equal(speechTextForTts("Hey ;)"), "Hey");
    assert.equal(speechTextForTts("Hey :)"), "Hey");
    assert.equal(speechTextForTts("Hey :("), "Hey");
    assert.equal(speechTextForTts("Hey xD"), "Hey");
    assert.equal(speechTextForTts("Hey XD"), "Hey");
    assert.equal(speechTextForTts("Hey >_<"), "Hey");
    assert.equal(speechTextForTts("Hey ^^"), "Hey");
    assert.equal(speechTextForTts("Hey ^_^"), "Hey");
    assert.equal(speechTextForTts("Hey owo"), "Hey");
    assert.equal(speechTextForTts("Hey uwu"), "Hey");
    assert.equal(speechTextForTts("I <3 this"), "I this");
    assert.equal(speechTextForTts("Hey T_T"), "Hey");
    assert.equal(speechTextForTts("Hey :o"), "Hey");
    assert.equal(speechTextForTts("Hey -_-"), "Hey");
    assert.equal(speechTextForTts("Hey!!! :3"), "Hey!!!");
    assert.equal(speechTextForTts("Mix 2:1 :P"), "Mix 2:1");
  });

  it("strips parenthetical kaomoji, emoji, and action asterisks", () => {
    assert.equal(speechTextForTts("(＾▽＾) hi"), "hi");
    assert.equal(speechTextForTts("hi (maybe)"), "hi (maybe)");
    assert.equal(speechTextForTts("Meet (8:30)"), "Meet (8:30)");
    assert.equal(speechTextForTts("Cute 😊"), "Cute");
    assert.equal(speechTextForTts("Hi \u{1F468}\u200D\u{1F469}\u200D\u{1F467}"), "Hi");
    assert.equal(speechTextForTts("Hi \u263A\uFE0F"), "Hi");
    assert.equal(speechTextForTts("hello *giggles* there"), "hello there");
    assert.equal(speechTextForTts("hello *soft laugh* there"), "hello there");
  });

  it("does not call TTS when nothing speakable remains", async () => {
    for (const sample of [":3", ":D", "owo", "(＾▽＾)", "😊", "*giggles*", "  :3  "]) {
      assert.equal(speechTextForTts(sample), "");
    }
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      return new Response(null, { status: 204 });
    };
    assert.equal(elevenTtsPlan(":3", "speech-key", "voice-demo"), null);
    assert.equal(elevenTtsPlan("*giggles*", "speech-key", "voice-demo"), null);
    assert.equal(
      await requestElevenSpeech({ text: ":3", key: "speech-key", voiceId: "voice-demo", fetchImpl }),
      null,
    );
    assert.equal(calls.length, 0);

    const plan = elevenTtsPlan("It's 8:30 here :3", "speech-key", "voice-demo");
    assert.ok(plan);
    assert.equal(JSON.parse(plan.body).text, "It's 8:30 here");
    assert.match(plan.url, /\/v1\/text-to-speech\/voice-demo$/);
    assert.doesNotMatch(plan.url, /voices\/add|voice-generation|voice-design|\/edit/);
  });
});
