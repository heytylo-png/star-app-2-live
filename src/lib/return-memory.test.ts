import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import type { ChatMessage } from "./helix.ts";
import {
  RETURN_BANNED_RE,
  RETURN_GAP_LIGHT_MS,
  RETURN_GAP_LONG_MS,
  RETURN_GAP_NOTICE_MS,
  RETURN_LINES_LIGHT,
  RETURN_LINES_LONG,
  RETURN_LINES_NOTICE,
  clipTopicHint,
  composeReturnLine,
  gapMs,
  lastReturnSurface,
  linePassesTone,
  noticeTopicLines,
  offerReturnBeat,
  parseLastSeenAt,
  resetReturnSession,
  returnBucket,
  threadHasFreshReturnBeat,
  topicHintFromUserText,
  type PresenceSnapshot,
} from "./return-memory.ts";

const NOW = Date.parse("2026-09-21T15:00:00Z");

function snap(over: Partial<PresenceSnapshot> = {}): PresenceSnapshot {
  return {
    lastSeenAt: NOW - RETURN_GAP_LIGHT_MS,
    lastTopicHint: null,
    returnAckedFor: null,
    ...over,
  };
}

describe("return buckets", () => {
  it("stays silent under ~4 hours, including first visit", () => {
    assert.equal(returnBucket(0), "silent");
    assert.equal(returnBucket(RETURN_GAP_LIGHT_MS - 1), "silent");
    assert.equal(gapMs(null, NOW), 0);
    assert.equal(returnBucket(gapMs(null, NOW)), "silent");
  });

  it("maps 4h / 1d / 3d thresholds", () => {
    assert.equal(returnBucket(RETURN_GAP_LIGHT_MS), "light");
    assert.equal(returnBucket(RETURN_GAP_NOTICE_MS - 1), "light");
    assert.equal(returnBucket(RETURN_GAP_NOTICE_MS), "notice");
    assert.equal(returnBucket(RETURN_GAP_LONG_MS - 1), "notice");
    assert.equal(returnBucket(RETURN_GAP_LONG_MS), "long");
  });
});

describe("return line bank", () => {
  it("keeps every template in character and under two sentences", () => {
    const topicLines = noticeTopicLines("the night talking bit");
    const all = [...RETURN_LINES_LIGHT, ...RETURN_LINES_NOTICE, ...RETURN_LINES_LONG, ...topicLines];
    for (const line of all) {
      assert.equal(linePassesTone(line), true, line);
      assert.doesNotMatch(line, RETURN_BANNED_RE);
      assert.doesNotMatch(line, /i missed you|worried|where were you/i);
    }
  });

  it("hooks last topic only on the 1–3 day bucket", () => {
    const hint = "that joke about noodles";
    const notice = composeReturnLine("notice", hint, 0);
    assert.match(notice, /noodles/);
    const light = composeReturnLine("light", hint, 0);
    assert.doesNotMatch(light, /noodles/);
    const long = composeReturnLine("long", hint, 0);
    assert.doesNotMatch(long, /noodles/);
    assert.doesNotMatch(long, /missed|worried|where were you/i);
  });

  it("clips topic hints so they stay tiny", () => {
    const long = "I keep thinking about that bit with the late night ramen stall and the cat";
    const hint = topicHintFromUserText(long);
    assert.ok(hint);
    assert.ok(hint.length <= 42);
    assert.equal(topicHintFromUserText("Hey"), null);
    assert.equal(topicHintFromUserText("wink"), null);
    assert.ok(clipTopicHint("  hello world  ").length > 0);
  });
});

describe("parseLastSeenAt", () => {
  it("accepts ms numbers and ISO strings for DevTools edits", () => {
    assert.equal(parseLastSeenAt(NOW), NOW);
    assert.equal(parseLastSeenAt(String(NOW)), NOW);
    assert.equal(parseLastSeenAt("2026-09-21T11:00:00.000Z"), Date.parse("2026-09-21T11:00:00.000Z"));
    assert.equal(parseLastSeenAt("nope"), null);
    assert.equal(parseLastSeenAt(0), null);
    assert.equal(parseLastSeenAt(null), null);
  });
});

describe("offerReturnBeat", () => {
  beforeEach(() => {
    resetReturnSession();
  });

  it("does not inject under 4h and still refreshes lastSeenAt", () => {
    const offer = offerReturnBeat(snap({ lastSeenAt: NOW - 3 * 60 * 60 * 1000 }), NOW, "chat");
    assert.equal(offer.inject, false);
    assert.equal(offer.line, null);
    assert.equal(offer.bucket, "silent");
    assert.equal(offer.next.lastSeenAt, NOW);
  });

  it("injects exactly one light line after a 4h+ gap", () => {
    const lastSeen = NOW - RETURN_GAP_LIGHT_MS - 1000;
    const offer = offerReturnBeat(snap({ lastSeenAt: lastSeen }), NOW, "chat");
    assert.equal(offer.inject, true);
    assert.ok(offer.line);
    assert.equal(offer.bucket, "light");
    assert.equal(linePassesTone(offer.line!), true);
    assert.equal(offer.next.returnAckedFor, lastSeen);
    assert.equal(offer.next.lastSeenAt, NOW);
    assert.equal(lastReturnSurface(), "chat");
  });

  it("does not re-nag after the gap is acked (reload)", () => {
    const lastSeen = NOW - RETURN_GAP_NOTICE_MS;
    const first = offerReturnBeat(snap({ lastSeenAt: lastSeen, lastTopicHint: "ramen" }), NOW, "chat");
    assert.equal(first.inject, true);
    const reload = offerReturnBeat(first.next, NOW + 1_000, "chat");
    assert.equal(reload.inject, false);
    const sameGap = offerReturnBeat(
      snap({ lastSeenAt: lastSeen, returnAckedFor: lastSeen, lastTopicHint: "ramen" }),
      NOW + 2_000,
      "call",
    );
    assert.equal(sameGap.inject, false);
  });

  it("does not stack Chat then Call for the same gap", () => {
    const lastSeen = NOW - RETURN_GAP_LONG_MS;
    const chat = offerReturnBeat(snap({ lastSeenAt: lastSeen }), NOW, "chat");
    assert.equal(chat.inject, true);
    const call = offerReturnBeat(snap({ lastSeenAt: lastSeen }), NOW, "call");
    assert.equal(call.inject, false);
    assert.equal(lastReturnSurface(), "chat");
    assert.equal(call.next.lastSeenAt, lastSeen);
  });

  it("skips if the thread already ends on a return bubble", () => {
    const lastSeen = NOW - RETURN_GAP_LIGHT_MS * 2;
    const messages: ChatMessage[] = [
      { id: "a", role: "assistant", content: "You went quiet. Busy?", createdAt: NOW, source: "return" },
    ];
    assert.equal(threadHasFreshReturnBeat(messages), true);
    const offer = offerReturnBeat(snap({ lastSeenAt: lastSeen }), NOW, "chat", {
      threadHasReturn: threadHasFreshReturnBeat(messages),
    });
    assert.equal(offer.inject, false);
  });

  it("first visit with no lastSeenAt stays silent", () => {
    const offer = offerReturnBeat(snap({ lastSeenAt: null }), NOW, "chat");
    assert.equal(offer.inject, false);
    assert.equal(offer.next.lastSeenAt, NOW);
  });
});
