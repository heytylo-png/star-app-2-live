import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import {
  localBrainKeyFor,
  localBrainPoseKeys,
  parseLocalBrain,
  pickLocalBrainLine,
  poseFromBrainKey,
  resetLocalBrainLastLine,
  usedDefaultBank,
} from "./local-brain.ts";
import { isValidActJson } from "./rai.ts";
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
  });

  it("picks a wave line from the table and avoids lastLine", () => {
    resetLocalBrainLastLine();
    const first = pickLocalBrainLine("wave", "");
    assert.match(first.line, /Waving|Hand's up/);
    assert.ok(first.emotion === "bratty" || first.emotion === "hype");
    const second = pickLocalBrainLine("wave", first.line);
    assert.notEqual(second.line, first.line);
  });

  it("uses _default for unknown keys; kiss key does not exist", () => {
    assert.equal(usedDefaultBank("kiss"), true);
    assert.equal(usedDefaultBank("nope"), true);
    assert.equal(usedDefaultBank("wave"), false);
    resetLocalBrainLastLine();
    const row = pickLocalBrainLine("not-a-pose");
    assert.ok(row.line.length > 0);
    assert.equal(poseFromBrainKey("_default"), null);
    assert.equal(poseFromBrainKey("kiss"), null);
    assert.equal(poseFromBrainKey("wave"), "wave");
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

  it("kiss no-ops pose and speaks from the current body key", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "kiss" }], undefined, "wave");
    assert.equal(act.pose, undefined);
    assert.match(act.line, /Waving|Hand's up/);
    assert.equal(localBrainKeyFor({ userText: "kiss", currentPose: "wave" }).named, false);
    assert.equal(localBrainKeyFor({ userText: "kiss", currentPose: "wave" }).keepCurrent, true);
  });

  it("omits pose on generic chat so the current sheet stays", () => {
    resetLocalBrainLastLine();
    const act = composeAct([{ role: "user", content: "Hey. Just got here." }], undefined, "idle");
    assert.equal(act.pose, undefined);
    assert.match(act.line, /Facing you|Don't flinch/);
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
