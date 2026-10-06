import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BridgeDriver, PoseBridge, SmugReleaseGate, bridgeDwellsFor, bridgeFiles, bridgeKeyOfPlates } from "./pose-bridge.ts";
import {
  readSmugReleasePending,
  requestSmugRelease,
  setPosePhase,
  setPoseStageMounted,
  setSmugReleasePending,
  subscribeSmugReleaseLanded,
} from "./pose-phase.ts";
import {
  DEFAULT_EMOTION,
  POSE_HOLD_MIN_MS,
  bridgeFrameSrc,
  layersFor,
  smugWinkTextRestDelayMs,
  textChewMs,
  type EmotionId,
  type PoseId,
  type SpriteLayer,
} from "./rai.ts";

/**
 * paste-15: after a held smug the next reply's pose and chew clocks start when the
 * stage lets the next pose on (1084 -> idle -> pose), not when the line lands behind 1084.
 */

const here = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(here, "../components/rai-app.tsx"), "utf8");
const puppet = readFileSync(join(here, "../components/puppet.tsx"), "utf8");

function reset() {
  setSmugReleasePending(false);
  setPoseStageMounted(true);
  setPosePhase("idle");
}

describe("pose-phase: smug release pending / landed", () => {
  it("a send while the stage is on the smug beat marks the release pending at once", () => {
    for (const phase of ["bridge-in", "hold", "bridge-out"] as const) {
      reset();
      setPosePhase(phase);
      requestSmugRelease();
      assert.equal(readSmugReleasePending(), true, phase);
    }
  });

  it("a send while idle (or with no stage) defers nothing", () => {
    reset();
    requestSmugRelease();
    assert.equal(readSmugReleasePending(), false);
    setPosePhase("hold");
    setPoseStageMounted(false);
    requestSmugRelease();
    assert.equal(readSmugReleasePending(), false);
    setPoseStageMounted(true);
  });

  it("landed listeners hear the pending -> clear edge once; unmount also releases", () => {
    reset();
    let heard = 0;
    const off = subscribeSmugReleaseLanded(() => (heard += 1));
    setSmugReleasePending(true);
    setSmugReleasePending(true);
    assert.equal(heard, 0);
    setSmugReleasePending(false);
    setSmugReleasePending(false);
    assert.equal(heard, 1);
    setSmugReleasePending(true);
    setPoseStageMounted(false);
    assert.equal(heard, 2, "no stage: never wait for ever");
    off();
    setPoseStageMounted(true);
  });
});

/**
 * Stage (gate + bridge + paints) publishing pending like the puppet's effect, and an
 * app clock model: the line lands at `landAt` ms after the send; actLandedAt / chew start
 * at land, or at the landed notice when the release is pending.
 */
