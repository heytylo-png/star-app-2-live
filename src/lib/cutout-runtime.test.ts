import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RAI_CUTOUT_BONES, sampleGirlSkeleton } from "./cutout-sample.ts";
import {
  applyClip,
  boneOrder,
  clipForPose,
  CUTOUT_MIX_S,
  evaluateSlots,
  imagePaths,
  parseCutoutSkeleton,
  rigStatus,
  CutoutPlayer,
  worldFromLocals,
} from "./cutout-runtime.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("sample girl cutout", () => {
  it("is marked demo and is not an official PNG sheet", () => {
    const skel = sampleGirlSkeleton();
    assert.equal(skel.demo, true);
    assert.equal(skel.name, "sample-girl");
    assert.equal(imagePaths(skel).length, 0);
    const blob = JSON.stringify(skel);
    assert.doesNotMatch(blob, /rai\/idle|talk_official|kiss/);
  });

  it("shares the Rai bone names needed for idle/talk/wave/scold/pout/shy", () => {
    const skel = sampleGirlSkeleton();
    const names = new Set(skel.bones.map((b) => b.name));
    for (const bone of RAI_CUTOUT_BONES) {
      assert.ok(names.has(bone), `missing ${bone}`);
    }
    for (const pose of ["idle", "talk", "wave", "scold", "pout", "shy"]) {
      assert.ok(skel.animations[pose], pose);
      assert.equal(clipForPose(skel, pose).name, pose);
    }
  });

  it("parents every bone and evaluates a planted idle (no NaN, hip near origin child of root)", () => {
    const skel = sampleGirlSkeleton();
    assert.deepEqual(boneOrder(skel.bones)[0], "root");
    const player = new CutoutPlayer(skel);
    player.setPose("idle");
    player.update(0.5);
    const slots = player.evaluate();
    assert.ok(slots.length >= 12);
    for (const slot of slots) {
      assert.equal(Number.isFinite(slot.x), true, slot.name);
      assert.equal(Number.isFinite(slot.y), true, slot.name);
    }
    const head = slots.find((s) => s.name === "head");
    const foot = slots.find((s) => s.name === "footL");
    assert.ok(head && foot);
    assert.ok(head.y < foot.y, "head should be above feet in y-down space");
  });

  it("waves the character-right arm (screen left) relative to idle", () => {
    const skel = sampleGirlSkeleton();
    const idle = applyClip(skel, skel.animations.idle, 0);
    const wave = applyClip(skel, skel.animations.wave, 0.2);
    const idleWorld = worldFromLocals(skel, idle);
    const waveWorld = worldFromLocals(skel, wave);
    const idleHand = idleWorld.get("handR");
    const waveHand = waveWorld.get("handR");
    assert.ok(idleHand && waveHand);
    assert.ok(waveHand.y < idleHand.y - 20, `wave hand y ${waveHand.y} vs idle ${idleHand.y}`);
  });

  it("opens the jaw while talking and freezes under reduced motion", () => {
    const skel = sampleGirlSkeleton();
    const talking = new CutoutPlayer(skel);
    talking.setTalk(true, 1);
    talking.update(0.2);
    const jawTalk = talking.evaluate().find((s) => s.name === "mouth");
    const quiet = new CutoutPlayer(skel);
    quiet.setTalk(false, 0);
    quiet.update(0.2);
    const jawQuiet = quiet.evaluate().find((s) => s.name === "mouth");
    assert.ok(jawTalk && jawQuiet);
    assert.notEqual(jawTalk.attachment.name, jawQuiet.attachment.name);

    const reduced = new CutoutPlayer(skel);
    reduced.setReduced(true);
    reduced.setPose("wave");
    reduced.update(1);
    const a = reduced.evaluate().find((s) => s.name === "handR");
    reduced.update(1);
    const b = reduced.evaluate().find((s) => s.name === "handR");
    assert.ok(a && b);
    assert.equal(a.y, b.y);
  });

  it("crossfades pose clips on the PNG-puppet mix window", () => {
    assert.equal(CUTOUT_MIX_S, 0.38);
  });
});

describe("Rai skeleton stub", () => {
  it("lists cut layers that are not in the repo yet and is not ready to ship", () => {
    const raw = JSON.parse(readFileSync(join(root, "public/spine/rai/skeleton.json"), "utf8"));
    const skel = parseCutoutSkeleton(raw);
    assert.equal(skel.demo, false);
    assert.equal(skel.name, "star-rai-cutout");
    const names = new Set(skel.bones.map((b) => b.name));
    for (const bone of ["root", "hip", "jaw", "ahoge", "upperArmR", "handR", "skirt"]) {
      assert.ok(names.has(bone), bone);
    }
    const paths = imagePaths(skel);
    assert.ok(paths.some((p) => p.endsWith("mouth_open.png")));
    assert.ok(paths.every((p) => p.startsWith("spine/rai/layers/")));
    assert.ok(!paths.some((p) => /kiss|mouth_speak|face_eyes/i.test(p)));
    const status = rigStatus(skel, new Set());
    assert.equal(status.ready, false);
    assert.ok(status.missing.length >= 8);
    assert.equal(existsSync(join(root, "public/spine/rai/layers/head.png")), false);
    assert.ok(existsSync(join(root, "public/spine/rai/cut-guide.svg")));
    assert.ok(existsSync(join(root, "public/rive/README.md")));
  });

  it("does not evaluate official attachments without files", () => {
    const skel = parseCutoutSkeleton(
      JSON.parse(readFileSync(join(root, "public/spine/rai/skeleton.json"), "utf8")),
    );
    const locals = applyClip(skel, skel.animations.idle, 0);
    const world = worldFromLocals(skel, locals);
    const slots = evaluateSlots(skel, world, skel.animations.idle, 0);
    assert.ok(slots.length > 0);
    for (const slot of slots) {
      assert.ok(slot.attachment.path);
    }
  });
});
