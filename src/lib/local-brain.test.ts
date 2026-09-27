import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { actToJson, composeAct } from "./brain.ts";
import {
  localBrainKeyFor,
  localBrainPoseKeys,
  parseLocalBrain,
  pickLocalBrainLine,
  poseFromBrainKey,
  resetLocalBrainLastLine,
  usedDefaultBank,
} from "./local-brain.ts";
import { isValidActJson, streamSpokenAct } from "./rai.ts";
import { LOCAL_BRAIN_SOURCE } from "./generated/star-rai-artifacts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("local brain table", () => {
  it("matches artifacts/star-rai-local-brain.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-rai-local-brain.txt"), "utf8");
    assert.equal(LOCAL_BRAIN_SOURCE, disk);
  });

  it("parses pose-keyed rows and skips kiss", () => {
    const map = parseLocalBrain();
    assert.equal(map.has("kiss"), false);
    assert.ok((map.get("wave")?.length ?? 0) >= 2);
    assert.ok((map.get("hold")?.length ?? 0) >= 2);
    assert.ok((map.get("talk")?.length ?? 0) >= 2);
    assert.ok((map.get("point")?.length ?? 0) >= 2);
    assert.ok((map.get("scold")?.length ?? 0) >= 2);
    assert.ok((map.get("_default")?.length ?? 0) >= 1);
    assert.ok(localBrainPoseKeys().includes("wave"));
    assert.ok(!localBrainPoseKeys().includes("kiss"));
    assert.ok(!localBrainPoseKeys().includes("_correction"));
    assert.ok(!localBrainPoseKeys().includes("_permission"));
    assert.ok((map.get("_correction")?.length ?? 0) >= 2);
    assert.ok((map.get("_permission")?.length ?? 0) >= 2);
  });

  it("picks a wave line from the table and avoids lastLine", () => {
    resetLocalBrainLastLine();
    const first = pickLocalBrainLine("wave", "");
    assert.match(first.line, /Waving|Hand's up/);
    assert.ok(first.emotion === "bratty" || first.emotion === "hype");
    const second = pickLocalBrainLine("wave", first.line);
    assert.notEqual(second.line, first.line);
  });

  it("uses idle lines for unknown keys; kiss key does not exist", () => {
    assert.equal(usedDefaultBank("kiss"), true);
    assert.equal(usedDefaultBank("nope"), true);
    assert.equal(usedDefaultBank("three_quarter"), true);
    assert.equal(usedDefaultBank("wave"), false);
    assert.equal(usedDefaultBank("_correction"), false);
    assert.equal(usedDefaultBank("_permission"), false);
    resetLocalBrainLastLine();
    const idle = (parseLocalBrain().get("idle") ?? []).map((row) => row.line);
    const row = pickLocalBrainLine("not-a-pose");
    assert.ok(idle.includes(row.line));
    assert.equal(poseFromBrainKey("_default"), null);
    assert.equal(poseFromBrainKey("kiss"), null);
    assert.equal(poseFromBrainKey("not-a-pose"), null);
    assert.equal(poseFromBrainKey("wave"), "wave");
    assert.equal(poseFromBrainKey("three_quarter"), "three_quarter");
  });

  it("cycles a pose without repeating the last line and continues after reload", () => {
    const store = new Map<string, string>();
    const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
    try {
      resetLocalBrainLastLine();
      const wave = (parseLocalBrain().get("wave") ?? []).map((row) => row.line);
      assert.equal(wave.length, 2);
      const first = pickLocalBrainLine("wave", "");
      const second = pickLocalBrainLine("wave", first.line);
      const third = pickLocalBrainLine("wave", second.line);
      assert.equal(first.line, wave[0]);
      assert.equal(second.line, wave[1]);
      assert.notEqual(second.line, first.line);
      assert.equal(third.line, wave[0]);
      const saved = store.get("star-rai-local-brain-index");
      assert.ok(saved);
      assert.equal(JSON.parse(saved).wave, 0);
      store.set("star-rai-local-brain-index", JSON.stringify({ wave: 0 }));
      resetLocalBrainLastLine();
      store.set("star-rai-local-brain-index", JSON.stringify({ wave: 0 }));
      const continued = pickLocalBrainLine("wave", "");
      assert.equal(continued.line, wave[1]);
      assert.notEqual(continued.line, wave[0]);
    } finally {
      resetLocalBrainLastLine();
      if (previous) Object.defineProperty(globalThis, "localStorage", previous);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it("keeps every spec line short and free of fallback meta", () => {
    const banned =
      /\b(?:offline|ai|model|api|key|connection|error)\b|i can(?:'|’)t reach/i;
    const rows = [...parseLocalBrain().values()].flat();
    assert.ok(rows.length > 10);
    for (const row of rows) {
      assert.doesNotMatch(row.line, banned, row.line);
      assert.equal(row.line.includes("\n"), false, row.line);
      assert.doesNotMatch(row.line, /\|/);
      if (row.poseKey.startsWith("_")) continue;
      const words = row.line.trim().split(/\s+/).filter(Boolean);
      assert.ok(words.length >= 2 && words.length <= 12, `${row.poseKey}: ${row.line}`);
    }
  });
});

describe("composeAct local-brain path", () => {
  it("echoes a named pose and uses that key's line", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "wink" }], undefined, "idle");
    assert.equal(act.pose, "wink");
    assert.match(act.line, /Wink|One eye/);
    assert.equal(localBrainKeyFor({ userText: "wink", currentPose: "idle" }).named, "wink");
  });

  it("kiss stays unmapped and keeps a dedicated current body", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "kiss" }], undefined, "wave");
    assert.equal(act.pose, "wave");
    assert.match(act.line, /Waving|Hand's up/);
    assert.equal(localBrainKeyFor({ userText: "kiss", currentPose: "wave" }).named, false);
    assert.equal(localBrainKeyFor({ userText: "kiss", currentPose: "wave" }).keepCurrent, true);
  });

  it("does not read a track title as a pose command", () => {
    resetLocalBrainLastLine();
    const act = composeAct(
      [{ role: "user", content: "I'm listening to Super Shy" }],
      undefined,
      "idle",
    );
    assert.notEqual(act.pose, "shy");
    assert.notEqual(act.pose, "idle");
    assert.equal(
      localBrainKeyFor({
        userText: "I'm listening to Super Shy",
        currentPose: "idle",
        ignoreNamedPose: true,
      }).named,
      null,
    );
    assert.equal(localBrainKeyFor({ userText: "shy", currentPose: "idle" }).named, "shy");
  });

  it("tints generic chat off frown idle onto the spoken bubble", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "Hey. Just got here." }], undefined, "idle");
    assert.ok(act.pose === "talk" || act.pose === "smug");
    assert.notEqual(act.pose, "idle");
    assert.doesNotMatch(act.line, /Just got here|heard that/i);
    assert.match(act.line, /Say more|I'm with you|Keep going|I'm here|Facing you|You seeing this/);
    assert.doesNotMatch(act.line, /Don't flinch/i);
  });

  it("does not let a local line's emotion swap the body to smug", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "still around" }], undefined, "idle");
    assert.equal(act.emotion, "bratty");
    assert.notEqual(act.pose, "smug");
    const json = actToJson(act);
    const poses = new Set<string>();
    for (let i = 1; i <= json.length; i++) {
      const streamed = streamSpokenAct(json.slice(0, i), {
        namedPose: null,
        currentPose: "idle",
        seed: "still around",
      });
      if (streamed) poses.add(streamed.pose);
    }
    assert.equal(poses.has("smug"), false);
    assert.equal(act.line.includes("\n"), false);
  });

  it("kiss at idle keeps idle and an idle line", () => {
    resetLocalBrainLastLine();
    const idle = (parseLocalBrain().get("idle") ?? []).map((row) => row.line);
    for (const text of ["kiss", "blow me a kiss", "kiss me"]) {
      resetLocalBrainLastLine();
      const act = composeAct([{ role: "user", content: text }], undefined, "idle");
      assert.equal(act.pose, "idle", text);
      assert.ok(idle.includes(act.line), `${text} -> ${act.line}`);
      assert.equal(act.emotion, "bratty");
    }
  });

  it("bare greetings never use talk rows", () => {
    const talk = new Set((parseLocalBrain().get("talk") ?? []).map((row) => row.line));
    for (const text of ["hi", "hello", "hey"]) {
      resetLocalBrainLastLine();
      const act = composeAct([{ role: "user", content: text }], undefined, "idle");
      assert.equal(talk.has(act.line), false, `${text} -> ${act.line}`);
      assert.doesNotMatch(act.line, /Talking\. Keep up|Mouth's moving/i);
    }
  });

  it("I am tired returns no zodiac text", () => {
    resetLocalBrainLastLine();
    const zodiac = /\b(?:horoscope|zodiac|libra|aries|sun sign|star sign)\b/i;
    const plain = composeAct([{ role: "user", content: "I am tired" }], undefined, "idle");
    assert.doesNotMatch(plain.line, zodiac, plain.line);
    const daily = composeAct([{ role: "user", content: "I am tired" }], undefined, "idle", {
      kind: "daily",
      localOnly: false,
      dateKey: "2026-09-27",
      tintPose: "content",
    });
    assert.doesNotMatch(daily.line, zodiac, daily.line);
    assert.equal(daily.line.includes("\n"), false);
  });

  it("keeps a missing pose body and speaks an idle line", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "kiss" }], undefined, "three_quarter");
    assert.equal(act.pose, "three_quarter");
    const idle = (parseLocalBrain().get("idle") ?? []).map((row) => row.line);
    assert.ok(idle.includes(act.line), act.line);
  });

  it("finger-front command keys middle_finger lines", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "finger-front" }], undefined, "idle");
    assert.equal(act.pose, "middle_finger");
    assert.match(act.line, /Finger up|This one's for you/);
  });

  it("point at me keys Helix point rows", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "point at me" }], undefined, "idle");
    assert.equal(act.pose, "point");
    assert.match(act.line, /Pointing at you|Finger out/);
  });

  it("user-named pose still wins on the local path", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "do a pout" }], undefined, "idle");
    assert.equal(act.pose, "pout");
  });
});

describe("isValidActJson", () => {
  it("accepts a voice-card act", () => {
    assert.equal(isValidActJson('{"line":"Hey.","emotion":"bratty"}'), true);
    assert.equal(isValidActJson('{"line":"Hey.","emotion":"bratty","pose":"wave"}'), true);
  });

  it("rejects missing line / bad JSON / empty", () => {
    assert.equal(isValidActJson(""), false);
    assert.equal(isValidActJson("not json"), false);
    assert.equal(isValidActJson("{}"), false);
    assert.equal(isValidActJson('{"emotion":"bratty"}'), false);
    assert.equal(isValidActJson('{"line":"   "}'), false);
  });
});
