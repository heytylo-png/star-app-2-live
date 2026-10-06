import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SMUG_IN_FILES,
  SMUG_OUT_FILES,
  SMUG_IN_CLIP,
  SMUG_OUT_CLIP,
  WAVE_IN_CLIP,
  WAVE_OUT_CLIP,
  WAVE_IN_FILES,
  WAVE_OUT_FILES,
  WAVE_HOLD_FILE,
  SMUG_HOLD_FILE,
  SMUG_CLIP_BOX,
  SMUG_CLIP_FRAME_MS,
  SMUG_CLIP_SHEET,
  BRIDGE_FRAME_MS,
  BRIDGE_JITTER_MS,
  BRIDGE_LATE_REANCHOR_MS,
  POSE_BRIDGE_PAIRS,
  PoseBridge,
  bridgeDwellsFor,
  bridgeFiles,
  bridgeFilesFor,
  bridgeFrameMs,
  bridgeKeyOfPlates,
  bridgeKeyOfSrc,
  parseClipFrame,
  type BridgeClipEvents,
  type BridgeRequest,
} from "./pose-bridge.ts";
import {
  PRE_CUT_ALPHA_FILES,
  SPRITES,
  bridgeFrameSrc,
  deferredSpriteUrls,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  smugClipUrls,
  spriteNeedsWhitePunch,
} from "./rai.ts";

/** Fake clock: timers fire in due order as time advances. */
function fakeClock(withNow = false) {
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
      ...(withNow ? { now: () => now } : {}),
    },
    now: () => now,
    pending: () => due.size,
    /** Busy main thread: time passes with nothing firing. */
    jump(ms: number) {
      now += ms;
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let pick: [number, { at: number; fn: () => void }] | null = null;
        for (const e of due) if (e[1].at <= end && (!pick || e[1].at < pick[1].at)) pick = e;
        if (!pick) break;
        due.delete(pick[0]);
        now = Math.max(now, pick[1].at);
        pick[1].fn();
      }
      now = end;
    },
  };
}

type Shown = { at: number; src: string | null };

/** "i000".."i048", "o000".."o144", or "live". */
function label(src: string | null): string {
  if (src == null) return "live";
  const f = parseClipFrame(src);
  assert.ok(f, src);
  return `${f.clip.key === "in" ? "i" : "o"}${String(f.index).padStart(3, "0")}`;
}
const seqOf = (p: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, k) => `${p}${String(from + k).padStart(3, "0")}`);

function rig(opts: { rand?: () => number; clipClock?: boolean } = {}) {
  const clock = fakeClock(Boolean(opts.clipClock));
  const shown: Shown[] = [];
  const bridge = new PoseBridge(
    clock.timers,
    opts.rand ?? (() => 0.5),
    (src) => shown.push({ at: clock.now(), src }),
    undefined,
    opts.clipClock ? bridgeDwellsFor : undefined,
  );
  const ready = new Set<string>(bridgeFiles().map(bridgeFrameSrc));
  const req = (over: Partial<BridgeRequest> & Pick<BridgeRequest, "from" | "to">): boolean =>
    bridge.request({
      reducedMotion: false,
      srcFor: bridgeFrameSrc,
      isReady: (src) => ready.has(src),
      ...over,
    });
  const names = () => shown.map((s) => label(s.src));
  return { clock, shown, bridge, ready, req, names };
}

