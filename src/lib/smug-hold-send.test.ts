import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRIDGE_MIN_AFTER_PAINT_MS,
  BridgeDriver,
  PoseBridge,
  SMUG_IN_DWELL_MS,
  SMUG_OUT_DWELL_MS,
  SmugReleaseGate,
  bridgeDwellsFor,
  bridgeFiles,
  bridgeKeyOfPlates,
} from "./pose-bridge.ts";
import { DEFAULT_EMOTION, bridgeFrameSrc, layersFor, type EmotionId, type PoseId, type SpriteLayer } from "./rai.ts";

/**
 * paste-14: smug968_hold has no timer. It holds until the user's next send, which plays
 * 973 forward to idle before the next pose (a new smug runs 968 again from idle). 968 and
 * 973 run at the clip's own timing, paint-paced, never skipping a frame.
 */

function clock() {
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
      now: () => now,
    },
    now: () => now,
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

function short(src: string): string {
  const inn = /smug968_in_(\d\d)/.exec(src);
  if (inn) return `i${inn[1]}`;
  const out = /smug973_out_(\d\d)/.exec(src);
  if (out) return `o${out[1]}`;
  if (/smug968_hold/.test(src)) return "hold";
  if (/wink/.test(src)) return "wink";
  if (/idle/.test(src)) return "idle";
  return src.split("/").pop()!;
}

/**
 * The puppet's chain without React: wanted state -> SmugReleaseGate -> plates ->
 * BridgeDriver, paints every 16 ms (rAF), and the land callback (bridge off -> paint ->
 * 150 ms of idle -> wanted pose) the stage runs after 973.
 */
function stage(opts: { paintEvery?: number } = {}) {
  const c = clock();
  const paintEvery = opts.paintEvery ?? 16;
  let bridgeSrc: string | null = null;
  const paintQ: Array<() => void> = [];
  let landAt = -1;
  let dirty = false;
  const gate = new SmugReleaseGate(0);
  let release = 0;
  let wanted: { pose: PoseId; emotion: EmotionId } = { pose: "idle", emotion: "glance" };
  let plates: SpriteLayer[] = [];
  const timeline: Array<{ t: number; name: string }> = [];
  const bridge = new PoseBridge(
    c.timers,
    () => 0.5,
    (src) => {
      bridgeSrc = src;
      dirty = true;
      if (src === null && gate.exiting()) landAt = c.now() + paintEvery + 150;
    },
    (fn) => {
      paintQ.push(fn);
      return () => {
        const i = paintQ.indexOf(fn);
        if (i >= 0) paintQ.splice(i, 1);
      };
    },
    bridgeDwellsFor,
  );
  const driver = new BridgeDriver(bridge);
  const ready = new Set(bridgeFiles().map(bridgeFrameSrc));
  const rest = () =>
    layersFor({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false, amplitude: 0, angle: 0, blink: 0, mouth: 0 });
  const render = () => {
    let next = layersFor({ ...wanted, talking: false, amplitude: 0, angle: 0, blink: 0, mouth: 0 });
    const step = gate.step({
      shownKey: bridgeKeyOfPlates(plates),
      wantedKey: bridgeKeyOfPlates(next),
      release,
      entering: bridgeSrc != null && /smug968_in_/.test(bridgeSrc),
    });
    if (step === "keep-shown") next = plates;
    else if (step === "exit-to-idle") next = rest();
    plates = next;
    driver.commit(plates, { reducedMotion: false, srcFor: bridgeFrameSrc, isReady: (s) => ready.has(s) });
    if (gate.exiting() && bridgeKeyOfPlates(plates) === "idle" && !bridge.active() && landAt < 0) {
      landAt = c.now() + paintEvery + 150;
    }
  };
  const look = () => {
    const name = short(bridgeSrc ?? plates[0]?.src ?? "");
    if (timeline.at(-1)?.name !== name) timeline.push({ t: c.now(), name });
  };
  const api = {
    timeline,
    names: () => timeline.map((e) => e.name),
    at: (name: string, from = 0) => timeline.find((e, i) => i >= from && e.name === name)?.t ?? -1,
    set(pose: PoseId, emotion: EmotionId) {
      wanted = { pose, emotion };
      render();
      look();
    },
    /** The user's next send (requestSmugRelease), optionally with the turn-start pose. */
    send(pose?: PoseId, emotion?: EmotionId) {
      release += 1;
      if (pose) wanted = { pose, emotion: emotion ?? "glance" };
      render();
      look();
    },
    wait(ms: number) {
      for (let t = 0; t < ms; t += paintEvery) {
        c.advance(paintEvery);
        look();
        // bridgeSrc is a render input of the plates memo (the stage re-renders per frame)
        if (dirty) {
          dirty = false;
          render();
          look();
        }
        for (const fn of paintQ.splice(0)) fn();
        if (landAt >= 0 && c.now() >= landAt) {
          landAt = -1;
          if (gate.exiting() && !bridge.active() && bridgeKeyOfPlates(plates) === "idle") {
            gate.landed();
            render();
            look();
          }
        }
      }
    },
    hidden(on: boolean) {
      bridge.setPaused(on);
    },
  };
  return api;
}

const IN = ["i01", "i02", "i03", "i04", "i05", "hold"];
const OUT = ["o01", "o02", "o03", "o04", "o05", "idle"];

function seq(names: string[], want: string[], from = 0): number {
  for (let i = from; i <= names.length - want.length; i++) {
    if (want.every((v, j) => names[i + j] === v)) return i;
  }
  return -1;
}

