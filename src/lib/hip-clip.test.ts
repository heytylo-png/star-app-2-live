import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HIP_CLIP_CROP,
  HIP_CLIP_FRAMES,
  HIP_CLIP_LAST,
  HIP_CLIP_MAX_ATTEMPTS,
  HIP_TICK_MS,
  HipClipDriver,
  HipClipPlayer,
  hipClipTimeMs,
  HIP_CUT_LINGER_MS,
  hipFrameDwellMs,
  hipTravelMs,
  hipClipSupported,
  loadHipClip,
  type ClipHost,
  type ClipView,
} from "./hip-clip.ts";
import { SPRITES, deferredSpriteUrls, stagePreloadOrder } from "./rai.ts";
import { bridgeFiles } from "./pose-bridge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A 60 Hz display with a hand-cranked clock. `stall(ms)` skips frames like a busy main thread. */
function rig() {
  const state = { now: 1000, lag: 0, queue: [] as ((ts: number) => void)[], draws: [] as { t: number; i: number }[], hides: [] as number[], shows: 0, views: [] as ClipView[] };
  const host: ClipHost = {
    raf: (cb) => {
      state.queue.push(cb);
      return state.queue.length;
    },
    cancelRaf: () => {
      state.queue = [];
    },
    now: () => state.now + state.lag,
    draw: (i) => state.draws.push({ t: state.now + state.lag, i }),
    show: () => {
      state.shows += 1;
    },
    hide: () => state.hides.push(state.now),
    onView: (v) => state.views.push(v),
  };
  const player = new HipClipPlayer(host);
  const frame = (n = 1) => {
    for (let k = 0; k < n; k++) {
      state.now += 1000 / 60;
      const cbs = state.queue;
      state.queue = [];
      for (const cb of cbs) cb(state.now);
    }
  };
  const stall = (ms: number) => {
    state.now += ms;
  };
  return { state, player, frame, stall };
}

