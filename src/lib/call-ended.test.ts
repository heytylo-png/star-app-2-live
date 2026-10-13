import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CALL_ENDED_LAST_KEY,
  CALL_ENDED_LINES,
  CALL_ENDED_MS,
  callEndedBucket,
  callEndedExpired,
  callEndedVisible,
  formatCallDuration,
  loadCallEndedLineId,
  pickCallEndedLine,
  planCallEnded,
  saveCallEndedLineId,
} from "./call-ended.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("call ended duration", () => {
  it("formats m:ss under an hour and h:mm:ss from an hour up", () => {
    assert.equal(formatCallDuration(0), "0:00");
    assert.equal(formatCallDuration(5_000), "0:05");
    assert.equal(formatCallDuration(59_000), "0:59");
    assert.equal(formatCallDuration(60_000), "1:00");
    assert.equal(formatCallDuration(90_000), "1:30");
    assert.equal(formatCallDuration(3_599_000), "59:59");
    assert.equal(formatCallDuration(3_600_000), "1:00:00");
    assert.equal(formatCallDuration(3_661_000), "1:01:01");
    assert.equal(formatCallDuration(-20), "0:00");
    assert.equal(formatCallDuration(Number.NaN), "0:00");
  });

  it("buckets very short, normal, and long", () => {
    assert.equal(callEndedBucket(0), "short");
    assert.equal(callEndedBucket(29_999), "short");
    assert.equal(callEndedBucket(30_000), "normal");
    assert.equal(callEndedBucket(10 * 60 * 1000), "normal");
    assert.equal(callEndedBucket(10 * 60 * 1000 + 1), "long");
    assert.equal(callEndedBucket(61 * 60 * 1000), "long");
  });
});

describe("call ended line", () => {
  it("does not repeat the previous line id", () => {
    assert.equal(pickCallEndedLine("short", null).id, "short:0");
    assert.equal(pickCallEndedLine("short", "short:0").id, "short:1");
    assert.equal(pickCallEndedLine("short", "short:1").id, "short:2");
    assert.equal(pickCallEndedLine("short", "short:2").id, "short:0");
    assert.equal(pickCallEndedLine("long", "short:0").id, "long:0");
    assert.equal(pickCallEndedLine("normal", "normal:2").text, CALL_ENDED_LINES.normal[0]!.text);
    const storage = new Map<string, string>();
    saveCallEndedLineId("long:1", (key, value) => storage.set(key, value));
    assert.equal(loadCallEndedLineId((key) => storage.get(key) ?? null), "long:1");
    assert.equal(storage.get(CALL_ENDED_LAST_KEY), "long:1");
    assert.equal(loadCallEndedLineId(() => "nope"), null);
    assert.equal(loadCallEndedLineId(() => "{"), null);
  });

  it("shows a card only after a connected call", () => {
    assert.equal(
      planCallEnded({ connected: false, startedAt: 0, endedAt: 12_000, lastLineId: null }),
      null,
    );
    assert.equal(
      planCallEnded({ connected: true, startedAt: null, endedAt: 12_000, lastLineId: null }),
      null,
    );
    const short = planCallEnded({
      connected: true,
      startedAt: 1_000,
      endedAt: 9_000,
      lastLineId: null,
      now: 9_000,
    });
    assert.equal(short?.duration, "0:08");
    assert.equal(short?.id, "short:0");
    assert.equal(short?.line, "Already? I was just getting comfy.");
    const again = planCallEnded({
      connected: true,
      startedAt: 1_000,
      endedAt: 20_000,
      lastLineId: short?.id ?? null,
    });
    assert.equal(again?.id, "short:1");
    assert.notEqual(again?.line, short?.line);
    const long = planCallEnded({
      connected: true,
      startedAt: 0,
      endedAt: 61 * 60 * 1000,
      lastLineId: null,
    });
    assert.equal(long?.duration, "1:01:00");
    assert.equal(long?.id, "long:0");
    assert.equal(long?.line, "You stayed. I noticed.");
  });

  it("yields to reload and a live call, and leaves after 6s", () => {
    assert.equal(callEndedVisible({ card: true, staleNotice: false, callActive: false }), true);
    assert.equal(callEndedVisible({ card: true, staleNotice: true, callActive: false }), false);
    assert.equal(callEndedVisible({ card: true, staleNotice: false, callActive: true }), false);
    assert.equal(callEndedVisible({ card: false, staleNotice: false, callActive: false }), false);
    assert.equal(CALL_ENDED_MS, 6000);
    assert.equal(callEndedExpired(0, 5999), false);
    assert.equal(callEndedExpired(0, 6000), true);
  });

  it("renders one paper card in the hint slot and does not speak, pose, or post", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const at = app.indexOf("data-call-ended");
    assert.ok(at > 0);
    const card = app.slice(at, at + 900);
    assert.match(card, /h-11/);
    assert.match(card, /min-h-11/);
    assert.match(card, /bg-\[rgba\(239,236,230,0\.85\)\]/);
    assert.match(card, /text-\[#3f3b36\]/);
    assert.match(card, /truncate/);
    assert.doesNotMatch(card, /setPose|speak\(|appendMessage|streamChat|speechSynthesis/);
    const noticeAt = app.indexOf("data-stale-build-notice");
    const toastAt = app.indexOf("data-remember-toast");
    const hintAt = app.indexOf("data-empty-chat-hint");
    const chipsAt = app.indexOf("data-starter-chips");
    assert.ok(noticeAt < at && at < toastAt && toastAt < hintAt && hintAt < chipsAt);
    assert.match(app, /callEndedVisible\(/);
    assert.match(app, /staleNotice: showNotice/);
    assert.match(app, /planCallEnded\(/);
    assert.match(app, /loadCallEndedLineId/);
    assert.match(app, /saveCallEndedLineId/);
    assert.match(app, /!showCallEnded/);
    const hangStart = app.indexOf("function hangUp()");
    const hang = app.slice(hangStart, app.indexOf("\n  }\n", hangStart));
    assert.match(hang, /connected && startedAt != null/);
    assert.doesNotMatch(hang, /appendMessage|setPose|speak\(|speechSynthesis/);
    assert.ok(hang.trimEnd().endsWith("settleUpdate();"));
  });
});
