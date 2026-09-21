import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHAT_THREAD_DEFAULT_VH,
  CHAT_THREAD_HEIGHT_KEY,
  CHAT_THREAD_MAX_VH,
  CHAT_THREAD_MIN_PX,
  CHAT_THREAD_RIG_BAND,
  RAI_RIG_BOTTOM_MAX_REM,
  RAI_RIG_BOTTOM_MIN_REM,
  RAI_RIG_BOTTOM_VH,
  clampChatThreadHeightPx,
  defaultChatThreadHeightPx,
  maxChatThreadHeightPx,
  parseStoredChatThreadHeight,
  raiRigHeightPx,
} from "./chat-thread-height.ts";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

/** Samsung-ish Chrome viewports plus a tall desktop. */
const VIEWPORTS = [640, 700, 720, 800, 900] as const;

describe("chat transcript height", () => {
  it("defaults to the Expo-style bottom third, then the hem band", () => {
    for (const vh of VIEWPORTS) {
      const next = defaultChatThreadHeightPx(vh);
      const uncapped = Math.round(vh * CHAT_THREAD_DEFAULT_VH);
      assert.equal(next, clampChatThreadHeightPx(uncapped, vh));
      assert.ok(next >= CHAT_THREAD_MIN_PX);
      assert.ok(next <= maxChatThreadHeightPx(vh));
      assert.ok(next <= vh * 0.32);
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
    assert.match(css, /\.chat-thread-frame\s*\{[^}]*max-height:/s);
    assert.match(css, /32dvh/);
    assert.match(css, /\/\s*3/);
  });
});