describe("hip clip data", () => {
  it("is the clip's travel: 29 then 30..78 every third tick, 18 pictures", () => {
    assert.equal(HIP_CLIP_FRAMES.length, 18);
    assert.deepEqual(HIP_CLIP_FRAMES.map((f) => f.source), [29, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78]);
    assert.equal(HIP_CLIP_LAST, 17);
    assert.equal(hipFrameDwellMs(0), HIP_TICK_MS);
    assert.equal(hipFrameDwellMs(5), 3 * HIP_TICK_MS);
    assert.equal(hipClipTimeMs(1), 1250);
    assert.equal(hipClipTimeMs(17), 3250);
    assert.ok(Math.abs(hipTravelMs() - 49 * HIP_TICK_MS) < 0.01);
  });

  it("the clip pictures are no longer shipped (paste-13 retired the hip clip from public/)", () => {
    for (const f of HIP_CLIP_FRAMES) assert.equal(existsSync(join(root, "public", f.file)), false, f.file);
  });

  it("preloads the 1085 hold; the 1085 / 1084 clips load in the clip worker (hip clip retired)", () => {
    const order = stagePreloadOrder({ clip: true });
    assert.deepEqual(order.beat.map((u) => u.split("?")[0]!.replace(/^.*\/rai\//, "rai/")), [
      "rai/smug1085_hold.webp",
      "rai/wave1126_hold.webp",
    ]);
    assert.ok(!order.beat.some((u) => /\/hip\//.test(u)));
    for (const skip of [true, false]) {
      const deferred = deferredSpriteUrls({ skipBridge: skip });
      for (const file of bridgeFiles()) assert.ok(!deferred.some((u) => u.includes(file.split("#")[0]!)), file);
    }
    assert.equal(hipClipSupported(), false);
  });
});

describe("hip clip player", () => {
  it("entry: every picture 00..17 once, in order, each held for its ticks, then hands off to the hold sheet", () => {
    const { state, player, frame } = rig();
    player.playIn();
    assert.equal(state.shows, 1);
    assert.deepEqual(state.draws.map((d) => d.i), [0]);
    frame(30); // not confirmed on screen yet: nothing changes
    assert.deepEqual(state.draws.map((d) => d.i), [0]);
    player.confirmShown();
    frame(400);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: 18 }, (_, i) => i));
    for (let k = 1; k < state.draws.length - 1; k++) {
      const dwell = state.draws[k + 1]!.t - state.draws[k]!.t;
      assert.ok(Math.abs(dwell - hipFrameDwellMs(k)) <= 18, `picture ${k} held ${dwell.toFixed(0)} ms`);
    }
    assert.equal(player.view().index, HIP_CLIP_LAST);
    assert.equal(player.view().visible, false);
    assert.equal(player.view().arrived, true);
    assert.equal(state.hides.length, 1);
    frame(600); // hold sheet is up: no more clip draws
    assert.equal(state.draws.length, 18);
    assert.equal(state.hides.length, 1);
  });

  it("exit: the same pictures backwards 17..00, then hands back to the live sheet", () => {
    const { state, player, frame } = rig();
    player.playIn();
    player.confirmShown();
    frame(400);
    assert.equal(player.view().arrived, true);
    state.draws.length = 0;
    const hidesBefore = state.hides.length;
    player.playOut();
    player.confirmShown();
    assert.equal(player.view().dir, "out");
    frame(500);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: 18 }, (_, i) => HIP_CLIP_LAST - i));
    assert.equal(state.hides.length, hidesBefore + 1);
    assert.equal(player.view().visible, false);
    assert.equal(player.view().arrived, false);
    const last = state.draws.at(-1)!;
    assert.ok(state.hides.at(-1)! - last.t >= HIP_TICK_MS - 18);
  });

  it("a stall never skips a picture or squeezes one", () => {
    const { state, player, frame, stall } = rig();
    player.playIn();
    player.confirmShown();
    frame(10);
    stall(400);
    frame(2);
    stall(250);
    frame(2);
    frame(500);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: 18 }, (_, i) => i));
    for (let k = 1; k < state.draws.length - 1; k++) {
      const dwell = state.draws[k + 1]!.t - state.draws[k]!.t;
      assert.ok(dwell >= hipFrameDwellMs(k) - 18, `picture ${k} squeezed to ${dwell.toFixed(0)} ms`);
    }
  });

  it("a long task before the callback (stale frame timestamp) does not squeeze the next picture", () => {
    const { state, player, frame } = rig();
    player.playIn();
    player.confirmShown();
    frame(12);
    for (let k = 0; k < 6; k++) {
      state.lag = 110;
      frame(1);
      state.lag = 0;
      frame(3);
    }
    frame(600);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: 18 }, (_, i) => i));
    for (let k = 1; k < state.draws.length - 1; k++) {
      const dwell = state.draws[k + 1]!.t - state.draws[k]!.t;
      assert.ok(dwell >= hipFrameDwellMs(k) - 18, `picture ${k} squeezed to ${dwell.toFixed(0)} ms`);
    }
  });

  it("a cut with linger (clip visible mid-travel) keeps the picture up until the live layer has risen", () => {
    const { state, player, frame } = rig();
    player.playIn();
    player.confirmShown();
    frame(20);
    assert.equal(player.view().visible, true);
    const t0 = state.now;
    const hidesBefore = state.hides.length;
    player.cut(HIP_CUT_LINGER_MS);
    frame(3);
    assert.equal(state.hides.length, hidesBefore, "still up after ~50 ms");
    assert.equal(player.view().visible, true);
    frame(10);
    assert.equal(state.hides.length, hidesBefore + 1);
    assert.ok(state.hides.at(-1)! - t0 >= HIP_CUT_LINGER_MS - 1 && state.hides.at(-1)! - t0 <= HIP_CUT_LINGER_MS + 40);
    assert.equal(player.view().visible, false);
  });

  it("reduced motion: smug -> idle clears the hold sheet flag (live crossfade); smug -> other pose cuts", () => {
    const a = rig();
    const d = new HipClipDriver(a.player);
    d.commit("idle", { reducedMotion: true, ready: true });
    d.commit("smug", { reducedMotion: true, ready: true });
    assert.equal(a.player.view().arrived, true);
    a.frame(2);
    d.commit("idle", { reducedMotion: true, ready: true });
    assert.equal(a.player.view().arrived, false);
    const b = rig();
    const e = new HipClipDriver(b.player);
    e.commit("idle", { reducedMotion: false, ready: true });
    e.commit("smug", { reducedMotion: false, ready: true });
    b.player.confirmShown();
    b.frame(400);
    assert.equal(b.player.view().arrived, true);
    e.commit(null, { reducedMotion: false, ready: true });
    assert.equal(b.player.view().arrived, false);
  });

  it("a new playIn during a linger cancels the hide and resumes travel", () => {
    const { player, frame } = rig();
    player.playIn();
    player.confirmShown();
    frame(20);
    player.cut(HIP_CUT_LINGER_MS);
    frame(2);
    player.playIn();
    player.confirmShown();
    frame(500);
    assert.equal(player.view().arrived, true);
    assert.equal(player.view().visible, false);
  });

  it("an exit that starts mid-entry reverses from the picture that is up (no jump)", () => {
    const { state, player, frame } = rig();
    player.playIn();
    player.confirmShown();
    frame(40);
    const at = player.view().index;
    assert.ok(at > 1 && at < HIP_CLIP_LAST);
    state.draws.length = 0;
    player.playOut();
    frame(400);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: at }, (_, i) => at - 1 - i));
    assert.equal(state.shows, 1);
    assert.equal(state.hides.length, 1);
  });

  it("an entry that starts mid-exit resumes forward from the picture that is up", () => {
    const { state, player, frame } = rig();
    player.playIn();
    player.confirmShown();
    frame(400);
    assert.equal(player.view().arrived, true);
    player.playOut();
    player.confirmShown();
    frame(40);
    const at = player.view().index;
    assert.ok(at > 1 && at < HIP_CLIP_LAST, `expected mid-exit index, got ${at}`);
    state.draws.length = 0;
    const hidesBefore = state.hides.length;
    player.playIn();
    frame(400);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: HIP_CLIP_LAST - at }, (_, i) => at + 1 + i));
    assert.equal(player.view().arrived, true);
    assert.equal(state.hides.length, hidesBefore + 1);
  });

  it("jumpToHold lands on the hold sheet (canvas off); cut() clears arrived", () => {
    const { state, player, frame } = rig();
    player.jumpToHold();
    assert.deepEqual(state.draws.map((d) => d.i), []);
    assert.equal(player.view().visible, false);
    assert.equal(player.view().arrived, true);
    frame(60);
    assert.equal(state.draws.length, 0);
    player.cut();
    assert.equal(player.view().arrived, false);
    assert.equal(player.view().visible, false);
  });

  it("playIn hands off to the hold sheet after the last travel picture; playOut restarts the clip backward", () => {
    const { state, player, frame } = rig();
    player.playIn();
    player.confirmShown();
    frame(500);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: 18 }, (_, i) => i));
    assert.equal(player.view().arrived, true);
    assert.equal(player.view().visible, false);
    assert.equal(state.hides.length, 1);
    state.draws.length = 0;
    player.playOut();
    player.confirmShown();
    frame(500);
    assert.equal(state.draws[0]!.i, HIP_CLIP_LAST);
    assert.deepEqual(state.draws.map((d) => d.i), Array.from({ length: 18 }, (_, i) => HIP_CLIP_LAST - i));
    assert.equal(player.view().visible, false);
    assert.equal(player.view().arrived, false);
    assert.equal(state.hides.length, 2);
  });
});

