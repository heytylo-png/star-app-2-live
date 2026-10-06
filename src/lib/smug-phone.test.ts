import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SMUG_IN_FILES, SMUG_OUT_FILES } from "./pose-bridge.ts";
import {
  SMUG_BEAT_TAIL_MS,
  SMUG_MIN_VISIBLE_HOLD_MS,
  SMUG_RELEASE_WAIT_CAP_MS,
  SPRITES,
  bridgeFrameSrc,
  canIdleBlink,
  canIdleMouth,
  holdsSmugBeat,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  isReplyCaption,
  isSmugPathSheetSrc,
  smugBeatResetDelayMs,
  smugReadingEndAt,
  smugLineFinishedAt,
  smugBeatEndAt,
  smugBeatSheetUrls,
  smugReleaseWaitMs,
  stagePreloadOrder,
  startupSpriteUrls,
} from "./rai.ts";
import { buildId, debugOverlayOn } from "./build-id.ts";
import { readPosePhase, setPoseStageMounted, setPosePhase } from "./pose-phase.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("smug beat on a cold slow phone", () => {
  it("preloads idle, then blink 01, then 968 in + smug968_hold + 973 out, then blink 02-04 and mouth", () => {
    const { first, next, beat, rest } = stagePreloadOrder();
    assert.equal(first, SPRITES.poses.idle);
    assert.deepEqual(next, [idleBlinkFrameUrls()[0]]);
    assert.deepEqual(beat, [...SMUG_IN_FILES.map(bridgeFrameSrc), SPRITES.poses.smug, ...SMUG_OUT_FILES.map(bridgeFrameSrc)]);
    assert.equal(beat.length, 11);
    assert.deepEqual(rest, [...idleBlinkFrameUrls().slice(1), ...idleMouthFrameUrls()]);
    assert.deepEqual(new Set([first, ...next, ...beat, ...rest]), new Set([...startupSpriteUrls(), ...smugBeatSheetUrls()]));
    assert.equal(new Set([first, ...next, ...beat, ...rest]).size, 1 + next.length + beat.length + rest.length);
  });

  it("ships the beat small: eleven WebP frames, ~1 MB total, every one well under 150 KB", () => {
    let total = 0;
    for (const file of [...SMUG_IN_FILES, "rai/smug968_hold.webp", ...SMUG_OUT_FILES]) {
      const bytes = statSync(join(root, "public", file)).size;
      assert.ok(bytes < 150_000, `${file} ${bytes}`);
      total += bytes;
    }
    assert.ok(total < 1_200_000, `total ${total}`);
  });

  it("retired smug files are gone from public/rai (956/962/06, smug_official, six-PNG, hip clip)", () => {
    for (const file of [
      "rai/smug_hold.png",
      "rai/smug_official.png",
      ...[1, 2, 3, 4, 5].flatMap((n) => [`rai/smug_in_0${n}.png`, `rai/smug_out_0${n}.png`]),
      ...[1, 2, 3, 4, 5, 6].map((n) => `rai/bridge_idle_smug_0${n}.png`),
    ]) {
      assert.equal(existsSync(join(root, "public", file)), false, file);
    }
    assert.equal(existsSync(join(root, "public/rai/hip")), false);
  });

  it("the puppet uses that order and reports its phase", () => {
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.match(puppet, /stagePreloadOrder\(/);
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

  it("the app never times the smug release; its next send hands it to the stage (paste-14)", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    assert.doesNotMatch(app, /smugReleaseWaitMs\(|smugBeatResetDelayMs\(|readPosePhase\(\)/);
    const send = app.slice(app.indexOf("async function send("), app.indexOf("await complete(active.id);"));
    assert.match(send, /requestSmugRelease\(\);/);
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.match(puppet, /useSyncExternalStore\(subscribeSmugRelease, readSmugRelease, readSmugRelease\)/);
    assert.match(puppet, /bridgeDwellsFor,\n\s*\);/);
    assert.match(puppet, /now: \(\) => performance\.now\(\)/);
  });

  it("the service worker cache name is a stamped constant", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.match(sw, /const CACHE = "star-rai-shell-[^"]+"/);
  });
});

