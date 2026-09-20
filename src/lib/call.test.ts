import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { speakable } from "./companion.ts";
import { CALL_MODE_SOURCE, RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";
import { namedPoseFromText, resolveSpokenPose } from "./rai.ts";
import {
  CALL_AUDIO_CONSTRAINTS,
  CALL_AUDIO_CONSTRAINTS_CHROME,
  CALL_FINAL_DEBOUNCE_MS,
  CALL_LISTEN_BACKOFF_MS,
  CALL_LISTEN_DURING_TTS,
  CALL_POST_TTS_COOLDOWN_MS,
  CALL_STORE_RECORDINGS,
  beginCallMicRequest,
  callMicNotice,
  callTranscriptAction,
  callUtteranceToSend,
  classifyGetUserMediaError,
  collapseDuplicateNgrams,
  gateCallUtterance,
  hangUpCallState,
  meaningfulTranscript,
  MIC_UNBLOCK_STEPS,
  nextCallListenBackoffMs,
  pushCallFinal,
  shouldEndCallOnPageEvent,
  shouldSpeakCallLine,
  shouldStartRecognitionOnError,
  speechRecErrorAction,
  spokenCallLine,
  stopMediaTracks,
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

  it("ignores very short finals and filler sounds", () => {
    assert.equal(callTranscriptAction("a"), "keep_listening");
    assert.equal(callTranscriptAction("."), "keep_listening");
    assert.equal(callTranscriptAction("uh"), "keep_listening");
    assert.equal(callTranscriptAction("um"), "keep_listening");
    assert.equal(callTranscriptAction("  hmm  "), "keep_listening");
    assert.equal(callTranscriptAction("ah"), "keep_listening");
    assert.equal(meaningfulTranscript("uhh"), "");
  });

  it("still sends real short words", () => {
    assert.equal(callTranscriptAction("hi"), "send");
    assert.equal(callTranscriptAction("ok"), "send");
    assert.equal(callTranscriptAction("no"), "send");
    assert.equal(callTranscriptAction("yes"), "send");
    assert.equal(callTranscriptAction("  wave  "), "send");
    assert.equal(callTranscriptAction("Hey. Just got here."), "send");
  });

  it("prefers finals and never sends noisy interim", () => {
    assert.equal(callUtteranceToSend({ finals: [], interim: "uh background tv" }), "");
    assert.equal(callUtteranceToSend({ finals: ["uh"], interim: "hey wait" }), "");
    assert.equal(callUtteranceToSend({ finals: ["Hey. Just got here."], interim: "noise" }), "Hey. Just got here.");
    assert.ok(CALL_FINAL_DEBOUNCE_MS >= 700);
    assert.ok(CALL_FINAL_DEBOUNCE_MS <= 900);
  });
});

