import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRIDGE_IDLE_SMUG_FILES,
  SMUG_IN_FILES,
  SMUG_OUT_FILES,
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
    shown.map((s) => {
      if (s.src == null) return "live";
      const m = /smug_(?:in|out)_(\d\d)/.exec(s.src) || /bridge_idle_smug_(\d\d)/.exec(s.src);
      return m![1];
    });
  return { clock, shown, bridge, ready, req, names };
}

describe("pose bridge pair table", () => {
  it("is idle<->smug only: Helix 956 intro forward, Helix 962 rest forward", () => {
    assert.deepEqual(Object.keys(POSE_BRIDGE_PAIRS).sort(), ["idle>smug", "smug>idle"]);
    assert.equal(SMUG_IN_FILES.length, 5);
    assert.equal(SMUG_OUT_FILES.length, 5);
    assert.deepEqual(bridgeFilesFor("idle", "smug"), SMUG_IN_FILES);
    assert.deepEqual(bridgeFilesFor("smug", "idle"), SMUG_OUT_FILES);
    assert.notDeepEqual(SMUG_OUT_FILES, [...SMUG_IN_FILES].reverse());
    assert.deepEqual(
      bridgeFilesFor("idle", "smug")!.map((f) => f.slice(-6, -4)),
      ["01", "02", "03", "04", "05"],
    );
    assert.deepEqual(
      bridgeFilesFor("smug", "idle")!.map((f) => f.slice(-6, -4)),
      ["01", "02", "03", "04", "05"],
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
    assert.deepEqual(files, [...SMUG_IN_FILES, ...SMUG_OUT_FILES]);
    for (const f of SMUG_IN_FILES) assert.match(f, /^rai\/smug_in_0[1-5]\.png$/);
    for (const f of SMUG_OUT_FILES) assert.match(f, /^rai\/smug_out_0[1-5]\.png$/);
  });

  it("keeps the live keys: bridge files are new names, smug and idle are untouched", () => {
    assert.match(SPRITES.poses.idle, /rai\/idle\.png/);
    assert.match(SPRITES.poses.smug, /rai\/smug_hold\.png/);
    for (const f of [...SMUG_IN_FILES, ...SMUG_OUT_FILES]) {
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
    for (const f of [...SMUG_IN_FILES, ...SMUG_OUT_FILES]) assert.equal(bridgeKeyOfSrc(bridgeFrameSrc(f)), null, f);
  });

  it("reads the stage plates: one body sheet only", () => {
    assert.equal(bridgeKeyOfPlates([{ src: SPRITES.poses.smug }]), "smug");
    assert.equal(bridgeKeyOfPlates([{ src: SPRITES.poses.idle }]), "idle");
    assert.equal(bridgeKeyOfPlates([]), null);
    assert.equal(bridgeKeyOfPlates([{ src: SPRITES.poses.smug }, { src: SPRITES.poses.idle }]), null);
  });
});

describe("pose bridge timing", () => {
  it("holds each frame 150 ms +/- 20, always 130-170", () => {
    assert.equal(BRIDGE_FRAME_MS, 150);
    assert.equal(BRIDGE_JITTER_MS, 20);
    assert.equal(bridgeFrameMs(() => 0), 130);
    assert.equal(bridgeFrameMs(() => 0.5), 150);
    assert.equal(bridgeFrameMs(() => 1), 170);
    assert.equal(bridgeFrameMs(() => -3), 130);
    assert.equal(bridgeFrameMs(() => 9), 170);
    for (let i = 0; i < 200; i++) {
      const ms = bridgeFrameMs(Math.random);
      assert.ok(ms >= 130 && ms <= 170, String(ms));
    }
  });
});

describe("pose bridge sequencing", () => {
  it("idle -> smug plays intro 01..05 as hard cuts, then lands on the live smug_hold", () => {
    const { clock, req, names, shown, bridge } = rig();
    assert.equal(req({ from: "idle", to: "smug" }), true);
    assert.deepEqual(names(), ["01"]);
    assert.equal(bridge.active(), true);
    clock.advance(150);
    assert.deepEqual(names(), ["01", "02"]);
    clock.advance(450);
    assert.deepEqual(names(), ["01", "02", "03", "04", "05"]);
    assert.equal(bridge.active(), true);
    clock.advance(150);
    assert.deepEqual(names(), ["01", "02", "03", "04", "05", "live"]);
    assert.equal(bridge.active(), false);
    assert.equal(bridge.current(), null);
    assert.equal(clock.pending(), 0, "no loop: nothing left scheduled");
    clock.advance(5000);
    assert.equal(shown.length, 6);
    assert.deepEqual(
      shown.map((s) => s.at),
      [0, 150, 300, 450, 600, 750],
    );
  });

  it("smug -> idle plays rest 01..05 forward (not reversed), then lands on idle", () => {
    const { clock, req, names, shown } = rig();
    assert.equal(req({ from: "smug", to: "idle" }), true);
    // names() strips to last 02 digits of filename — out files are also 01..05
    clock.advance(1000);
    assert.deepEqual(names(), ["01", "02", "03", "04", "05", "live"]);
    // Confirm they are the OUT set, not the IN set reversed
    assert.match(shown[0]!.src, /smug_out_01/);
    assert.match(shown[4]!.src, /smug_out_05/);
  });

  it("jitters the hold per frame inside 130-170 ms", () => {
    const seq = [0, 1, 0.25, 0.75, 0.5, 0, 1];
    let i = 0;
    const { clock, req, shown } = rig(() => seq[i++ % seq.length]!);
    req({ from: "idle", to: "smug" });
    clock.advance(2000);
    const gaps = shown.slice(1).map((s, k) => s.at - shown[k]!.at);
    assert.deepEqual(gaps, [130, 170, 140, 160, 150]);
    for (const g of gaps) assert.ok(g >= 130 && g <= 170);
  });

  it("an interrupt by the opposite pair starts the exit set (in/out files differ; no shared resume)", () => {
    const { clock, req, names, bridge } = rig();
    req({ from: "idle", to: "smug" });
    clock.advance(400); // 01 02 03 up (~150 ms each)
    assert.deepEqual(names(), ["01", "02", "03"]);
    assert.equal(req({ from: "smug", to: "idle" }), true);
    // Exit is smug_out_01..05 (different files): starts at out 01
    assert.deepEqual(names(), ["01", "02", "03", "01"]);
    clock.advance(1000);
    assert.deepEqual(names(), ["01", "02", "03", "01", "02", "03", "04", "05", "live"]);
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
    assert.deepEqual(names().filter((n) => n !== "live").length, 10);
  });

  it("speech starting mid-bridge drops the rest (cancel)", () => {
    const { clock, req, names, bridge } = rig();
    req({ from: "idle", to: "smug" });
    clock.advance(160);
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
    const { clock, req, shown, ready, bridge } = rig();
    ready.delete(bridgeFrameSrc("rai/smug_in_04.png"));
    assert.equal(req({ from: "idle", to: "smug" }), false);
    clock.advance(2000);
    assert.equal(shown.length, 0, "956 incomplete: nothing shown");
    // Exit set is independent of intro frames.
    assert.equal(req({ from: "smug", to: "idle" }), true);
    bridge.dispose();
    shown.length = 0;
    ready.add(bridgeFrameSrc("rai/smug_in_04.png"));
    ready.delete(bridgeFrameSrc("rai/smug_out_03.png"));
    assert.equal(req({ from: "smug", to: "idle" }), false);
    clock.advance(2000);
    assert.equal(shown.length, 0, "962 incomplete: nothing shown");
    ready.add(bridgeFrameSrc("rai/smug_out_03.png"));
    assert.equal(req({ from: "idle", to: "smug" }), true);
  });

  it("reports the frame on stage and clears on dispose", () => {
    const { clock, req, bridge } = rig();
    assert.equal(bridge.current(), null);
    req({ from: "idle", to: "smug" });
    assert.match(bridge.current()!, /smug_in_01\.png/);
    clock.advance(150);
    assert.match(bridge.current()!, /smug_in_02\.png/);
    bridge.dispose();
    assert.equal(bridge.current(), null);
    assert.equal(clock.pending(), 0);
  });
});

describe("pose bridge files", () => {
  it("are pre-cut (no runtime punch), versioned, and preloaded ahead of every pose sheet", () => {
    for (const f of [...SMUG_IN_FILES, ...SMUG_OUT_FILES]) {
      assert.ok((PRE_CUT_ALPHA_FILES as readonly string[]).includes(f), f);
      assert.equal(spriteNeedsWhitePunch(bridgeFrameSrc(f)), false, f);
      assert.match(bridgeFrameSrc(f), /\.png\?v=rgba3$/);
    }
    const deferred = deferredSpriteUrls();
    const bridgeList = [...SMUG_IN_FILES, ...SMUG_OUT_FILES];
    assert.deepEqual(
      deferred.slice(0, bridgeList.length),
      bridgeList.map(bridgeFrameSrc),
      "bridge frames lead the deferred queue, in order, once",
    );
    const smugAt = deferred.indexOf(SPRITES.poses.smug);
    assert.ok(smugAt >= bridgeList.length, "smug decodes after the bridge frames");
    assert.equal(
      deferred.filter((src) => /smug_in_|smug_out_/.test(src)).length,
      bridgeList.length,
    );
  });
});