describe("clip timing for 968 / 973 (paint-paced)", () => {
  it("schedules: 968 01@0 02@0.5 03@1.0 04@1.6 05@2.2 s; 973 02@0.35 03@0.75 04@1.05 05@1.35, idle 1.7 s", () => {
    assert.deepEqual([...SMUG_IN_DWELL_MS], [500, 500, 600, 600, 150]);
    assert.deepEqual([...SMUG_OUT_DWELL_MS], [350, 400, 300, 300, 350]);
    assert.equal(bridgeDwellsFor("idle", "smug"), SMUG_IN_DWELL_MS);
    assert.equal(bridgeDwellsFor("smug", "idle"), SMUG_OUT_DWELL_MS);
    assert.equal(bridgeDwellsFor("idle", "wink"), null);
    for (const ms of SMUG_OUT_DWELL_MS) assert.ok(ms >= 200 && ms <= 400, `exit frame ${ms} ms`);
  });

  it("entry lands each frame on the clip's time (within one paint), never skipping", () => {
    const s = stage();
    s.set("idle", "glance");
    s.wait(100);
    s.set("smug", "smug");
    s.wait(3000);
    const n = s.names();
    const i = seq(n, IN);
    assert.ok(i >= 0, n.join(">"));
    const t0 = s.at("i01");
    const want = { i02: 500, i03: 1000, i04: 1600, i05: 2200, hold: 2350 };
    for (const [name, ms] of Object.entries(want)) {
      const d = s.at(name) - t0;
      assert.ok(d >= ms && d <= ms + 32, `${name} at ${d} ms, want ~${ms}`);
    }
  });

  it("slow paints do not stretch the clip (dwell counts from when the frame was set)", () => {
    const s = stage({ paintEvery: 120 });
    s.set("idle", "glance");
    s.wait(240);
    s.set("smug", "smug");
    s.wait(4000);
    const t0 = s.at("i01");
    const d = s.at("i05") - t0;
    assert.ok(d >= 2200 && d <= 2200 + 240, `i05 at ${d}`);
    assert.ok(seq(s.names(), IN) >= 0, s.names().join(">"));
    assert.ok(BRIDGE_MIN_AFTER_PAINT_MS > 0);
  });
});

describe("smug968_hold holds until the next send (no timer)", () => {
  function onHold() {
    const s = stage();
    s.set("idle", "glance");
    s.wait(100);
    s.set("smug", "smug");
    s.wait(3000);
    return s;
  }

  it("the hold persists 30 s+ with no 973 (line ended, speech over, cancel or error alike)", () => {
    const s = onHold();
    s.wait(45_000);
    const n = s.names();
    assert.equal(n.at(-1), "hold");
    assert.equal(n.some((x) => x.startsWith("o")), false, n.join(">"));
  });

  it("a non-smug send: 973 plays fully, lands on idle, then the next pose", () => {
    const s = onHold();
    s.wait(30_000);
    const sendAt = s.timeline.at(-1)!.t + 30_000;
    s.send("idle", "glance");
    s.wait(200);
    // the reply's pose arrives while 973 is still going: it waits
    s.set("wink", "bratty");
    s.wait(3000);
    const n = s.names();
    const o = seq(n, OUT);
    assert.ok(o >= 0, n.join(">"));
    assert.equal(n[o + OUT.length], "wink", n.join(">"));
    const t0 = s.at("o01");
    assert.ok(t0 >= sendAt - 20, "973 starts on the send");
    const want = { o02: 350, o03: 750, o04: 1050, o05: 1350, idle: 1700 };
    for (const [name, ms] of Object.entries(want)) {
      const d = s.at(name, o) - t0;
      assert.ok(d >= ms && d <= ms + 32, `${name} at ${d} ms, want ~${ms}`);
    }
    const idleAt = s.at("idle", o);
    const winkAt = s.at("wink", o);
    assert.ok(winkAt - idleAt >= 150, `idle sits ${winkAt - idleAt} ms before the next pose`);
  });

  it("Smug -> Smug back to back: 973 forward, idle, then 968 again from idle", () => {
    const s = onHold();
    s.wait(5000);
    // a new named smug: pose stays smug, only the send says "release"
    s.send();
    s.wait(5000);
    const n = s.names();
    const o = seq(n, OUT);
    assert.ok(o >= 0, n.join(">"));
    assert.ok(seq(n, IN, o) > o, `968 again after 973: ${n.join(">")}`);
    assert.equal(n.at(-1), "hold");
    s.wait(40_000);
    assert.equal(s.names().at(-1), "hold", "the second hold also waits for a send");
  });

  it("a send while 968 is still coming in lets it reach the hold, then 973 goes out", () => {
    const s = stage();
    s.set("idle", "glance");
    s.wait(100);
    s.set("smug", "smug");
    s.wait(700);
    s.send("idle", "glance");
    s.wait(5000);
    const n = s.names();
    assert.ok(seq(n, [...IN, ...OUT]) >= 0, n.join(">"));
  });

  it("never swaps from the hold straight to idle", () => {
    const s = onHold();
    s.send("idle", "glance");
    s.wait(3000);
    const n = s.names();
    const h = n.indexOf("hold");
    assert.equal(n[h + 1], "o01", n.join(">"));
  });

  it("a hidden tab freezes 973 on its frame and finishes it on return; the hold survives hide/show", () => {
    const s = onHold();
    s.hidden(true);
    s.wait(10_000);
    s.hidden(false);
    s.wait(1000);
    assert.equal(s.names().at(-1), "hold");
    s.send("idle", "glance");
    s.wait(500);
    s.hidden(true);
    s.wait(8000);
    s.hidden(false);
    s.wait(3000);
    const n = s.names();
    assert.ok(seq(n, OUT) >= 0, n.join(">"));
  });
});
