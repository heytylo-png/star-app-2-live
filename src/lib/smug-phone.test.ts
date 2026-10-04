import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { bridgeFiles } from "./pose-bridge.ts";
import {
  SMUG_MIN_VISIBLE_HOLD_MS,
  SMUG_RELEASE_WAIT_CAP_MS,
  SPRITES,
  bridgeFrameSrc,
  canIdleBlink,
  canIdleMouth,
  holdsSmugBeat,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  smugBeatSheetUrls,
  smugReleaseWaitMs,
  stagePreloadOrder,
  startupSpriteUrls,
} from "./rai.ts";
import { buildId, debugOverlayOn } from "./build-id.ts";
import { readPosePhase, setPoseStageMounted, setPosePhase } from "./pose-phase.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("smug beat on a cold slow phone", () => {
  it("preloads idle, then the 6 bridge frames + smug sheet, before blink and mouth", () => {
    const { first, beat, rest } = stagePreloadOrder();
    assert.equal(first, SPRITES.poses.idle);
    assert.deepEqual(beat, [...bridgeFiles().map(bridgeFrameSrc), SPRITES.poses.smug]);
    assert.equal(beat.length, 7);
    assert.deepEqual(rest, [...idleBlinkFrameUrls(), ...idleMouthFrameUrls()]);
    assert.deepEqual(new Set([first, ...beat, ...rest]), new Set([...startupSpriteUrls(), ...smugBeatSheetUrls()]));
    assert.equal(new Set([first, ...beat, ...rest]).size, 1 + beat.length + rest.length);
  });

  it("the puppet uses that order and reports its phase", () => {
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.match(puppet, /stagePreloadOrder\(\)/);
    assert.match(puppet, /order\.beat\.map/);
    assert.match(puppet, /data-rai-pose-phase=\{phase\}/);
    assert.match(puppet, /data-rai-build=\{buildId\(\)\}/);
    assert.match(puppet, /debugOverlayOn\(\) \?/);
    assert.match(puppet, /setPosePhase\(phase\)/);
  });

  it("the debug readout is ?debug=1 only", () => {
    assert.equal(debugOverlayOn("?debug=1"), true);
    assert.equal(debugOverlayOn("?v=abc&debug=1"), true);
    assert.equal(debugOverlayOn(""), false);
    assert.equal(debugOverlayOn("?debug=0"), false);
    assert.equal(debugOverlayOn("?v=abc"), false);
    assert.equal(buildId(), "dev");
  });

  it("an emotion-only smug (no pose) is a smug beat with no idle mouth or lid on it", () => {
    assert.equal(holdsSmugBeat("idle", "smug"), true);
    assert.equal(holdsSmugBeat("smug", "neutral"), true);
    for (const pose of ["idle", "smug"] as const) {
      assert.equal(canIdleMouth({ pose, emotion: "smug", talking: true, lineLive: true }), false);
      assert.equal(canIdleBlink({ pose, emotion: "smug", talking: false }), false);
    }
    assert.equal(canIdleMouth({ pose: "smug", emotion: "neutral", talking: true, lineLive: true }), false);
  });

  it("release waits for the hip to be on stage, then for a visible hold, capped", () => {
    const now = 100_000;
    // Frames still decoding: stage on idle.
    assert.equal(smugReleaseWaitMs({ phase: "idle", holdSince: 0, waitedMs: 0, now }) > 0, true);
    // Entry still playing.
    assert.equal(smugReleaseWaitMs({ phase: "bridge-in", holdSince: 0, waitedMs: 0, now }) > 0, true);
    // Hip just arrived: owes the rest of the minimum hold.
    assert.equal(smugReleaseWaitMs({ phase: "hold", holdSince: now - 200, waitedMs: 0, now }), SMUG_MIN_VISIBLE_HOLD_MS - 200);
    // Seen long enough: release.
    assert.equal(smugReleaseWaitMs({ phase: "hold", holdSince: now - SMUG_MIN_VISIBLE_HOLD_MS, waitedMs: 0, now }), 0);
    // Already leaving.
    assert.equal(smugReleaseWaitMs({ phase: "bridge-out", holdSince: 0, waitedMs: 0, now }), 0);
    // Never waits forever.
    assert.equal(smugReleaseWaitMs({ phase: "idle", holdSince: 0, waitedMs: SMUG_RELEASE_WAIT_CAP_MS, now }), 0);
  });

  it("pose phase store tracks hold start and the mounted flag", () => {
    setPoseStageMounted(true);
    setPosePhase("bridge-in", 10);
    assert.equal(readPosePhase().holdSince, 0);
    setPosePhase("hold", 500);
    setPosePhase("hold", 900);
    assert.deepEqual(readPosePhase(), { phase: "hold", holdSince: 500, mounted: true });
    setPosePhase("bridge-out", 1000);
    assert.equal(readPosePhase().holdSince, 0);
    setPoseStageMounted(false);
    assert.deepEqual(readPosePhase(), { phase: "idle", holdSince: 0, mounted: false });
  });

  it("the app's smug release asks the stage first", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    assert.match(app, /smugReleaseWaitMs\(/);
    assert.match(app, /readPosePhase\(\)/);
  });

  it("the service worker cache name is a stamped constant", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.match(sw, /const CACHE = "star-rai-shell-[^"]+"/);
  });
});
