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

const RAI_LAYER_FILES = [
  "hair_back.png",
  "ahoge.png",
  "hair_front.png",
  "head.png",
  "brow.png",
  "mouth_closed.png",
  "mouth_open.png",
  "neck.png",
  "torso.png",
  "bow.png",
  "upper_arm_r.png",
  "forearm_r.png",
  "hand_r.png",
  "upper_arm_l.png",
  "forearm_l.png",
  "hand_l.png",
  "skirt.png",
  "thigh_r.png",
  "thigh_l.png",
  "calf_r.png",
  "calf_l.png",
  "foot_r.png",
  "foot_l.png",
] as const;

describe("Rai cutout layers", () => {
  it("ships official idle cuts under the README filenames and is ready when they load", () => {
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
    const layerDir = join(root, "public/spine/rai/layers");
    for (const file of RAI_LAYER_FILES) {
      const full = join(layerDir, file);
      assert.equal(existsSync(full), true, file);
      assert.ok(readFileSync(full).length > 80, `${file} empty`);
    }
    // Frozen cut pack — pose motion lives in skeleton.json timelines, not recuts.
    assert.equal(readFileSync(join(layerDir, "upper_arm_r.png")).length, 31437);
    assert.equal(readFileSync(join(layerDir, "hand_r.png")).length, 13686);
    assert.equal(readFileSync(join(layerDir, "mouth_open.png")).length, 9272);
    const present = new Set(paths);
    const status = rigStatus(skel, present);
    assert.equal(status.ready, true);
    assert.deepEqual(status.missing, []);
    assert.ok(existsSync(join(root, "public/spine/rai/cut-guide.svg")));
    assert.ok(existsSync(join(root, "public/rive/README.md")));
    assert.equal(existsSync(join(layerDir, "mouth_speak.png")), false);
    assert.equal(existsSync(join(layerDir, "face_eyes_closed.png")), false);
  });

  it("evaluates a planted idle from official attachments (head above feet)", () => {
    const skel = parseCutoutSkeleton(
      JSON.parse(readFileSync(join(root, "public/spine/rai/skeleton.json"), "utf8")),
    );
    const locals = applyClip(skel, skel.animations.idle, 0);
    const world = worldFromLocals(skel, locals);
    const slots = evaluateSlots(skel, world, skel.animations.idle, 0);
    assert.ok(slots.length > 0);
    for (const slot of slots) {
      assert.ok(slot.attachment.path);
      assert.equal(Number.isFinite(slot.x), true, slot.name);
      assert.equal(Number.isFinite(slot.y), true, slot.name);
    }
    const head = slots.find((s) => s.name === "head");
    const foot = slots.find((s) => s.name === "footL");
    assert.ok(head && foot);
    assert.ok(head.y < foot.y, "head should be above feet in y-down space");
  });

  it("authors bone motion so wave/scold/pout/shy are not bind pose", () => {
    const skel = parseCutoutSkeleton(
      JSON.parse(readFileSync(join(root, "public/spine/rai/skeleton.json"), "utf8")),
    );
    for (const pose of ["idle", "talk", "wave", "scold", "pout", "shy"] as const) {
      const clip = skel.animations[pose];
      assert.ok(clip, pose);
      const bones = clip.bones ?? {};
      assert.ok(Object.keys(bones).length > 0, `${pose} clip still has bones: {}`);
      const hasTimeline = Object.values(bones).some(
        (tl) => (tl.rotate?.length ?? 0) > 0 || (tl.x?.length ?? 0) > 0 || (tl.y?.length ?? 0) > 0,
      );
      assert.ok(hasTimeline, `${pose} has no rotate/translate keys`);
    }
    assert.equal(skel.animations.kiss, undefined);
    assert.equal(skel.poseToAnimation?.kiss, undefined);

    const idle = applyClip(skel, skel.animations.idle, 0);
    const idleWorld = worldFromLocals(skel, idle);
    const wave = applyClip(skel, skel.animations.wave, 0.2);
    const waveWorld = worldFromLocals(skel, wave);
    const idleHand = idleWorld.get("handR");
    const waveHand = waveWorld.get("handR");
    assert.ok(idleHand && waveHand);
    assert.ok(
      waveHand.y < idleHand.y - 80,
      `wave must raise her right arm (viewer left): y ${waveHand.y} vs idle ${idleHand.y}`,
    );
    const waveHandT1 = worldFromLocals(skel, applyClip(skel, skel.animations.wave, 0.4)).get("handR");
    assert.ok(waveHandT1);
    assert.ok(
      Math.abs(waveHandT1.rotation - waveHand.rotation) > 4 || Math.abs(waveHandT1.y - waveHand.y) > 8,
      "wave flap must move across the clip, not a held bind pose",
    );

    const scoldWorld = worldFromLocals(skel, applyClip(skel, skel.animations.scold, 0.2));
    const scoldHand = scoldWorld.get("handR");
    assert.ok(scoldHand);
    assert.ok(scoldHand.y < idleHand.y - 40, "scold must lift the pointing arm off bind pose");
    assert.ok(
      Math.abs(scoldHand.y - waveHand.y) > 40 || Math.abs(scoldHand.rotation - waveHand.rotation) > 20,
      "scold point must be distinct from wave",
    );

    const poutHead = applyClip(skel, skel.animations.pout, 0).get("head");
    const shyHead = applyClip(skel, skel.animations.shy, 0).get("head");
    const poutArmR = applyClip(skel, skel.animations.pout, 0).get("upperArmR");
    const shyArmR = applyClip(skel, skel.animations.shy, 0).get("upperArmR");
    assert.ok(poutHead && shyHead && poutArmR && shyArmR);
    assert.ok(poutHead.rotation < -3, `pout head tilt ${poutHead.rotation}`);
    assert.ok(shyHead.rotation > 6, `shy head tuck ${shyHead.rotation}`);
    assert.notEqual(Math.sign(poutHead.rotation), Math.sign(shyHead.rotation));
    assert.notEqual(poutArmR.rotation, shyArmR.rotation);
    assert.ok(shyArmR.rotation < 0, "shy covers with the right arm inward");

    const restHipY = idle.get("hip")!.y;
    let maxFootDy = 0;
    for (let t = 0; t <= 3.2; t += 0.1) {
      const w = worldFromLocals(skel, applyClip(skel, skel.animations.idle, t));
      const hip = applyClip(skel, skel.animations.idle, t).get("hip")!;
      assert.equal(hip.y, restHipY, "idle hip must stay planted (no float key)");
      const footL = w.get("footL")!;
      const footR = w.get("footR")!;
      maxFootDy = Math.max(
        maxFootDy,
        Math.abs(footL.y - idleWorld.get("footL")!.y),
        Math.abs(footR.y - idleWorld.get("footR")!.y),
      );
    }
    assert.ok(maxFootDy < 4, `idle feet floated ${maxFootDy}px`);
  });

  it("ports sample-girl rotate keys onto Rai wave/scold/pout/shy (y remapped to Rai rest)", () => {
    const sample = sampleGirlSkeleton();
    const rai = parseCutoutSkeleton(
      JSON.parse(readFileSync(join(root, "public/spine/rai/skeleton.json"), "utf8")),
    );
    const rot = (skel: { animations: typeof sample.animations }, pose: string, bone: string) =>
      (skel.animations[pose]?.bones?.[bone]?.rotate ?? []).map((k) => [k.time, k.value]);
    for (const [pose, bone] of [
      ["wave", "upperArmR"],
      ["wave", "forearmR"],
      ["wave", "handR"],
      ["wave", "upperArmL"],
      ["wave", "forearmL"],
      ["wave", "handL"],
      ["scold", "upperArmR"],
      ["scold", "forearmR"],
      ["scold", "handR"],
      ["scold", "upperArmL"],
      ["scold", "forearmL"],
      ["pout", "head"],
      ["pout", "upperArmL"],
      ["pout", "upperArmR"],
      ["shy", "upperArmL"],
      ["shy", "forearmL"],
      ["shy", "upperArmR"],
      ["shy", "forearmR"],
    ] as const) {
      assert.deepEqual(rot(rai, pose, bone), rot(sample, pose, bone), `${pose}.${bone}`);
    }
    const chestRest = rai.bones.find((b) => b.name === "chest")!.y;
    const chestKeys = rai.animations.idle!.bones!.chest!.y!.map((k) => k.value);
    assert.equal(chestKeys[0], chestRest);
    assert.ok(chestKeys.every((v) => Math.abs(v - chestRest) <= 4), "idle chest y stays near Rai rest");
    const torsoRest = rai.bones.find((b) => b.name === "torso")!.y;
    const talkY = rai.animations.talk!.bones!.torso!.y!.map((k) => k.value);
    assert.equal(talkY[0], torsoRest);
    assert.ok(!rai.animations.talk!.bones!.jaw, "talk mouth is skeleton.talk, not jaw keys");
  });

  it("keeps talk jaw/mouth and adds a light torso bob on the talk clip", () => {
    const skel = parseCutoutSkeleton(
      JSON.parse(readFileSync(join(root, "public/spine/rai/skeleton.json"), "utf8")),
    );
    const talking = new CutoutPlayer(skel);
    talking.setTalk(true, 1);
    talking.update(0.2);
    const jawTalk = talking.evaluate().find((s) => s.name === "mouth");
    const quiet = new CutoutPlayer(skel);
    quiet.setTalk(false, 0);
    quiet.update(0.2);
    const jawQuiet = quiet.evaluate().find((s) => s.name === "mouth");
    assert.ok(jawTalk && jawQuiet);
    assert.equal(jawQuiet.attachment.name, "mouth_closed");
    assert.equal(jawTalk.attachment.name, "mouth_open");

    const idleTorso = applyClip(skel, skel.animations.idle, 0.18).get("torso");
    const talkTorso = applyClip(skel, skel.animations.talk, 0.18).get("torso");
    assert.ok(idleTorso && talkTorso);
    assert.notEqual(talkTorso.y, idleTorso.y, "talk clip should bob the torso vs idle");
  });
});
