import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHAT_THREAD_CEILING_PX,
  CHAT_THREAD_CEILING_REM,
  CHAT_THREAD_HEIGHT_KEY,
  CHAT_THREAD_MAX_VH,
  CHAT_THREAD_MIN_PX,
  CHAT_THREAD_RIG_BAND,
  CHAT_THREAD_VISIBLE_BEATS,
  RAI_RIG_BOTTOM_MAX_REM,
  RAI_RIG_BOTTOM_MIN_REM,
  RAI_RIG_BOTTOM_VH,
  clampChatThreadHeightPx,
  defaultChatThreadHeightPx,
  maxChatThreadHeightPx,
  parseStoredChatThreadHeight,
  raiRigHeightPx,
  restingBeatScrollTop,
  restingChatBeats,
  visibleBeatWindowPx,
} from "./chat-thread-height.ts";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

/** Samsung-ish Chrome viewports plus a tall desktop. */
const VIEWPORTS = [640, 700, 720, 800, 900] as const;

describe("chat transcript height", () => {
  it("defaults to the two-beat ceiling, not a thigh-high stack", () => {
    for (const vh of VIEWPORTS) {
      const next = defaultChatThreadHeightPx(vh);
      assert.equal(next, maxChatThreadHeightPx(vh));
      assert.ok(next <= CHAT_THREAD_CEILING_PX);
      assert.ok(next <= vh * 0.32);
      assert.ok(next < Math.round(vh * 0.28), `default still covers the thighs at ${vh}`);
    }
  });

  it("hard-caps max height to the lower third of .rai-rig (mid-skirt / hem)", () => {
    assert.ok(CHAT_THREAD_MAX_VH <= 0.32);
    assert.ok(CHAT_THREAD_MAX_VH < 0.4);
    assert.equal(CHAT_THREAD_RIG_BAND, 1 / 3);

    for (const vh of VIEWPORTS) {
      const rig = raiRigHeightPx(vh);
      const max = maxChatThreadHeightPx(vh);
      assert.ok(max <= Math.round(vh * CHAT_THREAD_MAX_VH));
      assert.ok(max <= Math.round(rig * CHAT_THREAD_RIG_BAND));
      // Face + ahoge live in the upper rig — keep more than half the viewport clear.
      assert.ok(vh - max > vh * 0.5, `face/ahoge band too small at ${vh} (max ${max})`);
    }
  });

  it("clamps stored / dragged values so resize cannot grow past the ceiling", () => {
    assert.equal(clampChatThreadHeightPx(12, 800), CHAT_THREAD_MIN_PX);
    assert.equal(clampChatThreadHeightPx(9999, 800), maxChatThreadHeightPx(800));
    assert.ok(clampChatThreadHeightPx(9999, 800) < Math.round(800 * 0.4));
    const mid = defaultChatThreadHeightPx(800);
    assert.equal(clampChatThreadHeightPx(mid, 800), mid);
    assert.equal(clampChatThreadHeightPx(Number.NaN, 800), defaultChatThreadHeightPx(800));
    // Stale 40vh localStorage from the old max must drop into the band.
    assert.equal(clampChatThreadHeightPx(Math.round(720 * 0.4), 720), maxChatThreadHeightPx(720));
  });

  it("parses localStorage pixels and rejects garbage", () => {
    assert.equal(parseStoredChatThreadHeight(null), null);
    assert.equal(parseStoredChatThreadHeight(""), null);
    assert.equal(parseStoredChatThreadHeight("nope"), null);
    assert.equal(parseStoredChatThreadHeight("240"), 240);
    assert.equal(CHAT_THREAD_HEIGHT_KEY, "star-rai-chat-thread-height");
  });

  it("mirrors .rai-rig insets and CSS max-height so the frame cannot climb the torso", () => {
    assert.match(css, /--rai-top-bar:\s*3\.25rem/);
    assert.match(
      css,
      /\.rai-rig\s*\{[^}]*bottom:\s*clamp\(5\.1rem,\s*15vh,\s*7\.25rem\)/s,
    );
    assert.equal(RAI_RIG_BOTTOM_MIN_REM, 5.1);
    assert.equal(RAI_RIG_BOTTOM_VH, 0.15);
    assert.equal(RAI_RIG_BOTTOM_MAX_REM, 7.25);
    assert.match(css, /\.chat-thread-frame\s*\{[^}]*max-height:\s*8\.5rem/s);
    assert.equal(CHAT_THREAD_CEILING_REM, 8.5);
    assert.doesNotMatch(css, /\.chat-thread-frame\s*\{[^}]*32dvh/s);
    assert.match(
      css,
      /\.chat-thread-mask\s*\{[^}]*mask-image:\s*linear-gradient\(\s*to bottom,\s*transparent 0,\s*transparent 1\.25rem,\s*#000 2\.75rem/s,
    );
  });
});

describe("visible chat thread", () => {
  const thread = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/chat-thread.tsx"), "utf8");
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/rai-app.tsx"), "utf8");
  const puppet = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/puppet.tsx"), "utf8");

  it("shows at most two beats at rest and hides older lines in that same strip", () => {
    assert.equal(CHAT_THREAD_VISIBLE_BEATS, 2);
    const lines = ["one", "two", "three", "four", "five"];
    assert.deepEqual(restingChatBeats(lines), ["four", "five"]);
    assert.equal(restingChatBeats(lines).length, 2);

    const boxes = [0, 36, 72, 108, 144].map((offsetTop) => ({ offsetTop, offsetHeight: 30 }));
    const windowPx = visibleBeatWindowPx(boxes);
    const lastTwo = boxes.slice(-2);
    const lastTwoHeight =
      lastTwo[1]!.offsetTop + lastTwo[1]!.offsetHeight - lastTwo[0]!.offsetTop;
    const olderBottom = boxes[2]!.offsetTop + boxes[2]!.offsetHeight;
    const allHeight = boxes[4]!.offsetTop + boxes[4]!.offsetHeight - boxes[0]!.offsetTop;
    assert.equal(windowPx, lastTwoHeight + 4);
    assert.ok(windowPx < allHeight);
    assert.ok(windowPx < visibleBeatWindowPx(boxes, 5));
    assert.ok(windowPx <= CHAT_THREAD_CEILING_PX);
    assert.equal(restingBeatScrollTop(boxes), lastTwo[0]!.offsetTop);
    assert.ok(restingBeatScrollTop(boxes) >= olderBottom);

    assert.match(thread, /visibleBeatWindowPx\(/);
    assert.match(thread, /restingBeatScrollTop\(/);
    assert.match(thread, /data-chat-visible-beats=\{CHAT_THREAD_VISIBLE_BEATS\}/);
    assert.match(thread, /data-chat-beat/);
    assert.match(thread, /chat-thread-mask/);
    assert.match(thread, /maxHeight: windowPx/);
    assert.doesNotMatch(thread, /chat-thread-handle|Resize transcript/);
  });

  it("keeps the PNG puppet mounted behind the chat thread", () => {
    const presenceAt = app.indexOf("<PresenceStage");
    const threadAt = app.indexOf("<ChatThread");
    assert.ok(presenceAt > 0 && threadAt > presenceAt);
    assert.equal((app.match(/<PresenceStage/g) ?? []).length, 1);
    assert.match(puppet, /data-rai-engine="png-puppet"/);
    assert.match(puppet, /className="rai-layer"/);
    assert.doesNotMatch(thread, /PresenceStage|Puppet|rai-stage/);
  });
});
