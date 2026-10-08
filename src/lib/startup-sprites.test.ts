import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  deferredSpriteUrls,
  blinkPassInFlight,
  IDLE_REST_LAYER_ID,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  idleRestSrc,
  layersFor,
  LIVE_POSE_FILES,
  openRestFallback,
  POSES,
  priorityPoseSrc,
  SPRITES,
  startupSpriteUrls,
  unusedPngSpriteUrls,
  type PoseId,
} from "./rai.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function pathOf(url: string): string {
  return url.replace(/^\//, "").split("?")[0];
}

describe("startup sprite lists", () => {
  it("loads idle.png, then blink 01 through 04, then mouth 02 through 05 (never 06), in that order", () => {
    assert.deepEqual(startupSpriteUrls().map(pathOf), [
      "rai/idle.png",
      "rai/idle_blink_01_open.png",
      "rai/idle_blink_02_closing.png",
      "rai/idle_blink_03_half.png",
      "rai/idle_blink_04_closed.png",
      "rai/idle_mouth_02_small.png",
      "rai/idle_mouth_03_open.png",
      "rai/idle_mouth_04_oo.png",
      "rai/idle_mouth_05_wide.png",
    ]);
    assert.deepEqual(startupSpriteUrls().slice(1, 5), idleBlinkFrameUrls());
    assert.deepEqual(startupSpriteUrls().slice(5), idleMouthFrameUrls());
    assert.equal(startupSpriteUrls()[0], SPRITES.poses.idle);
  });

  it("defers every other live pose and leaves angle sheets out", () => {
    const startup = startupSpriteUrls();
    const deferred = deferredSpriteUrls();
    const unused = unusedPngSpriteUrls();
    const startupSet = new Set(startup);
    for (const src of deferred) assert.equal(startupSet.has(src), false, src);

    // Every live pose (the smug clips are not sheets: the clip worker loads them, see pose-bridge.test.ts).
    assert.deepEqual(
      deferred.map(pathOf),
      Object.values(LIVE_POSE_FILES).filter((file) => file !== "rai/idle.png"),
    );
    // Pre-cut sheets carry ?v=, so compare the path.
    assert.ok(deferred.map(pathOf).some((file) => file.endsWith("rai/talk_official.png")));
    assert.ok(deferred.some((src) => src.endsWith("rai/three_quarter.png")));
    assert.ok(deferred.some((src) => src.endsWith("star-rai/poses/turn-away.png")));
    assert.ok(deferred.some((src) => src.endsWith("star-rai/point-front.png")));

    const angles = Object.values(SPRITES.angles);
    assert.equal(angles.length, 4);
    for (const src of angles) {
      assert.match(src, /star-rai\/angles\/(front|three-quarter|side|back)\.png$/);
      assert.equal(startup.includes(src), false, src);
      assert.equal(deferred.includes(src), false, src);
      assert.equal(unused.includes(src), true, src);
    }
    assert.equal(
      [...startup, ...deferred].some((src) => src.includes("star-rai/angles/")),
      false,
    );
    assert.equal(unused.some((src) => src.endsWith("star-rai/idle-talk.png")), true);
    assert.equal(unused.some((src) => src.endsWith("star-rai/lean-front.png")), true);
    assert.equal(unused.some((src) => src.endsWith("star-rai/scold-front.png")), true);
    assert.equal(unused.some((src) => src.endsWith("star-rai/finger-front.png")), true);
    assert.equal(deferred.includes(SPRITES.poses.point), true);
    assert.equal(unused.includes(SPRITES.extras.point), false);
  });

  it("covers every sheet layersFor can mount and nothing only the angle catalog uses", () => {
    const live = new Set([...startupSpriteUrls(), ...deferredSpriteUrls()]);
    const mounted = new Set<string>();
    const emotions = ["bratty", "shy", "smug", "tired", "soft", "hype", "glance"] as const;
    for (const pose of POSES) {
      for (const emotion of emotions) {
        for (const talking of [false, true]) {
          for (const layer of layersFor({
            pose: pose as PoseId,
            emotion,
            talking,
            amplitude: talking ? 0.8 : 0,
            angle: 0.9,
            blink: 4,
          })) {
            mounted.add(layer.src);
          }
        }
      }
    }
    for (const src of mounted) assert.equal(live.has(src), true, src);
    for (const src of unusedPngSpriteUrls()) assert.equal(mounted.has(src), false, src);
    assert.equal(mounted.has(SPRITES.angles.threeQuarter), false);
    assert.equal(mounted.has(SPRITES.talk), false);
  });

  it("keeps angle and pose sheets out of the service worker precache", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    const precache = sw.slice(sw.indexOf("const PRECACHE"), sw.indexOf("];"));
    assert.doesNotMatch(precache, /star-rai\//);
    assert.doesNotMatch(precache, /angles\//);
    assert.doesNotMatch(precache, /rai\/idle/);
    assert.doesNotMatch(precache, /talk_official/);
    assert.doesNotMatch(precache, /idle_blink/);
    assert.doesNotMatch(precache, /idle_mouth/);
  });

  it("punches startup then deferred from the puppet, not the full catalog", () => {
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.match(puppet, /stagePreloadOrder\(/);
    assert.match(puppet, /deferredSpriteUrls\(/);
    assert.match(puppet, /requestIdleCallback/);
    assert.match(puppet, /setTimeout/);
    assert.match(puppet, /punchedSpriteUrl/);
    assert.doesNotMatch(puppet, /allSpriteUrls/);
    assert.doesNotMatch(puppet, /star-rai\/angles/);
    assert.match(puppet, /new PoseCrossfadePool\(/);
    assert.match(puppet, /openRestFallback\(/);
    assert.match(puppet, /priorityPoseSrc\(/);
    assert.match(puppet, /blinkPassInFlight\(/);
    assert.match(puppet, /framesReady/);
    // Every sheet is decoded before it can mount; the stage <img> never paints empty.
    assert.match(puppet, /decoding="sync"/);
    assert.doesNotMatch(puppet, /decoding=\{/);
    assert.match(puppet, /await decodeSheet\(img\)/);
  });

  it("maps a mid-blink rest plate back to the open frame", () => {
    const open = idleRestSrc();
    const closed = openRestFallback(
      [{ id: IDLE_REST_LAYER_ID, src: SPRITES.idleBlinkClosed }],
      open,
    );
    assert.equal(closed[0]!.src, open);
    assert.match(closed[0]!.src, /idle_blink_01_open\.png(\?|$)/);
    const half = openRestFallback(
      [{ id: IDLE_REST_LAYER_ID, src: SPRITES.idleBlinkHalf }],
      open,
    );
    assert.equal(half[0]!.src, open);
    const pose = openRestFallback([{ id: "body:wave", src: SPRITES.poses.wave }], open);
    assert.equal(pose[0]!.src, SPRITES.poses.wave);
    assert.equal(blinkPassInFlight(0), false);
    assert.equal(blinkPassInFlight(1), false);
    assert.equal(blinkPassInFlight(2), true);
    assert.equal(blinkPassInFlight(3), true);
    assert.equal(blinkPassInFlight(4), true);
  });

  it("fetches a requested pose ahead of startup sheets, and only while it is still requested", () => {
    const ready = { [idleRestSrc()]: "blob:open" };
    assert.equal(priorityPoseSrc([{ src: idleRestSrc() }], ready), null);
    assert.equal(priorityPoseSrc([{ src: SPRITES.poses.wave }], ready), SPRITES.poses.wave);
    const waveReady = { ...ready, [SPRITES.poses.wave]: "blob:wave" };
    assert.equal(priorityPoseSrc([{ src: SPRITES.poses.wave }], waveReady), null);
    assert.equal(priorityPoseSrc([{ src: SPRITES.poses.peace }], waveReady), SPRITES.poses.peace);
  });
});