describe("hip clip driver", () => {
  function driverRig() {
    const r = rig();
    const d = new HipClipDriver(r.player);
    const go = (key: string | null, o: Partial<{ reducedMotion: boolean; ready: boolean }> = {}) =>
      d.commit(key, { reducedMotion: false, ready: true, ...o });
    return { ...r, d, go };
  }

  it("idle -> smug plays in; smug -> idle clears the hold (1084 forward is PoseBridge)", () => {
    const { state, player, go, frame } = driverRig();
    go("idle");
    assert.equal(player.view().visible, false);
    go("smug");
    player.confirmShown();
    frame(400);
    assert.equal(state.draws.length, 18);
    assert.equal(player.view().arrived, true);
    assert.equal(state.hides.length, 1);
    go("idle");
    assert.equal(player.view().arrived, false);
    assert.equal(player.view().visible, false);
    // No clip reverse: no further draws
    frame(400);
    assert.equal(state.draws.length, 18);
  });

  it("deduped on the key: a re-commit of the same key does nothing", () => {
    const { state, go } = driverRig();
    go("idle");
    go("smug");
    const n = state.draws.length;
    go("smug");
    go("smug");
    assert.equal(state.draws.length, n);
    assert.equal(state.shows, 1);
  });

  it("smug from a pose that is not idle, or with reduced motion, is a cut onto the hold sheet; never a clip frame", () => {
    const a = driverRig();
    a.go("wave");
    a.go("smug");
    assert.deepEqual(a.state.draws.map((d) => d.i), []);
    assert.equal(a.player.view().arrived, true);
    const b = driverRig();
    b.go("idle");
    b.go("smug", { reducedMotion: true });
    assert.deepEqual(b.state.draws.map((d) => d.i), []);
    assert.equal(b.player.view().arrived, true);
    b.go("idle", { reducedMotion: true });
    assert.equal(b.player.view().arrived, false);
    assert.equal(b.player.view().visible, false);
  });

  it("smug -> a different pose is a cut back", () => {
    const { state, go, player } = driverRig();
    go("idle");
    go("smug");
    player.confirmShown();
    go("wave");
    assert.equal(state.hides.length, 1);
  });

  it("does nothing until the clip is ready", () => {
    const { state, go } = driverRig();
    go("idle");
    go("smug", { ready: false });
    assert.equal(state.draws.length, 0);
  });
});

