import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCAFFOLD_VRM_FILE,
  WIP_GLB_FILE,
  rigFor,
  wipFaceFor,
  wipHandFor,
} from "./vrm-rig.ts";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "../../public");

describe("lab mesh contract", () => {
  it("points Lab at the authored WIP glb, not a booth VRM", () => {
    assert.equal(WIP_GLB_FILE, "models/star-rai-wip.glb");
    assert.equal(SCAFFOLD_VRM_FILE, "models/scaffolding/sairi-ponytail.vrm");
    assert.equal(existsSync(join(publicRoot, WIP_GLB_FILE)), true);
    assert.equal(existsSync(join(publicRoot, "models/star-standin.vrm")), false);
    assert.equal(existsSync(join(publicRoot, SCAFFOLD_VRM_FILE)), true);
    const magic = readFileSync(join(publicRoot, WIP_GLB_FILE)).subarray(0, 4).toString("ascii");
    assert.equal(magic, "glTF");
  });

  it("ships no kiss morph on the WIP glb", () => {
    const glb = readFileSync(join(publicRoot, WIP_GLB_FILE));
    assert.equal(glb.includes("kiss"), false);
    assert.equal(glb.includes("blowKiss"), false);
    assert.equal(glb.includes("heartHands"), false);
    assert.equal(glb.includes("mouthShy"), true);
    assert.equal(glb.includes("handWaveR"), true);
    assert.equal(glb.includes("handPointR"), true);
    assert.equal(glb.includes("blushShy"), true);
    assert.equal(glb.includes("starStudL"), true);
    assert.equal(glb.includes("hairBang"), true);
    assert.equal(glb.includes("ahoge"), true);
    assert.equal(glb.includes("button5"), true);
  });
});

describe("rigFor A-pose rest", () => {
  it("does not apply T-pose arm drop on the WIP idle glare", () => {
    const wip = rigFor("idle", "bratty", true);
    assert.equal(wip.leftUpperArm, undefined);
    assert.equal(wip.rightUpperArm, undefined);
    const tPose = rigFor("idle", "bratty", false);
    assert.ok(tPose.leftUpperArm);
    assert.ok((tPose.leftUpperArm?.z ?? 0) > 1);
  });

  it("raises the WIP wave from hanging arms, not T-pose extras", () => {
    const wave = rigFor("wave", "bratty", true);
    assert.ok((wave.rightUpperArm?.z ?? 0) < -1);
  });

  it("keeps scold, shy, and pout distinct on both WIP and T-pose maps", () => {
    const scold = rigFor("scold", "bratty", true);
    const shy = rigFor("shy", "bratty", true);
    const pout = rigFor("pout", "bratty", true);
    assert.notDeepEqual(scold, shy);
    assert.notDeepEqual(scold, pout);
    assert.notDeepEqual(shy, pout);
    assert.ok((scold.rightUpperArm?.x ?? 0) < -1, "scold points");
    assert.ok((scold.leftUpperArm?.z ?? 0) > 0.6, "scold left hand on hip");
    assert.ok((scold.leftUpperLeg?.z ?? 0) > 0.1, "scold stance is wider");
    assert.ok(Math.abs(pout.leftLowerArm?.z ?? 0) > 1, "pout folds arms across the chest");
    assert.ok(Math.abs(shy.leftLowerArm?.z ?? 0) < 0.6, "shy fidgets, does not cross");
    assert.ok((shy.head?.x ?? 0) > 0.25, "shy looks down");
    assert.ok((shy.leftUpperArm?.x ?? 0) < -0.3, "shy arms come forward to the waist");
    const tScold = rigFor("scold", "bratty", false);
    const tShy = rigFor("shy", "bratty", false);
    const tPout = rigFor("pout", "bratty", false);
    assert.notDeepEqual(tScold, tShy);
    assert.notDeepEqual(tScold, tPout);
    assert.notDeepEqual(tShy, tPout);
    assert.ok((tPout.leftLowerArm?.y ?? 0) > 0.5, "T-pose pout also crosses");
  });

  it("checks in the first expression set as canon stills, not a kiss sheet", () => {
    const canon = join(dirname(fileURLToPath(import.meta.url)), "../../artifacts/star-rai-canon");
    for (const file of [
      "00-brief.txt",
      "01-front-idle.png",
      "02-three-quarter.png",
      "06-talk.png",
      "07-wave.png",
      "08-scold.png",
      "09-pout.png",
      "10-shy.png",
    ]) {
      assert.equal(existsSync(join(canon, file)), true, file);
    }
    const brief = readFileSync(join(canon, "00-brief.txt"), "utf8");
    assert.match(brief, /scold/);
    assert.match(brief, /Kiss = NO/);
    assert.equal(existsSync(join(canon, "kiss.png")), false);
  });

  it("does not alias scold/shy/pout faces and never maps kiss or heart-hands", () => {
    assert.equal(wipFaceFor("scold", false), "grit");
    assert.equal(wipFaceFor("shy", false), "shy");
    assert.equal(wipFaceFor("pout", false), "pout");
    assert.equal(wipFaceFor("wave", false), "smirk");
    assert.equal(wipFaceFor("talk", false), "talkSmile");
    assert.equal(wipFaceFor("idle", false), "glare");
    assert.equal(wipFaceFor("idle", true), "talkSmile");
    assert.equal(wipFaceFor("hearts", false), "glare");
    assert.notEqual(wipFaceFor("scold", true), wipFaceFor("shy", true));
    assert.notEqual(wipFaceFor("scold", true), wipFaceFor("pout", true));
    assert.notEqual(wipFaceFor("shy", true), wipFaceFor("pout", true));
    assert.equal(wipFaceFor("kiss" as never, false), "glare");
    assert.equal(wipHandFor("wave"), "wavePalm");
    assert.equal(wipHandFor("scold"), "point");
    assert.equal(wipHandFor("pout"), "default");
    assert.equal(wipHandFor("shy"), "default");
    assert.equal(wipHandFor("idle"), "default");
    const hearts = rigFor("hearts", "bratty", true);
    assert.equal(hearts.leftUpperArm, undefined);
    assert.equal(hearts.rightUpperArm, undefined);
  });
});
