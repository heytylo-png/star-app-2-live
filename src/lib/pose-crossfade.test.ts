import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CROSSFADE_INCOMING_DELAY_MS,
  PoseCrossfadePool,
  type CrossfadeLayer,
} from "./pose-crossfade.ts";
import { IDLE_REST_LAYER_ID, type SpriteLayer } from "./rai.ts";

/** Minimal fake clock: timers fire in due order when time advances. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void; order: number }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        seq += 1;
        due.set(seq, { at: now + ms, fn, order: seq });
        return seq;
      },
      clear: (handle: number) => {
        due.delete(handle);
      },
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        let pick: [number, { at: number; fn: () => void; order: number }] | null = null;
        for (const entry of due) {
          if (entry[1].at > end) continue;
          if (!pick || entry[1].at < pick[1].at || (entry[1].at === pick[1].at && entry[1].order < pick[1].order)) {
            pick = entry;
          }
        }
        if (!pick) break;
        due.delete(pick[0]);
        now = pick[1].at;
        pick[1].fn();
      }
      now = end;
    },
    pending: () => due.size,
  };
}

const sheet = (name: string): SpriteLayer => ({
  id: `body:${name}`,
  src: `/rai/${name}.png`,
  opacity: 1,
  role: "body",
});
const IDLE = sheet("idle");
const WAVE = sheet("wave_official");
const SHY = sheet("shy_official");
const TALK = sheet("talk_official");

const FADE = 380;
const opts = (snap = false) => ({
  snap,
  isInstant: () => false,
  fadeMs: () => (snap ? 0 : FADE),
});

/** Every emitted frame must have at least one sheet heading to (or at) full opacity. */
function harness() {
  const clock = fakeTimers();
  const frames: CrossfadeLayer[][] = [];
  const pool = new PoseCrossfadePool(clock.timers, (layers) => frames.push(layers));
  const blank = () => frames.filter((layers) => !layers.some((l) => l.opacity > 0));
  const shown = () => pool.layers().filter((l) => l.opacity > 0).map((l) => l.id);
  return { clock, frames, pool, blank, shown };
}

describe("pose crossfade pool", () => {
  it("fades a new pose in over the old one, then drops the old sheet", () => {
    const h = harness();
    h.pool.update([IDLE], opts());
    assert.deepEqual(h.shown(), [IDLE.id]);
    h.pool.update([WAVE], opts());
    // Incoming waits one paint at 0 on top; the old sheet is still up.
    const wave = h.pool.layers().find((l) => l.id === WAVE.id)!;
    assert.equal(wave.opacity, 0);
    assert.ok(wave.z > h.pool.layers().find((l) => l.id === IDLE.id)!.z);
    assert.deepEqual(h.shown(), [IDLE.id]);
    h.clock.advance(CROSSFADE_INCOMING_DELAY_MS);
    assert.deepEqual(h.shown(), [WAVE.id]);
    h.clock.advance(FADE + 40 + CROSSFADE_INCOMING_DELAY_MS);
    assert.deepEqual(h.pool.layers().map((l) => l.id), [WAVE.id]);
    assert.equal(h.blank().length, 0);
    assert.equal(h.clock.pending(), 0);
  });

  it("cuts on a snap swap (cancelled blink) with no empty frame", () => {
    const h = harness();
    h.pool.update([IDLE], opts());
    h.pool.update([TALK], opts(true));
    assert.deepEqual(h.shown(), [TALK.id]);
    h.clock.advance(1000);
    assert.deepEqual(h.pool.layers().map((l) => l.id), [TALK.id]);
    assert.equal(h.blank().length, 0);
  });

  it("does not strand an interrupted fade-in at 0 (A → B → A within 48ms, then B)", () => {
    const h = harness();
    h.pool.update([WAVE], opts());
    h.pool.update([SHY], opts());
    h.clock.advance(20);
    h.pool.update([WAVE], opts());
    h.clock.advance(1000);
    assert.deepEqual(h.shown(), [WAVE.id]);
    // The cancelled SHY fade-in must not linger at opacity 0 …
    assert.deepEqual(h.pool.layers().map((l) => l.id), [WAVE.id]);
    // … so going back to SHY fades it in again instead of leaving an empty stage.
    h.pool.update([SHY], opts());
    h.clock.advance(CROSSFADE_INCOMING_DELAY_MS);
    assert.deepEqual(h.shown(), [SHY.id]);
    h.clock.advance(1000);
    assert.deepEqual(h.pool.layers().map((l) => l.id), [SHY.id]);
    assert.equal(h.blank().length, 0);
  });

  it("re-arms a fade-in when the pool updates again before it started", () => {
    const h = harness();
    h.pool.update([IDLE], opts());
    h.pool.update([WAVE], opts());
    h.clock.advance(10);
    // Same plates again (talking toggled, amp moved) inside the 48ms window.
    h.pool.update([WAVE], opts());
    h.clock.advance(CROSSFADE_INCOMING_DELAY_MS);
    assert.deepEqual(h.shown(), [WAVE.id]);
    h.clock.advance(1000);
    assert.deepEqual(h.pool.layers().map((l) => l.id), [WAVE.id]);
    assert.equal(h.blank().length, 0);
  });

  it("settles on the last pose after rapid switches with no empty frame", () => {
    const h = harness();
    h.pool.update([IDLE], opts());
    for (const [layer, gap] of [
      [WAVE, 15],
      [SHY, 30],
      [WAVE, 10],
      [TALK, 45],
      [SHY, 5],
      [IDLE, 20],
      [SHY, 0],
    ] as const) {
      h.pool.update([layer], opts());
      h.clock.advance(gap);
    }
    h.clock.advance(2000);
    assert.deepEqual(h.pool.layers().map((l) => l.id), [SHY.id]);
    assert.deepEqual(h.shown(), [SHY.id]);
    assert.equal(h.blank().length, 0);
    assert.equal(h.clock.pending(), 0);
  });

  it("switch A, then B within 50ms, then back to A, repeated", () => {
    for (const gap of [5, 20, 47, 50]) {
      const h = harness();
      h.pool.update([IDLE], opts());
      for (let round = 0; round < 3; round++) {
        h.pool.update([WAVE], opts());
        h.clock.advance(gap);
        h.pool.update([IDLE], opts());
        h.clock.advance(600);
        assert.deepEqual(h.shown(), [IDLE.id], `gap ${gap} round ${round}`);
        h.pool.update([WAVE], opts());
        h.clock.advance(600);
        assert.deepEqual(h.shown(), [WAVE.id], `gap ${gap} round ${round}`);
        h.pool.update([IDLE], opts());
        h.clock.advance(600);
      }
      assert.equal(h.blank().length, 0, `gap ${gap}`);
    }
  });
});