function run(opts: { sendAt: "hold" | "entry"; landAfterSend: number; line: string }) {
  reset();
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const timers = {
    set: (fn: () => void, ms: number) => {
      seq += 1;
      due.set(seq, { at: now + ms, fn });
      return seq;
    },
    clear: (h: number) => void due.delete(h),
    now: () => now,
  };
  const paintQ: Array<() => void> = [];
  let bridgeSrc: string | null = null;
  let dirty = false;
  const gate = new SmugReleaseGate(0);
  let release = 0;
  let landAt = -1;
  let wanted: { pose: PoseId; emotion: EmotionId } = { pose: "idle", emotion: "glance" };
  let plates: SpriteLayer[] = [];
  const shown: Array<{ t: number; name: string }> = [];
  const bridge = new PoseBridge(
    timers,
    () => 0.5,
    (src) => {
      bridgeSrc = src;
      dirty = true;
      if (src === null && gate.exiting()) landAt = now + 16 + 70;
    },
    (fn) => {
      paintQ.push(fn);
      return () => void 0;
    },
    bridgeDwellsFor,
  );
  const driver = new BridgeDriver(bridge);
  const ready = new Set(bridgeFiles().map(bridgeFrameSrc));
  const rest = () => layersFor({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false, amplitude: 0, angle: 0 });
  let step = "wanted";
  const render = () => {
    let next = layersFor({ ...wanted, talking: false, amplitude: 0, angle: 0 });
    step = gate.step({
      shownKey: bridgeKeyOfPlates(plates),
      wantedKey: bridgeKeyOfPlates(next),
      release,
      entering: bridgeSrc != null && /smug1085_in/.test(bridgeSrc),
    });
    if (step === "keep-shown") next = plates;
    else if (step === "exit-to-idle") next = rest();
    plates = next;
    driver.commit(plates, { reducedMotion: false, srcFor: bridgeFrameSrc, isReady: (s) => ready.has(s) });
    const phase = bridgeSrc ? (bridgeKeyOfPlates(plates) === "smug" ? "bridge-in" : "bridge-out") : bridgeKeyOfPlates(plates) === "smug" ? "hold" : "idle";
    setPosePhase(phase);
    setSmugReleasePending(step !== "wanted"); // the puppet's commit effect
    const name = bridgeSrc ? bridgeSrc.split("/").pop()!.split("?")[0]! : bridgeKeyOfPlates(plates) === "smug" ? "hold" : String(wanted.pose === "idle" || step !== "wanted" ? "idle" : wanted.pose);
    if (shown.at(-1)?.name !== name) shown.push({ t: now, name });
  };
  const tick = (ms: number) => {
    const end = now + ms;
    while (now < end) {
      now += 16;
      for (;;) {
        let pick: [number, { at: number; fn: () => void }] | null = null;
        for (const e of due) if (e[1].at <= now && (!pick || e[1].at < pick[1].at)) pick = e;
        if (!pick) break;
        due.delete(pick[0]);
        pick[1].fn();
      }
      if (dirty) {
        dirty = false;
        render();
      }
      for (const fn of paintQ.splice(0)) fn();
      if (landAt >= 0 && now >= landAt) {
        landAt = -1;
        if (gate.exiting() && !bridge.active()) {
          gate.landed();
          render();
        }
      }
    }
  };
  // app clock model
  let deferred: { line: string } | null = null;
  let actLandedAt = -1;
  let chewFrom = -1;
  const off = subscribeSmugReleaseLanded(() => {
    if (!deferred) return;
    actLandedAt = now;
    chewFrom = now;
    deferred = null;
  });
  render();
  tick(100);
  wanted = { pose: "smug", emotion: "smug" };
  render();
  tick(opts.sendAt === "hold" ? 6000 : 700);
  const sendT = now;
  release += 1;
  requestSmugRelease();
  wanted = { pose: "wink", emotion: "bratty" };
  render();
  tick(opts.landAfterSend);
  if (readSmugReleasePending()) deferred = { line: opts.line };
  else {
    actLandedAt = now;
    chewFrom = now;
  }
  tick(12_000);
  off();
  const idleAt = shown.find((e) => e.t > sendT && e.name === "idle")?.t ?? -1;
  const poseAt = shown.find((e) => e.t > sendT && e.name === "wink")?.t ?? -1;
  return { sendT, idleAt, poseAt, actLandedAt, chewFrom, names: shown.map((e) => e.name) };
}

