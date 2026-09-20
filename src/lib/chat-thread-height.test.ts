import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_THREAD_DEFAULT_VH,
  CHAT_THREAD_HEIGHT_KEY,
  CHAT_THREAD_MIN_PX,
  CHAT_THREAD_STAGE_RESERVE_PX,
  clampChatThreadHeightPx,
  defaultChatThreadHeightPx,
  maxChatThreadHeightPx,
  parseStoredChatThreadHeight,
} from "./chat-thread-height.ts";

describe("chat transcript height", () => {
  it("defaults to the Expo-style bottom third", () => {
    const tall = defaultChatThreadHeightPx(900);
    assert.equal(tall, Math.round(900 * CHAT_THREAD_DEFAULT_VH));
    assert.ok(tall <= 900 * 0.3);
    const phone = defaultChatThreadHeightPx(700);
    assert.equal(phone, Math.round(700 * CHAT_THREAD_DEFAULT_VH));
    assert.ok(phone >= CHAT_THREAD_MIN_PX);
    assert.ok(phone < 700 * 0.35);
  });

  it("does not let max height eat the stage / torso", () => {
    const vh = 800;
    const max = maxChatThreadHeightPx(vh);
    assert.ok(max <= Math.round(vh * 0.4));
    assert.ok(max <= vh - CHAT_THREAD_STAGE_RESERVE_PX);
    assert.ok(max < vh * 0.5);
    assert.ok(vh - max >= 200);
  });

  it("clamps stored values into the puppet-safe range", () => {
    assert.equal(clampChatThreadHeightPx(12, 800), CHAT_THREAD_MIN_PX);
    assert.equal(clampChatThreadHeightPx(9999, 800), maxChatThreadHeightPx(800));
    const mid = defaultChatThreadHeightPx(800);
    assert.equal(clampChatThreadHeightPx(mid, 800), mid);
    assert.equal(clampChatThreadHeightPx(Number.NaN, 800), defaultChatThreadHeightPx(800));
  });

  it("parses localStorage pixels and rejects garbage", () => {
    assert.equal(parseStoredChatThreadHeight(null), null);
    assert.equal(parseStoredChatThreadHeight(""), null);
    assert.equal(parseStoredChatThreadHeight("nope"), null);
    assert.equal(parseStoredChatThreadHeight("240"), 240);
    assert.equal(CHAT_THREAD_HEIGHT_KEY, "star-rai-chat-thread-height");
  });
});
