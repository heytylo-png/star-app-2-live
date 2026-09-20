import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { speakable } from "./companion.ts";
import { CALL_MODE_SOURCE, RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";
import { namedPoseFromText, resolveSpokenPose } from "./rai.ts";
import {
  CALL_STORE_RECORDINGS,
  callTranscriptAction,
  hangUpCallState,
  shouldEndCallOnPageEvent,
  shouldSpeakCallLine,
  spokenCallLine,
} from "./call.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Call mode artifact", () => {
  it("matches artifacts/star-rai-call-mode.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-rai-call-mode.txt"), "utf8");
    assert.equal(CALL_MODE_SOURCE, disk);
    assert.match(CALL_MODE_SOURCE, /STAR RAI — CALL MODE/);
    assert.match(CALL_MODE_SOURCE, /Tap phone to start Call mode/);
    assert.match(CALL_MODE_SOURCE, /Tap again to hang up/);
    assert.match(CALL_MODE_SOURCE, /Empty transcript/);
    assert.match(CALL_MODE_SOURCE, /same Chat brain path as typed Chat/);
    assert.match(CALL_MODE_SOURCE, /Speak line only/);
    assert.match(CALL_MODE_SOURCE, /Honor speaker mute/);
    assert.match(CALL_MODE_SOURCE, /store recordings/);
    assert.match(CALL_MODE_SOURCE, /Kiss stays unmapped/);
    assert.match(CALL_MODE_SOURCE, /No Chat music display strip/);
  });

  it("does not change the voice card output contract", () => {
    assert.match(RAI_SYSTEM, /\{"line":/);
    assert.match(RAI_SYSTEM, /LORE USE/);
    assert.match(CALL_MODE_SOURCE, /\{"line","emotion","pose"\}/);
  });
});

describe("empty transcript", () => {
  it("keeps listening and does not invent a user line", () => {
    assert.equal(callTranscriptAction(""), "keep_listening");
    assert.equal(callTranscriptAction("   "), "keep_listening");
    assert.equal(callTranscriptAction(null), "keep_listening");
    assert.equal(callTranscriptAction(undefined), "keep_listening");
  });

  it("sends a non-empty transcript on the same Chat path", () => {
    assert.equal(callTranscriptAction("Hey. Just got here."), "send");
    assert.equal(callTranscriptAction("  wave  "), "send");
  });
});

describe("mute + speakable line", () => {
  it("honors speaker mute and does not force TTS", () => {
    assert.equal(shouldSpeakCallLine({ voiceOn: false, line: "Catch this~" }), false);
    assert.equal(shouldSpeakCallLine({ voiceOn: true, line: "Catch this~" }), true);
  });

  it("speaks the line only — never JSON, memory list, or lore dump", () => {
    assert.equal(spokenCallLine('{"line":"Catch this~","emotion":"bratty","pose":"talk"}'), speakable("Catch this~"));
    assert.equal(spokenCallLine("Catch this~"), speakable("Catch this~"));
    assert.equal(spokenCallLine(""), "");
    assert.equal(speakable('{"emotion":"bratty","pose":"talk"}'), "");
    assert.ok(spokenCallLine("Life's fine. Don't ruin it :3"));
    assert.equal(spokenCallLine("MEMORY FACTS\nname: Tylo\nmood: tired"), "");
    assert.equal(spokenCallLine("LORE USE\nHer bio (Fukuoka, Osaka, parents, Libra, abroad)"), "");
    assert.equal(spokenCallLine("CHART\ntoday_date: 2026-09-19\nher_sun: Libra"), "");
  });

  it("still has a bubble line when TTS is skipped (mute or empty speakable)", () => {
    const line = "Catch this~";
    assert.equal(shouldSpeakCallLine({ voiceOn: false, line }), false);
    assert.ok(spokenCallLine(line));
  });
});

describe("hangup + page leave", () => {
  it("cleans mic + TTS flags without wiping thread / memory / sheet", () => {
    const after = hangUpCallState({
      callActive: true,
      listening: true,
      talking: true,
      threadMessageCount: 4,
      memoryCount: 2,
      pose: "wink",
    });
    assert.deepEqual(after, {
      callActive: false,
      listening: false,
      talking: false,
      threadMessageCount: 4,
      memoryCount: 2,
      pose: "wink",
    });
  });

  it("ends the call on hide / unload so the mic does not stay hot", () => {
    assert.equal(shouldEndCallOnPageEvent({ type: "visibilitychange", visibilityState: "hidden" }), true);
    assert.equal(shouldEndCallOnPageEvent({ type: "visibilitychange", visibilityState: "visible" }), false);
    assert.equal(shouldEndCallOnPageEvent({ type: "pagehide" }), true);
    assert.equal(shouldEndCallOnPageEvent({ type: "beforeunload" }), true);
    assert.equal(shouldEndCallOnPageEvent({ type: "freeze" }), true);
  });

  it("never stores recordings", () => {
    assert.equal(CALL_STORE_RECORDINGS, false);
  });
});

describe("pose commands + tint still apply on a voice turn", () => {
  it("named pose commands still resolve (sheet swaps first)", () => {
    assert.equal(namedPoseFromText("wave"), "wave");
    assert.equal(namedPoseFromText("kiss"), false);
  });

  it("pose tint applies to a spoken teasing line instead of idle-frown", () => {
    const pose = resolveSpokenPose({
      emotion: "bratty",
      spoken: true,
      seed: "Don't flinch :3",
    });
    assert.notEqual(pose, "idle");
    assert.equal(pose, "talk");
  });
});
