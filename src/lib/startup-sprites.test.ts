import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  deferredSpriteUrls,
  idleBlinkFrameUrls,
  layersFor,
  LIVE_POSE_FILES,
  POSES,
  SPRITES,
  startupSpriteUrls,
  unusedPngSpriteUrls,
  type PoseId,
} from "./rai.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function pathOf(url: string): string {
  return url.replace(/^\//, "");
}

describe("startup sprite lists", () => {
  it("loads idle.png then blink 01 through 04, in that order", () => {
    assert.deepEqual(startupSpriteUrls().map(pathOf), [
      "rai/idle.png",
      "rai/idle_blink_01_open.png",
      "rai/idle_blink_02_closing.png",
      "rai/idle_blink_03_half.png",
      "rai/idle_blink_04_closed.png",
    ]);
    assert.deepEqual(startupSpriteUrls().slice(1), idleBlinkFrameUrls());
    assert.equal(startupSpriteUrls()[0], SPRITES.poses.idle);
  });

  it("defers every other live pose and leaves angle sheets out", () => {
    const startup = startupSpriteUrls();
    const deferred = deferredSpriteUrls();
    const unused = unusedPngSpriteUrls();
    const startupSet = new Set(startup);
    for (const src of deferred) assert.equal(startupSet.has(src), false, src);

    assert.deepEqual(
      deferred.map(pathOf),
      Object.values(LIVE_POSE_FILES).filter((file) => file !== "rai/idle.png"),
    );
    assert.ok(deferred.some((src) => src.endsWith("rai/talk_official.png")));
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
  });

  it("punches startup then deferred from the puppet, not the full catalog", () => {
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.match(puppet, /startupSpriteUrls\(\)/);
    assert.match(puppet, /deferredSpriteUrls\(\)/);
    assert.match(puppet, /requestIdleCallback/);
    assert.match(puppet, /setTimeout/);
    assert.match(puppet, /punchedSpriteUrl/);
    assert.doesNotMatch(puppet, /allSpriteUrls/);
    assert.doesNotMatch(puppet, /star-rai\/angles/);
    assert.match(puppet, /const firstPaint = prevIds\.current\.size === 0/);
  });
});
