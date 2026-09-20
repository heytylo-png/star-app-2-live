import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCAFFOLD_VRM_FILE,
  WIP_GLB_FILE,
  rigFor,
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
});