describe("next reply after a held smug: clocks start when the pose goes on", () => {
  it("a 28-char line landing during 1084 chews its full length after idle", () => {
    const line = "Ugh, fine. What do you want";
    const r = run({ sendAt: "hold", landAfterSend: 400, line });
    assert.ok(r.idleAt > r.sendT + 1600, r.names.join(">"));
    assert.ok(r.chewFrom >= r.idleAt + 70, `chew starts ${r.chewFrom - r.idleAt} ms after idle`);
    assert.equal(r.chewFrom, r.poseAt, "chew and pose start together, as the stage lets the pose on");
    assert.ok(textChewMs(line) > 0);
  });

  it("the wink gets its full hold after idle (not the remainder of a timer from land)", () => {
    const r = run({ sendAt: "hold", landAfterSend: 600, line: "Hmph. Here is your wink~" });
    const delay = smugWinkTextRestDelayMs({
      voiced: false,
      chewUntil: 0,
      pose: "wink",
      emotion: "bratty",
      actLandedAt: r.actLandedAt,
      now: r.poseAt,
    });
    assert.ok(delay != null && delay >= POSE_HOLD_MIN_MS - 1, `wink visible ${delay} ms`);
  });

  it("a send during 1085 entry: 1085 finishes, hold, 1084, idle, then the pose with its full time", () => {
    const r = run({ sendAt: "entry", landAfterSend: 300, line: "Wink. Catch it~" });
    const n = r.names;
    // 1085 frame 48 is the hold frame: 1085 runs to its end (never past it), then 1084
    const iLast = n.indexOf("smug1085_in.avif#048");
    const iOut = n.indexOf("smug1084_out.avif#000");
    assert.ok(iLast > 0 && iOut > iLast && n.slice(iLast + 1, iOut).every((x) => x === "hold"), n.join(">"));
    const out = Array.from({ length: 145 }, (_, k) => `smug1084_out.avif#${String(k).padStart(3, "0")}`);
    assert.deepEqual(n.slice(iOut, iOut + 147), [...out, "idle", "wink"]);
    assert.ok(r.actLandedAt >= r.idleAt + 70, `act clock starts ${r.actLandedAt - r.idleAt} ms after idle`);
    assert.equal(r.actLandedAt, r.poseAt);
  });

  it("a line that lands after the release is done keeps the old clock (at land)", () => {
    // 1084 is 6.04 s + the idle landing: a line 7 s after the send lands after it.
    const r = run({ sendAt: "hold", landAfterSend: 7000, line: "Late reply, darling" });
    assert.ok(r.actLandedAt >= r.sendT + 7000 && r.actLandedAt < r.sendT + 7100);
  });
});

describe("app / stage wiring (source contracts)", () => {
  it("chew and act clocks defer while the release is pending and start on the landed notice", () => {
    const chew = app.slice(app.indexOf("function armTextChew("), app.indexOf("async function complete("));
    assert.match(chew, /if \(readSmugReleasePending\(\)\) \{\s*releaseDeferRef\.current = \{ line \};\s*return;/);
    assert.match(app, /const markActLanded = \(\) => \{\s*if \(readSmugReleasePending\(\)\)/);
    // stream, land, named send, turn start and error all go through markActLanded
    assert.ok((app.match(/markActLanded\(\);/g) ?? []).length >= 5);
    const sub = app.slice(app.indexOf("subscribeSmugReleaseLanded(() => {"), app.indexOf("setReleaseLandTick((n) => n + 1);"));
    assert.match(sub, /actLandedAt\.current = Date\.now\(\);/);
    assert.match(sub, /if \(deferred\.line && !lineVoicedRef\.current\) armTextChewRef\.current\(deferred\.line\);/);
    assert.match(app, /if \(releaseDeferRef\.current && readSmugReleasePending\(\)\) return;/);
    assert.match(app, /voiced: lineVoicedRef\.current && !actDeferredRef\.current,/);
    assert.match(app, /chewBlocksReturn, releaseLandTick\]\);/);
  });

  it("the puppet publishes the gate state after each commit and decodes wink during the hold", () => {
    assert.match(puppet, /setSmugReleasePending\(smugGateStep\.current !== "wanted"\);/);
    assert.match(puppet, /if \(phase !== "hold"\) return;\s*void punchOneRef\.current\(SPRITES\.poses\.wink\);/);
    assert.match(puppet, /const SMUG_EXIT_LAND_MS = 70;/);
  });
});