describe("one utterance per submit", () => {
  it("waits for a 700–900ms pause before send", () => {
    assert.equal(CALL_FINAL_DEBOUNCE_MS, 800);
  });

  it("collapses immediate duplicate n-grams from hot STT", () => {
    const phrase = "who's your favorite artist";
    const repeated = Array.from({ length: 4 }, () => phrase).join(" ");
    assert.equal(collapseDuplicateNgrams(repeated), phrase);
    assert.equal(
      callUtteranceToSend({
        finals: [phrase, phrase, phrase, phrase],
      }),
      phrase,
    );
    assert.equal(collapseDuplicateNgrams("hello hello hello"), "hello");
    assert.equal(collapseDuplicateNgrams("no no"), "no no");
    assert.equal(collapseDuplicateNgrams("who is who is"), "who is");
  });

  it("drops duplicate finals instead of concatenating them", () => {
    const finals: string[] = [];
    assert.equal(pushCallFinal(finals, "who's your favorite artist"), true);
    assert.equal(pushCallFinal(finals, "who's your favorite artist"), false);
    assert.equal(pushCallFinal(finals, "who's your favorite artist who's your favorite artist"), false);
    assert.equal(pushCallFinal(finals, "  uh  "), false);
    assert.deepEqual(finals, ["who's your favorite artist"]);
    assert.equal(callUtteranceToSend({ finals }), "who's your favorite artist");
  });

  it("does not send while she is speaking or thinking", () => {
    const finals = ["who's your favorite artist"];
    assert.deepEqual(
      gateCallUtterance({ talking: true, sending: false, listenPausedForTts: false, finals }),
      { action: "keep_listening", text: "" },
    );
    assert.deepEqual(
      gateCallUtterance({ talking: false, sending: true, listenPausedForTts: false, finals }),
      { action: "keep_listening", text: "" },
    );
    assert.deepEqual(
      gateCallUtterance({ talking: false, sending: false, listenPausedForTts: true, finals }),
      { action: "keep_listening", text: "" },
    );
    assert.deepEqual(
      gateCallUtterance({ talking: false, sending: false, listenPausedForTts: false, finals }),
      { action: "send", text: "who's your favorite artist" },
    );
  });

  it("keeps listening on empty / garbage STT", () => {
    assert.deepEqual(
      gateCallUtterance({ talking: false, sending: false, listenPausedForTts: false, finals: [] }),
      { action: "keep_listening", text: "" },
    );
    assert.deepEqual(
      gateCallUtterance({ talking: false, sending: false, listenPausedForTts: false, finals: ["um"] }),
      { action: "keep_listening", text: "" },
    );
    assert.equal(callTranscriptAction(""), "keep_listening");
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

describe("Android Chrome mic permission", () => {
  it("starts getUserMedia synchronously from the tap with AEC / NS / AGC", () => {
    let called = false;
    const gum: Parameters<typeof beginCallMicRequest>[0] = (constraints) => {
      called = true;
      const audio = constraints.audio as MediaTrackConstraints;
      assert.equal(audio.echoCancellation, true);
      assert.equal(audio.noiseSuppression, true);
      assert.equal(audio.autoGainControl, true);
      assert.equal(
        (audio as MediaTrackConstraints & { googEchoCancellation?: boolean }).googEchoCancellation,
        true,
      );
      return Promise.resolve({ getTracks: () => [] } as unknown as MediaStream);
    };
    const pending = beginCallMicRequest(gum);
    assert.equal(called, true);
    assert.equal(typeof pending.then, "function");
    assert.equal(CALL_AUDIO_CONSTRAINTS.echoCancellation, true);
    assert.equal(CALL_AUDIO_CONSTRAINTS.noiseSuppression, true);
    assert.equal(CALL_AUDIO_CONSTRAINTS.autoGainControl, true);
    assert.equal(CALL_AUDIO_CONSTRAINTS_CHROME.echoCancellation, true);
  });

  it("retries without Chrome extras when the constraint set is rejected", async () => {
    const seen: MediaStreamConstraints[] = [];
    const gum: Parameters<typeof beginCallMicRequest>[0] = (constraints) => {
      seen.push(constraints);
      const err = Object.assign(new Error("overconstrained"), { name: "OverconstrainedError" });
      if (seen.length < 3) return Promise.reject(err);
      return Promise.resolve({ getTracks: () => [] } as unknown as MediaStream);
    };
    await beginCallMicRequest(gum);
    assert.equal(seen.length, 3);
    const first = seen[0]?.audio;
    const second = seen[1]?.audio;
    assert.equal(typeof first, "object");
    assert.equal((first as MediaTrackConstraints).echoCancellation, true);
    assert.equal(
      (second as MediaTrackConstraints & { googEchoCancellation?: boolean }).googEchoCancellation,
      undefined,
    );
    assert.equal(seen[2]?.audio, true);
  });

  it("classifies denied / blocked vs missing hardware", () => {
    assert.equal(classifyGetUserMediaError({ name: "NotAllowedError" }), "denied");
    assert.equal(classifyGetUserMediaError({ name: "PermissionDeniedError" }), "denied");
    assert.equal(classifyGetUserMediaError({ name: "NotFoundError" }), "unavailable");
    assert.equal(classifyGetUserMediaError({ name: "NotReadableError" }), "busy");
    assert.equal(classifyGetUserMediaError({ name: "SecurityError" }), "insecure");
  });

  it("tells them how to unblock heytylo-png.github.io", () => {
    const notice = callMicNotice("denied");
    assert.match(notice.title, /blocked/i);
    assert.match(notice.body, /heytylo-png\.github\.io/);
    assert.match(notice.body, /Microphone/);
    assert.match(MIC_UNBLOCK_STEPS, /Allow for heytylo-png\.github\.io/);
    assert.match(callMicNotice("no-speech-api").body, /webkitSpeechRecognition|speech input/i);
  });

  it("backs off after empty / no-speech instead of restarting from onerror", () => {
    assert.equal(speechRecErrorAction("no-speech", true), "backoff");
    assert.equal(speechRecErrorAction("aborted", true), "backoff");
    assert.equal(speechRecErrorAction("network", true), "backoff");
    assert.equal(speechRecErrorAction("not-allowed", true), "denied");
    assert.equal(speechRecErrorAction("service-not-allowed", false), "denied");
    assert.equal(speechRecErrorAction("audio-capture", false), "denied");
    assert.equal(speechRecErrorAction("audio-capture", true), "backoff");
    assert.equal(shouldStartRecognitionOnError("backoff"), false);
    assert.equal(shouldStartRecognitionOnError("denied"), false);
    assert.deepEqual([...CALL_LISTEN_BACKOFF_MS], [400, 700, 1100, 1600, 2200]);
    assert.equal(nextCallListenBackoffMs(0), 400);
    assert.equal(nextCallListenBackoffMs(4), 2200);
    assert.equal(nextCallListenBackoffMs(99), 2200);
  });

  it("does not listen while TTS plays her line", () => {
    assert.equal(CALL_LISTEN_DURING_TTS, false);
    assert.ok(CALL_POST_TTS_COOLDOWN_MS >= 300);
  });

  it("stops tracks without throwing", () => {
    let stopped = 0;
    stopMediaTracks({
      getTracks: () => [
        {
          stop: () => {
            stopped += 1;
          },
        },
      ],
    });
    stopMediaTracks(null);
    assert.equal(stopped, 1);
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
