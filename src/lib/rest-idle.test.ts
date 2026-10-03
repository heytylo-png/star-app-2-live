import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { bridgeKeyOfSrc } from "./pose-bridge.ts";
import {
  DEFAULT_EMOTION,
  canIdleBlink,
  canIdleMouth,
  composerShowsStop,
  isGreetingSpokenLine,
  layersFor,
  lineEndedRestPose,
  namedPoseFromText,
  resolveSpokenPose,
  settledRestPose,
} from "./rai.ts";

const app = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/rai-app.tsx"),
  "utf8",
);
const menu = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/stage-menu.tsx"),
  "utf8",
);

function restSrc(pose: "smug" | "wink" | "idle", emotion: "smug" | "bratty" | "glance" = "bratty") {
  const rest = lineEndedRestPose({ pose, emotion });
  assert.ok(rest, `${pose}/${emotion} should rest`);
  const src = layersFor({
    pose: rest.pose,
    emotion: rest.emotion,
    talking: false,
    amplitude: 0,
    angle: 0,
    blink: 0,
  })[0]!.src;
  return { rest, src };
}

describe("smug and wink lines rest on official idle", () => {
  it("a smug line ends on official idle with blink, not smug or a bridge frame", () => {
    assert.equal(
      resolveSpokenPose({
        namedPose: "smug",
        modelPose: null,
        emotion: "bratty",
        spoken: true,
        seed: "smug",
        currentPose: "idle",
      }),
      "smug",
    );
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: "smug",
        emotion: "bratty",
        spoken: true,
        seed: "Obviously.",
        currentPose: "idle",
      }),
      "smug",
    );
    const { rest, src } = restSrc("smug", "smug");
    assert.deepEqual(rest, { pose: settledRestPose(), emotion: DEFAULT_EMOTION });
    assert.equal(rest.pose, "idle");
    assert.match(src, /idle_blink_01_open/);
    assert.doesNotMatch(src, /smug_official|bridge_idle_smug/);
    assert.equal(bridgeKeyOfSrc(src), "idle");
    assert.equal(canIdleBlink({ pose: rest.pose, emotion: rest.emotion, talking: false }), true);
    // Idle carrying the smug emotion is the smug sheet. The line end leaves it too.
    const tint = restSrc("idle", "smug");
    assert.equal(tint.rest.pose, "idle");
    assert.equal(tint.rest.emotion, DEFAULT_EMOTION);
    assert.match(tint.src, /idle_blink_01_open/);
    assert.doesNotMatch(tint.src, /smug_official|bridge_idle_smug/);
    assert.match(app, /lineEndedRestPose\(\{/);
    assert.doesNotMatch(app, /smugBeatResetDelayMs/);
  });

  it("a wink line ends on official idle with blink, not wink", () => {
    assert.equal(namedPoseFromText("wink"), "wink");
    assert.equal(
      resolveSpokenPose({
        namedPose: "wink",
        modelPose: null,
        emotion: "bratty",
        spoken: true,
        seed: "wink",
        currentPose: "idle",
      }),
      "wink",
    );
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: "wink",
        emotion: "bratty",
        spoken: true,
        seed: "Catch it~",
        currentPose: "idle",
      }),
      "wink",
    );
    const { rest, src } = restSrc("wink");
    assert.equal(rest.pose, "idle");
    assert.equal(rest.emotion, DEFAULT_EMOTION);
    assert.match(src, /idle_blink_01_open/);
    assert.doesNotMatch(src, /wink_official|bridge_idle_smug/);
    assert.equal(canIdleBlink({ pose: rest.pose, emotion: rest.emotion, talking: false }), true);
    assert.equal(
      canIdleMouth({ pose: rest.pose, emotion: rest.emotion, talking: false, lineLive: true }),
      true,
    );
  });

  it("a generic hello stays on idle and can chew", () => {
    for (const line of ["hello", "hi", "hey", "yo", "sup", "what's up"]) {
      assert.equal(isGreetingSpokenLine(line), true, line);
      assert.equal(namedPoseFromText(line), null, line);
      const pose = resolveSpokenPose({
        namedPose: null,
        modelPose: null,
        emotion: "bratty",
        spoken: true,
        seed: line,
        currentPose: "smug",
      });
      assert.equal(pose, "idle", line);
      assert.equal(lineEndedRestPose({ pose, emotion: "bratty" }), null, line);
      assert.equal(
        canIdleMouth({ pose, emotion: "bratty", talking: false, lineLive: true }),
        true,
        line,
      );
      const src = layersFor({
        pose,
        emotion: "bratty",
        talking: true,
        amplitude: 0,
        angle: 0,
        mouth: 3,
      })[0]!.src;
      assert.match(src, /idle_mouth/);
      assert.doesNotMatch(src, /smug_official|wink_official|bridge_idle_smug/);
    }
  });
});

describe("composer Stop square", () => {
  it("shows only while she is speaking", () => {
    assert.equal(composerShowsStop(true), true);
    assert.equal(composerShowsStop(false), false);
    assert.match(app, /composerShowsStop\(talking\)/);
    assert.match(app, /aria-label=\{composerShowsStop\(talking\) \? "Stop" : "Send"\}/);
    assert.doesNotMatch(app, /sending \? "Stop"/);
    assert.doesNotMatch(app, /sending \? <Square/);
    assert.match(menu, /\{status\}/);
    assert.doesNotMatch(menu, /Square|aria-label="Stop"/);
  });
});