describe("pose change mid-chew", () => {
  const REST_ID = IDLE_REST_LAYER_ID;
  const rest = (file: string): SpriteLayer => ({ id: REST_ID, src: `/rai/${file}.png?v=rgba2`, opacity: 1, role: "body" });
  const CLOSED = rest("idle_blink_01_open");
  const SMUG = sheet("smug_official");
  const closeRest = (layer: CrossfadeLayer): CrossfadeLayer =>
    layer.id === REST_ID && layer.src !== CLOSED.src ? { ...layer, src: CLOSED.src } : layer;

  for (const mouth of ["idle_mouth_02_small", "idle_mouth_03_open", "idle_mouth_04_oo", "idle_mouth_05_wide", "idle_mouth_06_smirk"]) {
    it(`fades out the closed 01 frame, not ${mouth}`, () => {
      const h = harness();
      h.pool.update([CLOSED], { ...opts(), outgoing: closeRest });
      h.pool.update([rest(mouth)], { ...opts(), outgoing: closeRest });
      assert.equal(h.pool.layers()[0]!.src, rest(mouth).src);
      const before = h.frames.length;
      h.pool.update([SMUG], { ...opts(), outgoing: closeRest });
      h.clock.advance(2000);
      const after = h.frames.slice(before);
      // From the pose change on, the rest layer is only ever the closed frame.
      for (const layers of after) {
        for (const l of layers) if (l.id === REST_ID) assert.equal(l.src, CLOSED.src, mouth);
      }
      assert.deepEqual(h.pool.layers().map((l) => l.id), [SMUG.id]);
      assert.equal(h.blank().length, 0);
    });
  }

  it("also closes the mouth on a cut (snap) swap, and without the hook keeps the old src", () => {
    const h = harness();
    h.pool.update([rest("idle_mouth_03_open")], { ...opts(), outgoing: closeRest });
    h.pool.update([SMUG], { ...opts(true), outgoing: closeRest });
    const out = h.pool.layers().find((l) => l.id === REST_ID)!;
    assert.equal(out.src, CLOSED.src);
    assert.equal(out.opacity, 0);

    const plain = harness();
    plain.pool.update([rest("idle_mouth_03_open")], opts());
    plain.pool.update([SMUG], opts());
    assert.equal(plain.pool.layers().find((l) => l.id === REST_ID)!.src, rest("idle_mouth_03_open").src);
  });
});
