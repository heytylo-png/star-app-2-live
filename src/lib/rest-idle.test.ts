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
  composerActionLabel,
  composerCancelsTurn,
  composerShowsStop,
  isGreetingSpokenLine,
  layersFor,
  lineEndedRestPose,
  namedPoseFromText,
  POSE_HOLD_MIN_MS,
  resolveSpokenPose,
  settledRestPose,
  SMUG_BEAT_TAIL_MS,
  smugBeatResetDelayMs,
  smugWinkTextRestDelayMs,
  textChewMs,
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
    assert.doesNotMatch(src, /smug_official|smug1085_hold|bridge_idle_smug/);
    assert.equal(bridgeKeyOfSrc(src), "idle");
    assert.equal(canIdleBlink({ pose: rest.pose, emotion: rest.emotion, talking: false }), true);
    // Idle carrying the smug emotion is the smug sheet. The line end leaves it too.
    const tint = restSrc("idle", "smug");
    assert.equal(tint.rest.pose, "idle");
    assert.equal(tint.rest.emotion, DEFAULT_EMOTION);
    assert.match(tint.src, /idle_blink_01_open/);
    assert.doesNotMatch(tint.src, /smug_official|smug1085_hold|bridge_idle_smug/);
    assert.match(app, /lineEndedRestPose\(\{/);
    assert.match(app, /smugWinkTextRestDelayMs\(\{/);
    // paste-14: smug has no timed rest at all; the next send releases it on the stage.
    assert.doesNotMatch(app, /smugBeatResetDelayMs\(/);
    assert.match(app, /if \(holdsSmugBeat\(pose, emotion\)\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*anchorUnlandedLine\(\);\s*return;/);
    assert.match(app, /requestSmugRelease\(\);/);
    assert.match(app, /lineLandedAt\.current = Date\.now\(\)/);
    // Caption state must not freeze 1084 (chat bubble commits but caption stays).
    assert.equal(app.includes("isReplyCaption"), false);
    assert.match(app, /poseRef\.current === "smug"/);
    // nothing arms the release while the reply is in flight or she is talking, and a new turn clears the landing
    assert.match(app, /if \(sending \|\| talking\) return;/);
    assert.match(app, /if \(delay == null\) return;/);
    assert.match(app, /lineLandedAt\.current = 0;/);
    assert.doesNotMatch(app, /chewUntil > Date\.now\(\)/);
  });

  it("a text-only wink at me keeps the sheet through the chew, then idle", () => {
    assert.equal(namedPoseFromText("wink at me"), "wink");
    const reply = "Wink. Catch it~";
    const chew = textChewMs(reply);
    assert.ok(chew >= 600 && chew < 1200, `chew ${chew}`);
    const during = layersFor({
      pose: "wink",
      emotion: "bratty",
      talking: false,
      amplitude: 0,
      angle: 0,
    })[0]!.src;
    assert.match(during, /wink_official/);
    const delay = smugWinkTextRestDelayMs({
      voiced: false,
      chewUntil: chew,
      now: 0,
      pose: "wink",
      emotion: "bratty",
      actLandedAt: 0,
    });
    assert.equal(delay, POSE_HOLD_MIN_MS);
    assert.ok(delay != null && delay > chew);
    const beat = smugBeatResetDelayMs({
      line: reply,
      lineLandedAt: 1,
      speechEndedAt: 0,
      now: 1,
    });
    assert.ok(delay != null && beat != null && delay < beat);
    assert.equal(
      smugWinkTextRestDelayMs({
        voiced: true,
        chewUntil: 99_000,
        now: 0,
        pose: "wink",
        emotion: "bratty",
        actLandedAt: 0,
      }),
      0,
    );
    const { rest, src } = restSrc("wink");
    assert.equal(rest.pose, "idle");
    assert.match(src, /idle_blink_01_open/);
    assert.equal(canIdleBlink({ pose: "idle", emotion: rest.emotion, talking: false }), true);
  });

  it("a text-only Music Set smug paints the sheet, holds its beat from the landing, then rests on idle", () => {
    const line = "Super Shy. That one stays.";
    const now = 5_000;
    // The beat belongs to the line: landing + max(3.4 s, 45 ms a char), + 1.5 s. Not the chew, not the pose hold.
    const delay = smugBeatResetDelayMs({ line, lineLandedAt: now, speechEndedAt: 0, now });
    assert.equal(delay, POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
    assert.ok(delay > textChewMs(line));
    const sheet = layersFor({
      pose: "smug",
      emotion: "smug",
      talking: false,
      amplitude: 0,
      angle: 0,
    })[0]!.src;
    assert.match(sheet, /smug1085_hold/);
    assert.doesNotMatch(sheet, /bridge_idle_smug/);
    const longBeat = smugBeatResetDelayMs({ line: "x".repeat(400), lineLandedAt: now, speechEndedAt: 0, now });
    assert.ok(longBeat > POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
    // voiced: speech end + 1.5 s, not the instant speech ends
    const voiced = smugBeatResetDelayMs({ line, lineLandedAt: now, speechEndedAt: now + 9_000, now: now + 9_000 });
    assert.equal(voiced, SMUG_BEAT_TAIL_MS);
    const { src } = restSrc("smug", "smug");
    assert.match(src, /idle_blink_01_open/);
    assert.equal(canIdleBlink({ pose: "idle", emotion: "bratty", talking: false }), true);
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
      assert.doesNotMatch(src, /smug_official|smug1085_hold|wink_official|bridge_idle_smug/);
    }
  });
});

describe("composer Stop square", () => {
  it("shows the Stop icon only while speaking, and Cancel still aborts a hung send", () => {
    assert.equal(composerShowsStop(true), true);
    assert.equal(composerShowsStop(false), false);
    assert.equal(composerActionLabel({ talking: false, sending: false }), "Send");
    assert.equal(composerActionLabel({ talking: false, sending: true }), "Cancel");
    assert.equal(composerActionLabel({ talking: true, sending: true }), "Stop");
    assert.equal(composerCancelsTurn({ talking: false, sending: true }), true);
    assert.equal(composerCancelsTurn({ talking: true, sending: false }), true);
    assert.equal(composerCancelsTurn({ talking: false, sending: false }), false);

    const form = app.slice(app.indexOf("<form"), app.indexOf("</form>"));
    assert.match(form, /aria-label=\{composerActionLabel\(\{ talking, sending \}\)\}/);
    assert.match(form, /composerShowsStop\(talking\) \? <Square/);
    assert.doesNotMatch(form, /sending \? "Stop"/);
    assert.doesNotMatch(form, /sending \? <Square/);
    const cancels = form.match(/composerCancelsTurn\(\{ talking, sending \}\)\) stop\(\)/g);
    assert.equal(cancels?.length, 2);
    const submit = form.slice(form.indexOf("onSubmit"), form.indexOf("<Textarea"));
    const enter = form.slice(form.indexOf("onKeyDown"), form.indexOf("placeholder"));
    assert.doesNotMatch(submit, /setDraft/);
    assert.doesNotMatch(enter, /setDraft/);
    const stopFn = app.slice(app.indexOf("function stop()"), app.indexOf("function hangUp"));
    assert.match(stopFn, /abortRef\.current\?\.abort\(\)/);
    assert.doesNotMatch(stopFn, /setDraft/);
    assert.match(menu, /\{status\}/);
    assert.doesNotMatch(menu, /Square|aria-label="Stop"/);
  });
});