describe("pose bridge pair table (paste-15: 1085 / 1084 video)", () => {
  it("is idle<->smug and idle<->wave: 49-frame intros + 145-frame rests", () => {
    assert.deepEqual(Object.keys(POSE_BRIDGE_PAIRS).sort(), ["idle>smug", "idle>wave", "smug>idle", "wave>idle"]);
    assert.equal(SMUG_IN_CLIP.file, "rai/smug1085_in.avif");
    assert.equal(SMUG_OUT_CLIP.file, "rai/smug1084_out.avif");
    assert.equal(SMUG_IN_FILES.length, 49);
    assert.equal(SMUG_OUT_FILES.length, 145);
    assert.deepEqual(bridgeFilesFor("idle", "smug"), SMUG_IN_FILES);
    assert.deepEqual(bridgeFilesFor("smug", "idle"), SMUG_OUT_FILES);
    assert.deepEqual(SMUG_IN_FILES.map((f) => label(f)), seqOf("i", 0, 48));
    assert.deepEqual(SMUG_OUT_FILES.map((f) => label(f)), seqOf("o", 0, 144));
    // 48 frames after frame 0 at 24 fps = exactly 2.000 s: nothing past 2.0 s exists.
    assert.equal((SMUG_IN_FILES.length - 1) * SMUG_CLIP_FRAME_MS, 2000);
    assert.equal(parseClipFrame("rai/smug1085_in.avif#049"), null, "no frame 49");
    assert.equal(SMUG_HOLD_FILE, "rai/smug1085_hold.webp");
  });

  it("has no bridge for any other pair, same-pose, or missing key", () => {
    for (const [from, to] of [
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

  it("lists each frame once; frame ids point into the clip files", () => {
    assert.deepEqual(bridgeFiles(), [...SMUG_IN_FILES, ...SMUG_OUT_FILES, ...WAVE_IN_FILES, ...WAVE_OUT_FILES]);
    for (const f of SMUG_IN_FILES) assert.match(f, /^rai\/smug1085_in\.avif#0[0-4]\d$/);
    for (const f of SMUG_OUT_FILES) assert.match(f, /^rai\/smug1084_out\.avif#\d{3}$/);
    assert.deepEqual(parseClipFrame(bridgeFrameSrc("rai/smug1084_out.avif#144")), { clip: SMUG_OUT_CLIP, index: 144 });
    assert.deepEqual(smugClipUrls().map((u) => u.replace(/^.*?(rai\/)/, "$1").split("?")[0]), [
      "rai/smug1085_in.avif",
      "rai/smug1084_out.avif",
    ]);
  });

  it("draws the clip band 1:1 inside the 720x1280 sheet space (no crop, no zoom)", () => {
    assert.deepEqual(SMUG_CLIP_SHEET, { w: 720, h: 1280 });
    assert.ok(SMUG_CLIP_BOX.x >= 0 && SMUG_CLIP_BOX.x + SMUG_CLIP_BOX.w <= 720);
    assert.equal(SMUG_CLIP_BOX.y, 0);
    assert.equal(SMUG_CLIP_BOX.h, 1280);
  });

  it("keeps the live keys: smug/wave are hold sheets, idle is idle.png", () => {
    assert.match(SPRITES.poses.idle, /rai\/idle\.png/);
    assert.match(SPRITES.poses.smug, /rai\/smug1085_hold\.webp/);
    assert.match(SPRITES.poses.wave, /rai\/wave1110_hold\.webp/);
    assert.equal(WAVE_HOLD_FILE, "rai/wave1110_hold.webp");
  });
});

describe("pose bridge keys", () => {
  it("maps idle rest, blink and mouth frames to idle, smug to smug, others to null", () => {
    assert.equal(bridgeKeyOfSrc(SPRITES.poses.idle), "idle");
    for (const src of [...idleBlinkFrameUrls(), ...idleMouthFrameUrls()]) {
      assert.equal(bridgeKeyOfSrc(src), "idle", src);
    }
    assert.equal(bridgeKeyOfSrc(SPRITES.poses.smug), "smug");
    assert.equal(bridgeKeyOfSrc(SPRITES.poses.wave), "wave");
    for (const key of ["pout", "talk", "wink", "peace", "shy", "tired", "think"] as const) {
      assert.equal(bridgeKeyOfSrc(SPRITES.poses[key]), null, key);
    }
    // a clip frame is never mistaken for a resting pose
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
  it("generic pairs (none today) hold each frame 150 ms +/- 20", () => {
    assert.equal(BRIDGE_FRAME_MS, 150);
    assert.equal(BRIDGE_JITTER_MS, 20);
    assert.equal(bridgeFrameMs(() => 0), 130);
    assert.equal(bridgeFrameMs(() => 1), 170);
    assert.equal(bridgeFrameMs(() => 9), 170);
  });

  it("the smug clips run at their native 24 fps, every frame one frame long", () => {
    for (const d of bridgeDwellsFor("idle", "smug")!) assert.equal(d, 1000 / 24);
    for (const d of bridgeDwellsFor("smug", "idle")!) assert.equal(d, 1000 / 24);
    assert.equal(bridgeDwellsFor("idle", "smug")!.length, 49);
    assert.equal(bridgeDwellsFor("smug", "idle")!.length, 145);
    assert.equal(bridgeDwellsFor("idle", "wave")!.length, 49);
    assert.equal(bridgeDwellsFor("wave", "idle")!.length, 145);
    for (const d of bridgeDwellsFor("idle", "wave")!) assert.equal(d, 1000 / 24);
  });
});

describe("pose bridge sequencing (clock-paced, 24 fps)", () => {
  it("idle -> smug shows i000..i048 at k x 41.67 ms, then lands on the live hold; never past 2.0 s", () => {
    const { clock, req, names, shown, bridge } = rig({ clipClock: true });
    assert.equal(req({ from: "idle", to: "smug" }), true);
    assert.deepEqual(names(), ["i000"]);
    clock.advance(5000);
    assert.deepEqual(names(), [...seqOf("i", 0, 48), "live"]);
    shown.slice(0, 49).forEach((s, k) => assert.ok(Math.abs(s.at - k * SMUG_CLIP_FRAME_MS) < 1e-6, `i${k} at ${s.at}`));
    assert.ok(Math.abs(shown[49]!.at - 49 * SMUG_CLIP_FRAME_MS) < 1e-6, "i048 is up one frame, then the hold");
    assert.equal(bridge.active(), false);
    assert.equal(clock.pending(), 0, "no loop: nothing left scheduled");
  });

  it("smug -> idle plays o000..o144 forward once (6.04 s), then lands on idle; never loops", () => {
    const { clock, req, names } = rig({ clipClock: true });
    assert.equal(req({ from: "smug", to: "idle" }), true);
    clock.advance(20000);
    assert.deepEqual(names(), [...seqOf("o", 0, 144), "live"]);
    assert.equal(clock.pending(), 0);
  });

  it("a frame up to one frame late keeps the 24 fps clock (the next follows sooner); never skips", () => {
    const { clock, req, names, shown } = rig({ clipClock: true });
    req({ from: "idle", to: "smug" });
    clock.advance(10 * SMUG_CLIP_FRAME_MS);
    clock.jump(30); // main thread busy for 30 ms
    clock.advance(5000);
    assert.deepEqual(names(), [...seqOf("i", 0, 48), "live"]);
    const end = shown.at(-1)!.at;
    assert.ok(Math.abs(end - 49 * SMUG_CLIP_FRAME_MS) < 1e-6, `clip length kept (${end})`);
  });

  it("a stall longer than a frame shifts the rest back: nothing is dropped to catch up", () => {
    const { clock, req, names, shown } = rig({ clipClock: true });
    req({ from: "idle", to: "smug" });
    clock.advance(10 * SMUG_CLIP_FRAME_MS + 1);
    clock.jump(200);
    clock.advance(5000);
    assert.deepEqual(names(), [...seqOf("i", 0, 48), "live"]);
    const gaps = shown.slice(1).map((s, k) => s.at - shown[k]!.at);
    assert.ok(BRIDGE_LATE_REANCHOR_MS === SMUG_CLIP_FRAME_MS);
    assert.equal(gaps.filter((g) => g < SMUG_CLIP_FRAME_MS - 1e-6).length, 0, "no bunching after the stall");
  });

  it("a frame that has not decoded holds the one up (stall), then carries on in order", () => {
    const { clock, req, names, ready, bridge } = rig({ clipClock: true });
    const f20 = bridgeFrameSrc(SMUG_IN_FILES[20]!);
    ready.delete(f20);
    req({ from: "idle", to: "smug" });
    clock.advance(2000);
    assert.equal(names().at(-1), "i019");
    assert.ok(bridge.stats().stalls > 0);
    ready.add(f20);
    clock.advance(5000);
    assert.deepEqual(names(), [...seqOf("i", 0, 48), "live"]);
  });

  it("a send during the intro starts 1084 from o000 (the clips share no frame)", () => {
    const { clock, req, names, bridge } = rig({ clipClock: true });
    req({ from: "idle", to: "smug" });
    clock.advance(10.5 * SMUG_CLIP_FRAME_MS);
    assert.equal(req({ from: "smug", to: "idle" }), true);
    clock.advance(20000);
    assert.deepEqual(names(), [...seqOf("i", 0, 10), ...seqOf("o", 0, 144), "live"]);
    assert.equal(bridge.active(), false);
  });

  it("an unpaired interrupt during the intro hard-cuts; during 1084 the exit finishes", () => {
    const a = rig({ clipClock: true });
    a.req({ from: "idle", to: "smug" });
    a.clock.advance(100);
    assert.equal(a.req({ from: "smug", to: "wave" }), false);
    assert.equal(a.names().at(-1), "live");
    a.clock.advance(5000);
    assert.equal(a.names().at(-1), "live", "dropped frames never come back");

    const b = rig({ clipClock: true });
    b.req({ from: "smug", to: "idle" });
    b.clock.advance(500);
    assert.equal(b.req({ from: "idle", to: "wink" }), true);
    b.clock.advance(20000);
    assert.deepEqual(b.names(), [...seqOf("o", 0, 144), "live"]);
  });

  it("non-paired poses and reduced motion hard-cut: no frame is ever shown", () => {
    const { clock, req, shown } = rig({ clipClock: true });
    for (const [from, to] of [
      ["idle", "pout"],
      ["pout", "smug"],
      ["smug", "talk"],
      [null, "smug"],
      ["idle", "idle"],
    ] as const) {
      assert.equal(req({ from, to }), false, `${from}>${to}`);
    }
    assert.equal(req({ from: "idle", to: "smug", reducedMotion: true }), false);
    assert.equal(req({ from: "smug", to: "idle", reducedMotion: true }), false);
    clock.advance(5000);
    assert.equal(shown.length, 0);
  });

  it("never starts before frame 0 has decoded", () => {
    const { clock, req, shown, ready } = rig({ clipClock: true });
    ready.delete(bridgeFrameSrc(SMUG_IN_FILES[0]!));
    assert.equal(req({ from: "idle", to: "smug" }), false);
    clock.advance(2000);
    assert.equal(shown.length, 0);
  });

  it("cancel drops the rest; dispose clears", () => {
    const { clock, req, names, bridge } = rig({ clipClock: true });
    req({ from: "idle", to: "smug" });
    clock.advance(SMUG_CLIP_FRAME_MS);
    assert.match(bridge.current()!, /smug1085_in\.avif#001/);
    bridge.cancel();
    assert.deepEqual(names(), ["i000", "i001", "live"]);
    assert.equal(clock.pending(), 0);
    bridge.cancel();
    bridge.dispose();
    assert.equal(bridge.current(), null);
  });

  it("without a clock (generic pacing) the order is the same: every frame once", () => {
    const { clock, req, names } = rig();
    req({ from: "idle", to: "smug" });
    clock.advance(49 * 170 + 10);
    assert.deepEqual(names(), [...seqOf("i", 0, 48), "live"]);
  });
});

/** A scripted clip player (the worker stand-in): records calls, the test plays the frames. */
function playerRig() {
  const calls: string[] = [];
  let events: BridgeClipEvents | null = null;
  let files: readonly string[] = [];
  let accept = true;
  const shown: string[] = [];
  const player = {
    play: (f: readonly string[], start: number, ev: BridgeClipEvents) => {
      calls.push(`play ${label(f[0]!)} ${start}`);
      if (!accept) return false;
      files = f;
      events = ev;
      return true;
    },
    stop: () => calls.push("stop"),
    setPaused: (p: boolean) => calls.push(`pause ${p}`),
  };
  const clock = fakeClock(true);
  const bridge = new PoseBridge(clock.timers, () => 0.5, (src) => shown.push(label(src)), undefined, bridgeDwellsFor, player);
  const req = (from: string, to: string) =>
    bridge.request({ from, to, reducedMotion: false, srcFor: bridgeFrameSrc, isReady: () => true });
  return {
    calls,
    shown,
    bridge,
    clock,
    req,
    reject: () => (accept = false),
    events: () => events!,
    count: () => files.length,
  };
}

describe("pose bridge with the off-main-thread clip player", () => {
  it("shows frame 0 at once, mirrors each painted frame, and lands on the live sheet when told", () => {
    const r = playerRig();
    assert.equal(r.req("idle", "smug"), true);
    assert.deepEqual(r.calls, ["play i000 0"]);
    assert.deepEqual(r.shown, ["i000"], "frame 0 goes up in the same task (no live sheet in between)");
    for (let i = 1; i < r.count(); i++) r.events().shown(i);
    r.events().shown(48); // a repeat report changes nothing
    assert.equal(r.clock.pending(), 0, "no timers: the player paces");
    r.events().done();
    assert.deepEqual(r.shown, [...seqOf("i", 0, 48), "live"]);
    assert.equal(r.bridge.active(), false);
  });

  it("a new pair stops the player and starts the next clip from its frame 0; stale reports are ignored", () => {
    const r = playerRig();
    r.req("idle", "smug");
    const old = r.events();
    old.shown(1);
    assert.equal(r.req("smug", "idle"), true);
    assert.deepEqual(r.calls, ["play i000 0", "stop", "play o000 0"]);
    old.shown(2);
    old.done();
    assert.deepEqual(r.shown, ["i000", "i001", "o000"]);
    for (let i = 1; i < 145; i++) r.events().shown(i);
    r.events().done();
    assert.deepEqual(r.shown, ["i000", "i001", ...seqOf("o", 0, 144), "live"]);
  });

  it("forwards page hide / show; a player that cannot start cuts to the live sheet", () => {
    const r = playerRig();
    r.bridge.setPaused(true);
    r.bridge.setPaused(false);
    assert.deepEqual(r.calls, ["pause true", "pause false"]);
    r.reject();
    assert.equal(r.req("idle", "smug"), false);
    assert.deepEqual(r.shown, ["i000", "live"]);
  });

  it("cancel stops the player", () => {
    const r = playerRig();
    r.req("idle", "smug");
    r.bridge.cancel();
    assert.deepEqual(r.calls, ["play i000 0", "stop"]);
    assert.deepEqual(r.shown, ["i000", "live"]);
  });
});

describe("smug files", () => {
  it("the hold is pre-cut and versioned; no clip frame is a sheet or in the decode queue", () => {
    assert.ok((PRE_CUT_ALPHA_FILES as readonly string[]).includes(SMUG_HOLD_FILE));
    assert.equal(spriteNeedsWhitePunch(SPRITES.poses.smug), false);
    assert.match(SPRITES.poses.smug, /smug1085_hold\.webp\?v=rgba3$/);
    const deferred = deferredSpriteUrls();
    assert.equal(deferred.filter((src) => /\.avif/.test(src)).length, 0);
    assert.equal(deferred.filter((src) => /smug9\d\d/.test(src)).length, 0);
    assert.equal((PRE_CUT_ALPHA_FILES as readonly string[]).some((f) => /smug9\d\d|\.avif/.test(f)), false);
  });
});