describe("smug path allowlist + caption-blocked release", () => {
  it("allows only idle sheets / smug968_in / smug968_hold / smug973_out", () => {
    assert.equal(isSmugPathSheetSrc(SPRITES.poses.smug), true);
    assert.equal(isSmugPathSheetSrc(SPRITES.poses.idle), true);
    for (const f of [...SMUG_IN_FILES, ...SMUG_OUT_FILES]) assert.equal(isSmugPathSheetSrc(bridgeFrameSrc(f)), true, f);
    assert.equal(isSmugPathSheetSrc("rai/smug968_in_01.webp?v=rgba3"), true);
    assert.equal(isSmugPathSheetSrc("rai/smug973_out_05.webp"), true);
    assert.equal(isSmugPathSheetSrc(SPRITES.poses.think), false);
    for (const old of ["rai/smug_official.png", "rai/smug_hold.png", "rai/smug_in_01.png", "rai/smug_out_05.png", "rai/bridge_idle_smug_06.png", "rai/smug968_in_06.webp", "rai/hip/hip_bridge_00.webp"]) {
      assert.equal(isSmugPathSheetSrc(old), false, old);
    }
    assert.equal(isSmugPathSheetSrc(SPRITES.poses.peace), false);
  });

  it("reply captions block the beat; empty / listening do not", () => {
    assert.equal(isReplyCaption("Obviously."), true);
    assert.equal(isReplyCaption(""), false);
    assert.equal(isReplyCaption("Listening…"), false);
  });

  it("reading floor + tail from landing; captionLive does not freeze release", () => {
    const now = 50_000;
    assert.equal(
      smugBeatResetDelayMs({
        line: "x".repeat(32),
        lineLandedAt: 0,
        speechEndedAt: 0,
        now,
      }),
      null,
    );
    assert.equal(
      smugBeatResetDelayMs({
        line: "x".repeat(32),
        lineLandedAt: now - 10_000,
        speechEndedAt: 0,
        captionLive: true,
        now,
      }),
      0,
    );
    const mid = smugBeatResetDelayMs({
      line: "x".repeat(32),
      lineLandedAt: now - 1_000,
      speechEndedAt: 0,
      captionLive: true,
      now,
    });
    assert.ok(mid != null && mid > SMUG_BEAT_TAIL_MS);
  });

  it("beat end is max(reading from land, speech) + 1.5s; release waits for beat even mid-entry", () => {
    const land = 10_000;
    const line = "x".repeat(156); // ~7.0 s reading
    const readEnd = smugReadingEndAt({ line, lineLandedAt: land });
    assert.equal(readEnd, land + 156 * 45);
    assert.equal(smugLineFinishedAt({ line, lineLandedAt: land, speechEndedAt: 0 }), readEnd);
    assert.equal(smugLineFinishedAt({ line, lineLandedAt: land, speechEndedAt: land + 20_000 }), land + 20_000);
    const end = smugBeatEndAt({ line, lineLandedAt: land, speechEndedAt: 0 });
    assert.equal(end, readEnd + SMUG_BEAT_TAIL_MS);
    // Entry still playing, beat not done: wait out the remaining beat (not a bare 150ms poll).
    const now = land + 2_000;
    const more = smugReleaseWaitMs({
      phase: "bridge-in",
      holdSince: 0,
      waitedMs: 0,
      beatEndAt: end!,
      now,
    });
    assert.equal(more, end! - now);
    // Hold painted after beat already elapsed: still at least MIN visible hold.
    const late = land + 30_000;
    assert.equal(
      smugReleaseWaitMs({
        phase: "hold",
        holdSince: late,
        waitedMs: 0,
        beatEndAt: end!,
        now: late,
      }),
      SMUG_MIN_VISIBLE_HOLD_MS,
    );
  });
});

describe("smug cancel / error before the line lands never holds forever", () => {
  const appSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../components/rai-app.tsx"),
    "utf8",
  );

  it("abort and error branches anchor the beat when the line never landed", () => {
    const catchBlock = appSrc.slice(
      appSrc.indexOf('if (err instanceof DOMException && err.name === "AbortError")'),
      appSrc.indexOf("} finally {", appSrc.indexOf('if (err instanceof DOMException && err.name === "AbortError")')),
    );
    assert.equal((catchBlock.match(/anchorUnlandedLine\(\)/g) ?? []).length, 3, "DOMException abort, Error abort, error");
    assert.match(appSrc, /if \(lineLandedAt\.current === 0\) lineLandedAt\.current = Date\.now\(\);/);
  });

  it("the rest effect anchors an unlanded smug turn once sending/talking is over, then keeps the hold (no timer)", () => {
    const eff = appSrc.slice(appSrc.indexOf("if (sending || talking) return;"), appSrc.indexOf("if (delay == null) return;"));
    // Anchored, then held: no timer; the next send releases it (paste-14).
    assert.match(eff, /if \(holdsSmugBeat\(pose, emotion\)\) \{[\s\S]*?anchorUnlandedLine\(\);\s*return;\s*\}/);
  });

  it("cancel mid-stream: beat = cancel + reading floor of the partial text + 1.5 s", () => {
    const cancelAt = 20_000;
    const partial = "x".repeat(120); // 5.4 s reading
    assert.equal(
      smugBeatResetDelayMs({ line: partial, lineLandedAt: cancelAt, speechEndedAt: 0, now: cancelAt }),
      120 * 45 + SMUG_BEAT_TAIL_MS,
    );
  });

  it("cancel before the first token: floor minimum + 1.5 s (bounded)", () => {
    const cancelAt = 3_000;
    const d = smugBeatResetDelayMs({ line: "", lineLandedAt: cancelAt, speechEndedAt: 0, now: cancelAt });
    assert.ok(d != null && d <= 3400 + SMUG_BEAT_TAIL_MS);
  });

  it("error before 968 finished: release waits for the hold, then a visible hold, never idle mid-entry", () => {
    const now = 50_000;
    // beat already over, entry still playing → poll (no cut)
    assert.ok(smugReleaseWaitMs({ phase: "bridge-in", holdSince: 0, waitedMs: 0, beatEndAt: now - 1, now }) > 0);
    // hold just reached → at least the min visible hold
    assert.equal(
      smugReleaseWaitMs({ phase: "hold", holdSince: now, waitedMs: 0, beatEndAt: now - 1, now }),
      SMUG_MIN_VISIBLE_HOLD_MS,
    );
    // capped: never waits forever
    assert.equal(
      smugReleaseWaitMs({ phase: "bridge-in", holdSince: 0, waitedMs: SMUG_RELEASE_WAIT_CAP_MS, beatEndAt: now + 99_999, now }),
      0,
    );
  });
});
