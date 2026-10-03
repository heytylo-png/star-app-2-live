import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRIDGE_IDLE_SMUG_FILES,
  BRIDGE_FRAME_MS,
  BRIDGE_JITTER_MS,
  POSE_BRIDGE_PAIRS,
  PoseBridge,
  bridgeFiles,
  bridgeFilesFor,
  bridgeFrameMs,
  bridgeKeyOfPlates,
  bridgeKeyOfSrc,
  type BridgeRequest,
} from "./pose-bridge.ts";
import {
  PRE_CUT_ALPHA_FILES,
  SPRITES,
  bridgeFrameSrc,
  deferredSpriteUrls,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  spriteNeedsWhitePunch,
} from "./rai.ts";

/** Fake clock: timers fire in due order as time advances. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        seq += 1;
        due.set(seq, { at: now + ms, fn });
        return seq;
      },
      clear: (h: number) => {
        due.delete(h);
      },
    },
    now: () => now,
    pending: () => due.size,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let pick: [number, { at: number; fn: () => void }] | null = null;
        for (const e of due) if (e[1].at <= end && (!pick || e[1].at < pick[1].at)) pick = e;
        if (!pick) break;
        due.delete(pick[0]);
        now = pick[1].at;
        pick[1].fn();
      }
      now = end;
    },
  };
}

type Shown = { at: number; src: string | null };

function rig(rand: () => number = () => 0.5) {
  const clock = fakeClock();
  const shown: Shown[] = [];
  const bridge = new PoseBridge(clock.timers, rand, (src) => shown.push({ at: clock.now(), src }));
  const ready = new Set<string>(bridgeFiles().map(bridgeFrameSrc));
  const req = (over: Partial<BridgeRequest> & Pick<BridgeRequest, "from" | "to">): boolean =>
    bridge.request({
      reducedMotion: false,
      srcFor: bridgeFrameSrc,
      isReady: (src) => ready.has(src),
      ...over,
    });
  const names = () =>
    shown.map((s) => (s.src == null ? "live" : /bridge_idle_smug_(\d\d)/.exec(s.src)![1]));
  return { clock, shown, bridge, ready, req, names };
}

describe("pose bridge pair table", () => {
  it("is idle<->smug only, the second a reversed copy of the first", () => {
    assert.deepEqual(Object.keys(POSE_BRIDGE_PAIRS).sort(), ["idle>smug", "smug>idle"]);
    assert.equal(BRIDGE_IDLE_SMUG_FILES.length, 6);
    assert.deepEqual(bridgeFilesFor("idle", "smug"), BRIDGE_IDLE_SMUG_FILES);
    assert.deepEqual(bridgeFilesFor("smug", "idle"), [...BRIDGE_IDLE_SMUG_FILES].reverse());
    assert.deepEqual(
      bridgeFilesFor("idle", "smug")!.map((f) => f.slice(-6, -4)),
      ["01", "02", "03", "04", "05", "06"],
    );
    assert.deepEqual(
      bridgeFilesFor("smug", "idle")!.map((f) => f.slice(-6, -4)),
      ["06", "05", "04", "03", "02", "01"],
    );
  });

  it("has no bridge for any other pair, same-pose, or missing key", () => {
    for (const [from, to] of [
      ["idle", "wave"],
      ["wave", "idle"],
      ["smug", "wave"],
      ["idle", "pout"],
      ["idle", "talk"],
      ["talk", "smug"],
      ["idle", "idle"],
      ["smug", "smug"],
      [null, "smug"],
      ["idle", null],
    ] as const) {
      assert.equal(bridgeFilesFor(from, to), null, `${from}>${to}`);
    }
  });

  it("lists each bridge file once, all under public/rai", () => {
    const files = bridgeFiles();
    assert.deepEqual(files, [...BRIDGE_IDLE_SMUG_FILES]);
    for (const f of files) assert.match(f, /^rai\/bridge_idle_smug_0[1-6]\.png$/);
  });

  it("keeps the live keys: bridge files are new names, smug and idle are untouched", () => {
    assert.match(SPRITES.poses.idle, /rai\/idle\.png/);
    assert.match(SPRITES.poses.smug, /rai\/smug_official\.png/);
    for (const f of BRIDGE_IDLE_SMUG_FILES) {
      assert.ok(!SPRITES.poses.idle.includes(f) && !SPRITES.poses.smug.includes(f));
    }
  });
});

describe("pose bridge keys", () => {
  it("maps idle rest, blink and mouth frames to idle, smug to smug, others to null", () => {
    assert.equal(bridgeKeyOfSrc(SPRITES.poses.idle), "idle");
    for (const src of [...idleBlinkFrameUrls(), ...idleMouthFrameUrls()]) {
      assert.equal(bridgeKeyOfSrc(src), "idle", src);
    }
    assert.equal(bridgeKeyOfSrc(SPRITES.poses.smug), "smug");
    for (const key of ["wave", "pout", "talk", "wink", "peace", "shy", "tired", "think"] as const) {
      assert.equal(bridgeKeyOfSrc(SPRITES.poses[key]), null, key);
    }
    // a bridge frame is never mistaken for a resting pose
    for (const f of BRIDGE_IDLE_SMUG_FILES) assert.equal(bridgeKeyOfSrc(bridgeFrameSrc(f)), null, f);
  });

  it("reads the stage plates: one body sheet only", () => {
    assert.equal(bridgeKeyOfPlates([{ src: SPRITES.poses.smug }]), "smug");
    assert.equal(bridgeKeyOfPlates([{ src: SPRITES.poses.idle }]), "idle");
    assert.equal(bridgeKeyOfPlates([]), null);
    assert.equal(bridgeKeyOfPlates([{ src: SPRITES.poses.smug }, { src: SPRITES.poses.idle }]), null);
  });
});

describe("pose bridge timing", () => {
  it("holds each frame 100 ms +/- 20, always 80-120", () => {
    assert.equal(BRIDGE_FRAME_MS, 100);
    assert.equal(BRIDGE_JITTER_MS, 20);
    assert.equal(bridgeFrameMs(() => 0), 80);
    assert.equal(bridgeFrameMs(() => 0.5), 100);
    assert.equal(bridgeFrameMs(() => 1), 120);
    assert.equal(bridgeFrameMs(() => -3), 80);
    assert.equal(bridgeFrameMs(() => 9), 120);
    for (let i = 0; i < 200; i++) {
      const ms = bridgeFrameMs(Math.random);
      assert.ok(ms >= 80 && ms <= 120, String(ms));
    }
  });
});

describe("pose bridge sequencing", () => {
  it("idle -> smug plays 01..06 as hard cuts, then lands on the live smug", () => {
    const { clock, req, names, shown, bridge } = rig();
    assert.equal(req({ from: "idle", to: "smug" }), true);
    assert.deepEqual(names(), ["01"]);
    assert.equal(bridge.active(), true);
    clock.advance(100);
    assert.deepEqual(names(), ["01", "02"]);
    clock.advance(400);
    assert.deepEqual(names(), ["01", "02", "03", "04", "05", "06"]);
    assert.equal(bridge.active(), true);
    clock.advance(100);
    assert.deepEqual(names(), ["01", "02", "03", "04", "05", "06", "live"]);
    assert.equal(bridge.active(), false);
    assert.equal(bridge.current(), null);
    assert.equal(clock.pending(), 0, "no loop: nothing left scheduled");
    clock.advance(5000);
    assert.equal(shown.length, 7);
    // frames are cuts: every frame is one src, at 100 ms apart
    assert.deepEqual(
      shown.map((s) => s.at),
      [0, 100, 200, 300, 400, 500, 600],
    );
  });

  it("smug -> idle plays 06..01 reversed, then lands on the live idle", () => {
    const { clock, req, names } = rig();
    assert.equal(req({ from: "smug", to: "idle" }), true);
    clock.advance(1000);
    assert.deepEqual(names(), ["06", "05", "04", "03", "02", "01", "live"]);
  });

  it("jitters the hold per frame inside 80-120 ms", () => {
    const seq = [0, 1, 0.25, 0.75, 0.5, 0, 1];
    let i = 0;
    const { clock, req, shown } = rig(() => seq[i++ % seq.length]!);
    req({ from: "idle", to: "smug" });
    clock.advance(2000);
    const gaps = shown.slice(1).map((s, k) => s.at - shown[k]!.at);
    assert.deepEqual(gaps, [80, 120, 90, 110, 100, 80]);
    for (const g of gaps) assert.ok(g >= 80 && g <= 120);
  });

  it("an interrupt by the opposite pair carries on from the frame that is up", () => {
    const { clock, req, names, bridge } = rig();
    req({ from: "idle", to: "smug" });
    clock.advance(250); // 01 02 03 up
    assert.deepEqual(names(), ["01", "02", "03"]);
    // smug -> idle mid-bridge: carries on from the frame that is up (03), never jumps to 06
    assert.equal(req({ from: "smug", to: "idle" }), true);
    assert.deepEqual(names(), ["01", "02", "03", "03"]);
    clock.advance(1000);
    assert.deepEqual(names(), ["01", "02", "03", "03", "02", "01", "live"]);
    assert.equal(bridge.active(), false);
  });

  it("an interrupt to an unpaired pose drops the rest and hard-cuts to live", () => {
    const { clock, req, names, bridge } = rig();
    req({ from: "idle", to: "smug" });
    clock.advance(150);
    assert.deepEqual(names(), ["01", "02"]);
    assert.equal(req({ from: "smug", to: "wave" }), false);
    assert.deepEqual(names(), ["01", "02", "live"]);
    assert.equal(bridge.active(), false);
    assert.equal(clock.pending(), 0);
    clock.advance(2000);
    assert.deepEqual(names(), ["01", "02", "live"], "dropped frames never come back");
  });

  it("non-paired poses hard-cut: no frame is ever shown", () => {
    const { clock, req, shown } = rig();
    for (const [from, to] of [
      ["idle", "wave"],
      ["wave", "idle"],
      ["idle", "pout"],
      ["pout", "smug"],
      ["smug", "talk"],
      [null, "idle"],
      [null, "smug"],
      ["idle", "idle"],
    ] as const) {
      assert.equal(req({ from, to }), false, `${from}>${to}`);
    }
    clock.advance(2000);
    assert.equal(shown.length, 0);
  });

  it("a spoken line does not gate the pair: the request has no talking input at all", () => {
    const { clock, req, names } = rig();
    assert.equal(req({ from: "idle", to: "smug" }), true);
    clock.advance(1000);
    assert.equal(req({ from: "smug", to: "idle" }), true);
    clock.advance(1000);
    assert.deepEqual(names().filter((n) => n !== "live").length, 12);
  });

  it("speech starting mid-bridge drops the rest (cancel)", () => {
    const { clock, req, names, bridge } = rig();
    req({ from: "idle", to: "smug" });
    clock.advance(120);
    bridge.cancel();
    assert.deepEqual(names(), ["01", "02", "live"]);
    assert.equal(clock.pending(), 0);
    bridge.cancel(); // idempotent: nothing more to drop
    assert.deepEqual(names(), ["01", "02", "live"]);
  });

  it("reduced motion hard-cuts", () => {
    const { clock, req, shown } = rig();
    assert.equal(req({ from: "idle", to: "smug", reducedMotion: true }), false);
    assert.equal(req({ from: "smug", to: "idle", reducedMotion: true }), false);
    clock.advance(2000);
    assert.equal(shown.length, 0);
  });

  it("never shows a frame before it has decoded: any missing frame hard-cuts", () => {
    const { clock, req, shown, ready } = rig();
    ready.delete(bridgeFrameSrc("rai/bridge_idle_smug_04.png"));
    assert.equal(req({ from: "idle", to: "smug" }), false);
    assert.equal(req({ from: "smug", to: "idle" }), false);
    clock.advance(2000);
    assert.equal(shown.length, 0, "not even the decoded frames are shown");
    ready.add(bridgeFrameSrc("rai/bridge_idle_smug_04.png"));
    assert.equal(req({ from: "idle", to: "smug" }), true);
  });

  it("reports the frame on stage and clears on dispose", () => {
    const { clock, req, bridge } = rig();
    assert.equal(bridge.current(), null);
    req({ from: "idle", to: "smug" });
    assert.match(bridge.current()!, /bridge_idle_smug_01\.png/);
    clock.advance(100);
    assert.match(bridge.current()!, /bridge_idle_smug_02\.png/);
    bridge.dispose();
    assert.equal(bridge.current(), null);
    assert.equal(clock.pending(), 0);
  });
});

describe("pose bridge files", () => {
  it("are pre-cut (no runtime punch), versioned, and preloaded ahead of every pose sheet", () => {
    for (const f of BRIDGE_IDLE_SMUG_FILES) {
      assert.ok((PRE_CUT_ALPHA_FILES as readonly string[]).includes(f), f);
      assert.equal(spriteNeedsWhitePunch(bridgeFrameSrc(f)), false, f);
      assert.match(bridgeFrameSrc(f), /\.png\?v=rgba3$/);
    }
    const deferred = deferredSpriteUrls();
    assert.deepEqual(
      deferred.slice(0, BRIDGE_IDLE_SMUG_FILES.length),
      BRIDGE_IDLE_SMUG_FILES.map(bridgeFrameSrc),
      "bridge frames lead the deferred queue, in order, once",
    );
    const smugAt = deferred.indexOf(SPRITES.poses.smug);
    assert.ok(smugAt >= BRIDGE_IDLE_SMUG_FILES.length, "smug decodes after the bridge frames");
    assert.equal(
      deferred.filter((src) => /bridge_idle_smug_/.test(src)).length,
      BRIDGE_IDLE_SMUG_FILES.length,
    );
  });
});