describe("hip clip loader", () => {
  it("loads every picture in play order, retrying the ones that fail", async () => {
    const failures = new Map<string, number>([["hip_bridge_03", 2], ["hip_bridge_11", 1]]);
    const seen: number[] = [];
    const out = await loadHipClip<number>({
      srcFor: (f) => f,
      fetchBlob: async (src) => {
        for (const [k, left] of failures) {
          if (src.includes(k) && left > 0) {
            failures.set(k, left - 1);
            throw new Error("net");
          }
        }
        return new Blob([src]);
      },
      decode: async (b) => Number((await b.text()).match(/hip_bridge_(\d\d)/)![1]),
      onFrame: (i) => seen.push(i),
      wait: async () => {},
    });
    assert.deepEqual(out, Array.from({ length: 18 }, (_, i) => i));
    assert.equal(seen.length, 18);
  });

  it("gives up (null) when a picture never loads, and stops when cancelled", async () => {
    let calls = 0;
    const dead = await loadHipClip<number>({
      srcFor: (f) => f,
      fetchBlob: async (src) => {
        calls += 1;
        if (src.includes("hip_bridge_05")) throw new Error("404");
        return new Blob([src]);
      },
      decode: async () => 1,
      wait: async () => {},
    });
    assert.equal(dead, null);
    assert.ok(calls >= HIP_CLIP_MAX_ATTEMPTS);
    const cancelled = await loadHipClip<number>({
      srcFor: (f) => f,
      fetchBlob: async (src) => new Blob([src]),
      decode: async () => 1,
      cancelled: () => true,
      wait: async () => {},
    });
    assert.equal(cancelled, null);
  });
});

describe("puppet wiring", () => {
  const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
  it("one canvas, live sheets hidden while it is up, phase read off the clip", () => {
    assert.match(puppet, /<HipClipLayer ref=\{canvasRef\} visible=\{clipOnStage\} \/>/);
    assert.match(puppet, /const hidden = clipOnStage \? \(\{ visibility: "hidden" \}/);
    assert.match(puppet, /clipView\.arrived \|\| plateKey === "smug"/);
    assert.match(puppet, /data-rai-hold-sheet=/);
    assert.match(puppet, /from: "smug"/);
    assert.match(puppet, /to: "idle"/);
    assert.match(puppet, /1084 rest forward after the hold/);
    assert.match(puppet, /data-rai-clip-frame=/);
    assert.match(puppet, /clipPlayer\.current\?\.confirmShown\(\)/);
  });
  it("waits for the clip (bounded, loud) and never expires into the arms-down sheet", () => {
    assert.match(puppet, /console\.warn\("\[rai\] hip clip did not decode in time/);
    assert.match(puppet, /reducedMotion: clipMode \? false : bridgeCut/);
    assert.match(puppet, /const bridgeWaitExpired = !clipMode &&/);
  });
});
