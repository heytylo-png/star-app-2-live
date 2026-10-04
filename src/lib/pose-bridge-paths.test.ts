import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actToJson, composeAct } from "./brain.ts";
import {
  BRIDGE_WAIT_MAX_MS,
  BridgeDriver,
  PoseBridge,
  bridgeFiles,
  bridgeGate,
  bridgeKeyOfPlates,
} from "./pose-bridge.ts";
import {
  EMOTION_TO_POSE,
  POSE_HOLD_MIN_MS,
  SMUG_BEAT_TAIL_MS,
  SMUG_READ_MS_PER_CHAR,
  SPRITES,
  bridgeFrameSrc,
  holdsSmugBeat,
  layersFor,
  namedPoseFromText,
  poseResetDelayMs,
  settledRestPose,
  smugBeatResetDelayMs,
  smugWinkTextRestDelayMs,
  spokenTurnStartPose,
  streamSpokenAct,
  type EmotionId,
  type PoseId,
  type PuppetState,
} from "./rai.ts";

/**
 * Replays the real route a send takes to the stage. The app commits React state
 * (pose, emotion, talking, blink, mouth), layersFor turns that into the plates
 * the puppet paints, and the puppet hands the plates to the BridgeDriver. These
 * tests drive that same chain (no direct bridge calls, no talking gate) and read
 * back the one image that is visible at each step.
 */

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

type Commit = Partial<PuppetState> & { pose: PoseId; emotion: EmotionId };

/** Names what is visible: bridge NN, smug, idle (rest / blink / mouth), or the sheet file. */
function nameOf(src: string): string {
  const b = /bridge_idle_smug_(\d\d)/.exec(src);
  if (b) return `b${b[1]}`;
  if (/smug_official/.test(src)) return "smug";
  if (/idle_mouth_/.test(src)) return "idle";
  if (/idle_blink_|\/idle\.png/.test(src)) return "idle";
  return src.split("/").pop()!.replace(/\.png.*$/, "");
}

function stage(opts: { decoded?: boolean; reduced?: boolean; paced?: boolean } = {}) {
  let framesReady = opts.decoded ?? true;
  let waitExpired = false;
  const clock = fakeClock();
  let bridgeSrc: string | null = null;
  // Paced: a frame's dwell starts when the screen paints it (the puppet's rAF), so the
  // test owns the paints; `stall` lets timers run with no paint at all (a busy main thread).
  const paintQ: Array<() => void> = [];
  const afterPaint = opts.paced
    ? (fn: () => void) => {
        paintQ.push(fn);
        return () => {
          const i = paintQ.indexOf(fn);
          if (i >= 0) paintQ.splice(i, 1);
        };
      }
    : undefined;
  const painted: string[] = [];
  const bridge = new PoseBridge(
    clock.timers,
    () => 0.5,
    (s) => {
      bridgeSrc = s;
    },
    afterPaint,
  );
  const driver = new BridgeDriver(bridge);
  const ready = new Set(bridgeFiles().map(bridgeFrameSrc));
  let plates: { src: string }[] = [];
  let lastState: Commit | null = null;
  const log: string[] = [];
  const see = () => {
    const shown = bridgeSrc ?? plates[0]?.src ?? "";
    const n = nameOf(shown);
    if (log[log.length - 1] !== n) log.push(n);
  };
  const base = { amplitude: 0.3, angle: 0, blink: 0, mouth: 0, talking: false } as const;
  const api = {
    clock,
    log,
    bridge,
    /** One React commit: state -> plates (the memo's gate) -> the puppet's bridge hand-off. */
    commit(state: Commit) {
      lastState = state;
      const next = layersFor({ ...base, ...state } as PuppetState);
      const gate = bridgeGate({
        wantedKey: bridgeKeyOfPlates(next),
        framesReady,
        reducedMotion: opts.reduced ?? false,
        waitExpired,
      });
      if (gate === "go") {
        plates = next;
        driver.commit(plates, {
          reducedMotion: opts.reduced ?? false,
          srcFor: bridgeFrameSrc,
          isReady: (src) => framesReady && ready.has(src),
        });
      }
      see();
    },
    /** Re-render with the last wanted state (frames landed, or the bounded wait ran out). */
    rerender() {
      if (lastState) api.commit(lastState);
    },
    framesDecoded() {
      framesReady = true;
      api.rerender();
    },
    waitRanOut() {
      waitExpired = true;
      api.rerender();
    },
    wait(ms: number) {
      for (let t = 0; t < ms; t += 10) {
        clock.advance(10);
        see();
        if (opts.paced) api.paint();
      }
    },
    /** A paint: records what the screen shows, then runs what was waiting for it. */
    paint() {
      const n = nameOf(bridgeSrc ?? plates[0]?.src ?? "");
      if (painted[painted.length - 1] !== n) painted.push(n);
      for (const fn of paintQ.splice(0)) fn();
    },
    /** The main thread is busy: time passes, timers come due, nothing is painted. */
    stall(ms: number) {
      clock.advance(ms);
      see();
    },
    painted,
    visibleCount: () => (bridgeSrc ? 1 : plates.length),
  };
  return api;
}

const IDLE: Commit = { pose: "idle", emotion: "glance" };
const IN = ["idle", "b01", "b02", "b03", "b04", "b05", "b06", "smug"];
const OUT = ["smug", "b06", "b05", "b04", "b03", "b02", "b01", "idle"];

/** Joins in then out: ends on smug, holds, leaves for idle. */
function expectInThenOut(log: string[]) {
  const ins = log.indexOf("smug");
  assert.ok(ins > 0, `reaches smug: ${log.join(">")}`);
  assert.deepEqual(log.slice(0, ins + 1).slice(-8), IN, `way in: ${log.join(">")}`);
  const outs = log.lastIndexOf("smug");
  assert.deepEqual(log.slice(outs, outs + 8), OUT, `way out: ${log.join(">")}`);
}

/** The reply turn the app runs, minus the network: start, stream act, land, speak, finish. */
function replyTurn(
  s: ReturnType<typeof stage>,
  act: { emotion: EmotionId; pose: PoseId },
  o: { voice: boolean; holdMs?: number },
) {
  // complete(): pose goes to the turn-start pose, emotion glance, not talking
  s.commit({ pose: spokenTurnStartPose(), emotion: "glance" });
  s.wait(30);
  // stream: setEmotion + setPose from the streamed act
  s.commit({ pose: act.pose, emotion: act.emotion });
  s.wait(20);
  // landed: pose set again, and with voice on, setTalking(true) in the same tick
  s.commit({ pose: act.pose, emotion: act.emotion, talking: o.voice });
  s.wait(o.holdMs ?? 900);
  // speech over, settle: rest pose, glance
  s.commit({ pose: act.pose, emotion: act.emotion, talking: false });
  s.wait(300);
  s.commit({ pose: settledRestPose(), emotion: "glance" });
  s.wait(1000);
}

describe("idle <-> smug bridge on the real resolution paths", () => {
  it("(a) model pose tag smug: bridge in and out, voice on (talking true as the pose lands)", () => {
    const act = streamSpokenAct('{"line":"Obviously.","emotion":"bratty","pose":"smug"}', {
      namedPose: null,
      currentPose: "idle",
    })!;
    assert.equal(act.pose, "smug");
    const s = stage();
    s.commit(IDLE);
    replyTurn(s, act, { voice: true });
    expectInThenOut(s.log);
    assert.ok(!s.log.includes("wave"));
  });

  it("(b) emotion tint fallback (emotion smug, no pose tag): the same bridge", () => {
    const act = streamSpokenAct('{"line":"Cute.","emotion":"smug"', { currentPose: "idle" })!;
    assert.equal(act.pose, EMOTION_TO_POSE.smug);
    assert.equal(act.pose, "smug");
    const s = stage();
    s.commit(IDLE);
    replyTurn(s, act, { voice: true });
    expectInThenOut(s.log);
  });

  it("(b2) pose idle with emotion smug (the layersFor emotion path) also bridges", () => {
    const s = stage();
    s.commit(IDLE);
    s.wait(50);
    s.commit({ pose: "idle", emotion: "smug", talking: true });
    s.wait(900);
    s.commit({ pose: "idle", emotion: "glance", talking: false });
    s.wait(900);
    expectInThenOut(s.log);
  });

  it("(b3) typed 'smug' (named pose) bridges, with the pose set before the turn starts", () => {
    const named = namedPoseFromText("smug");
    assert.equal(named, "smug");
    const s = stage();
    s.commit(IDLE);
    s.wait(50);
    s.commit({ pose: named as PoseId, emotion: "glance" }); // send(): setPose(named)
    s.wait(30);
    s.commit({ pose: named as PoseId, emotion: "glance" }); // complete(): act lands, same pose again
    s.wait(20);
    s.commit({ pose: named as PoseId, emotion: "bratty", talking: true });
    s.wait(900);
    s.commit({ pose: named as PoseId, emotion: "bratty", talking: false });
    s.wait(300);
    s.commit({ pose: settledRestPose(), emotion: "glance" });
    s.wait(1000);
    expectInThenOut(s.log);
  });

  it("(c) blank-key backup reply (local brain) for a typed 'smug'", () => {
    const named = namedPoseFromText("smug") as PoseId;
    const act = composeAct([{ role: "user", content: "smug" }], undefined, "idle");
    const streamed = streamSpokenAct(actToJson(act), { namedPose: named, currentPose: "idle" })!;
    assert.equal(streamed.pose, "smug");
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: named, emotion: "glance" });
    replyTurn(s, streamed, { voice: false });
    expectInThenOut(s.log);
  });

  it("(d)/(e) voice on and voice off give the same frames", () => {
    const act = { emotion: "smug" as EmotionId, pose: "smug" as PoseId };
    const on = stage();
    on.commit(IDLE);
    replyTurn(on, act, { voice: true });
    const off = stage();
    off.commit(IDLE);
    replyTurn(off, act, { voice: false });
    assert.deepEqual(on.log, off.log);
  });

  it("(f) while a blink or a mouth cycle is running", () => {
    for (const idle of [
      { ...IDLE, blink: 3 as const },
      { ...IDLE, talking: true, mouth: 2 as const },
      { ...IDLE, talking: true, mouth: 5 as const },
    ]) {
      const s = stage();
      s.commit(idle);
      s.wait(30);
      s.commit({ pose: "smug", emotion: "smug" }); // cancels the cycle: smug has no mouth
      s.wait(900);
      s.commit({ pose: "idle", emotion: "glance" });
      s.wait(900);
      expectInThenOut(s.log);
    }
  });

  it("(g) right after another pose, then smug, then a send that leaves smug", () => {
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: "wave", emotion: "glance" });
    s.wait(300);
    s.commit(IDLE);
    s.wait(300);
    assert.equal(s.log.includes("b01"), false, "wave <-> idle hard-cuts");
    const act = { emotion: "bratty" as EmotionId, pose: "smug" as PoseId };
    replyTurn(s, act, { voice: true });
    // next reply on idle: smug is already gone (timeout), plain talk line, no bridge
    const before = s.log.length;
    s.commit({ pose: "idle", emotion: "bratty", talking: true, mouth: 2 });
    s.wait(600);
    assert.equal(s.log.slice(before).some((n) => /^b\d\d$/.test(n)), false);
    expectInThenOut(s.log);
  });

  it("(g2) a send that leaves smug for idle at once (turn-start pose) while still on smug", () => {
    const s = stage();
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(300); // no bridge: the app booted in smug
    s.log.length = 0;
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(1000);
    s.commit({ pose: spokenTurnStartPose(), emotion: "glance" });
    s.wait(900);
    assert.deepEqual(s.log, OUT);
  });

  it("(g3) a send that leaves smug for a different pose hard-cuts", () => {
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(900);
    s.commit({ pose: "pout", emotion: "bratty" });
    s.wait(600);
    assert.equal(s.log.includes("b06") && s.log.lastIndexOf("b06") > s.log.indexOf("smug"), false);
    assert.equal(s.log.at(-1), "pout_official");
  });

  it("(h) smug sent twice in a row: the second turn's smug->idle->smug carries on, no hard cut", () => {
    const act = { emotion: "bratty" as EmotionId, pose: "smug" as PoseId };
    const s = stage();
    s.commit(IDLE);
    replyTurn(s, act, { voice: true, holdMs: 400 });
    // second send arrives while she is still in smug: turn start resets to idle (bridge out),
    // then the stream lands smug again a few ms later (bridge in, from the frame that is up)
    const t = stage();
    t.commit(IDLE);
    t.commit({ pose: "smug", emotion: "bratty" });
    t.wait(1200);
    t.commit({ pose: spokenTurnStartPose(), emotion: "glance" });
    t.wait(250); // mid way out
    t.commit({ pose: "smug", emotion: "bratty" });
    t.commit({ pose: "smug", emotion: "bratty", talking: true });
    t.wait(1500);
    // never smug right after idle, never idle right after smug without frames in between
    for (let i = 1; i < t.log.length; i++) {
      const a = t.log[i - 1]!;
      const b = t.log[i]!;
      assert.ok(!(a === "idle" && b === "smug"), `idle>smug cut: ${t.log.join(">")}`);
      assert.ok(!(a === "smug" && b === "idle"), `smug>idle cut: ${t.log.join(">")}`);
    }
    assert.equal(t.log.at(-1), "smug");
    assert.equal(s.log.filter((n) => n === "smug").length > 0, true);
  });

  it("a plain talk line on idle never plays the bridge (mouth frames, pose stays idle)", () => {
    const s = stage();
    s.commit(IDLE);
    replyTurn(s, { emotion: "bratty", pose: settledRestPose() }, { voice: true });
    s.commit({ pose: "idle", emotion: "bratty", talking: true, mouth: 3 });
    s.wait(800);
    assert.equal(s.log.some((n) => /^b\d\d$/.test(n) || n === "smug"), false, s.log.join(">"));
  });

  it("wave, pout and talk still hard-cut in and out", () => {
    for (const pose of ["wave", "pout", "talk"] as const) {
      const s = stage();
      s.commit(IDLE);
      s.commit({ pose, emotion: "glance" });
      s.wait(500);
      s.commit(IDLE);
      s.wait(500);
      assert.equal(s.log.some((n) => /^b\d\d$/.test(n)), false, pose);
    }
  });

  it("the same plates committed twice in one tick do not cancel or restart the bridge", () => {
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug" });
    s.commit({ pose: "smug", emotion: "smug", talking: true }); // setTalking(true), same plates
    s.commit({ pose: "smug", emotion: "smug", talking: true });
    assert.equal(s.bridge.active(), true);
    s.wait(900);
    assert.deepEqual(s.log, IN);
  });

  it("pose set twice in one render (smug, idle, smug batched) is one change: no change at all", () => {
    const s = stage();
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(100);
    // React batches setPose(idle); setPose(smug) into one render of smug
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(600);
    assert.equal(s.log.some((n) => /^b\d\d$/.test(n)), false);
    assert.deepEqual(s.log, ["smug"]);
  });

  it("reduced motion hard-cuts both ways", () => {
    const s = stage({ reduced: true });
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(300);
    s.commit(IDLE);
    s.wait(300);
    assert.deepEqual(s.log, ["idle", "smug", "idle"]);
  });
});

describe("guard: a bridge-eligible pair never hard-cuts when its frames are decoded", () => {
  const blinks = [0, 2, 3, 4] as const;
  const mouths = [0, 1, 2, 3, 4, 5, 6] as const;
  const idles: Commit[] = [];
  for (const talking of [false, true]) {
    for (const blink of blinks) {
      idles.push({ pose: "idle", emotion: "glance", talking, blink });
    }
    for (const mouth of mouths) {
      idles.push({ pose: "idle", emotion: "bratty", talking, mouth: mouth as 1 });
    }
  }
  const smugs: Commit[] = [];
  for (const talking of [false, true]) {
    smugs.push({ pose: "smug", emotion: "smug", talking });
    smugs.push({ pose: "smug", emotion: "glance", talking });
    smugs.push({ pose: "idle", emotion: "smug", talking }); // emotion path
  }

  it("every idle state -> every smug state plays 01..06 first, and back plays 06..01", () => {
    let pairs = 0;
    for (const a of idles) {
      for (const b of smugs) {
        const toSmug = stage();
        toSmug.commit(a);
        assert.equal(bridgeKeyOfPlates(layersFor({ amplitude: 0, angle: 0, talking: false, ...a } as PuppetState)), "idle");
        toSmug.commit(b);
        assert.equal(toSmug.bridge.active(), true, `in: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
        toSmug.wait(900);
        assert.deepEqual(toSmug.log.slice(-8), IN, JSON.stringify([a, b]));

        const back = stage();
        back.commit(b);
        back.commit(a);
        assert.equal(back.bridge.active(), true, `out: ${JSON.stringify(b)} -> ${JSON.stringify(a)}`);
        back.wait(900);
        assert.deepEqual(back.log.slice(0, 8), OUT, JSON.stringify([b, a]));
        pairs += 2;
      }
    }
    assert.ok(pairs > 200);
  });

  it("with an undecoded frame it waits, not cuts: idle stays up until the frames land", () => {
    const s = stage({ decoded: false });
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug", talking: true });
    s.wait(900); // slow decode: nothing of smug is shown yet
    assert.deepEqual(s.log, ["idle"]);
    s.framesDecoded();
    s.wait(900);
    assert.deepEqual(s.log, IN, "then the whole bridge, never a smug frame ahead of 01");
  });

  it("the entry wait is effectively unbounded (30 s safety valve for a frame that can never load); only past it does it cut, loudly", () => {
    assert.ok(BRIDGE_WAIT_MAX_MS >= 20_000);
    const s = stage({ decoded: false });
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(BRIDGE_WAIT_MAX_MS - 100);
    assert.deepEqual(s.log, ["idle"]);
    s.waitRanOut();
    s.wait(300);
    assert.deepEqual(s.log, ["idle", "smug"]);
  });

  it("the gate waits only for the smug end of the pair, and never under reduced motion", () => {
    const wait = { framesReady: false, reducedMotion: false, waitExpired: false };
    assert.equal(bridgeGate({ wantedKey: "smug", ...wait }), "wait");
    assert.equal(bridgeGate({ wantedKey: "smug", ...wait, framesReady: true }), "go");
    assert.equal(bridgeGate({ wantedKey: "smug", ...wait, waitExpired: true }), "go");
    assert.equal(bridgeGate({ wantedKey: "smug", ...wait, reducedMotion: true }), "go");
    for (const wanted of ["idle", null]) assert.equal(bridgeGate({ wantedKey: wanted, ...wait }), "go");
  });

  it("slow decode on the real send path: wait, then the full bridge in and out", () => {
    const act = { emotion: "smug" as EmotionId, pose: "smug" as PoseId };
    const s = stage({ decoded: false });
    s.commit(IDLE);
    s.commit({ pose: spokenTurnStartPose(), emotion: "glance" });
    s.commit({ pose: act.pose, emotion: act.emotion });
    s.commit({ pose: act.pose, emotion: act.emotion, talking: true });
    s.wait(1200);
    s.framesDecoded();
    s.wait(900);
    s.commit({ pose: "smug", emotion: "smug", talking: false });
    s.wait(300);
    s.commit({ pose: settledRestPose(), emotion: "glance" });
    s.wait(1000);
    expectInThenOut(s.log);
    assert.equal(s.log.filter((n) => n === "smug").length, 1);
  });

  it("the smug sheet key is the live one, so a bridge never replaces idle.png or smug", () => {
    assert.match(SPRITES.poses.smug, /smug_official\.png/);
    assert.match(SPRITES.poses.idle, /\/idle\.png/);
  });
});

/**
 * The reset timer the app arms once a line is over. smug: the beat counts from the line's
 * landing (`landed`; 0 = not landed, counts from now) and its speech end, never the pose.
 */
function resetDelay(opts: { line: string; landed: number; speechEnded: number; now: number; pose?: PoseId; emotion?: EmotionId }) {
  const pose = opts.pose ?? "smug";
  const emotion = opts.emotion ?? "smug";
  if (holdsSmugBeat(pose, emotion)) {
    return smugBeatResetDelayMs({
      line: opts.line,
      lineLandedAt: opts.landed,
      speechEndedAt: opts.speechEnded,
      now: opts.now,
    });
  }
  return poseResetDelayMs({ pose, emotion, talking: false, actLandedAt: opts.landed, now: opts.now })!;
}

const LONG_LINE = "Obviously I was right again, and honestly I'm not even surprised anymore. ".repeat(5).trim();

describe("smug holds until its beat ends (early drop)", () => {
  it("a long silent line (typed reply, no voice) holds for its reading time plus the tail", () => {
    const chars = LONG_LINE.length;
    assert.ok(chars > 300);
    const d = resetDelay({ line: LONG_LINE, landed: 0, speechEnded: 0, now: 0 });
    assert.equal(d, chars * SMUG_READ_MS_PER_CHAR + SMUG_BEAT_TAIL_MS);
    // the old rule dropped a long line after ~3.4 s from landing
    assert.ok(d > 3400 * 3);
  });

  it("a voiced line holds until the speech ended plus the tail (never the reading time alone)", () => {
    const speechEnd = 40_000; // a slow voice, much longer than the reading time
    const landed = 0;
    const d = resetDelay({ line: LONG_LINE, landed, speechEnded: speechEnd, now: speechEnd });
    assert.ok(d >= SMUG_BEAT_TAIL_MS, "at least the tail after speech ends");
    assert.ok(speechEnd + d >= speechEnd + SMUG_BEAT_TAIL_MS);
  });

  it("a short line keeps the 3.4 s minimum from its landing, plus the 1.5 s tail exactly", () => {
    const d = resetDelay({ line: "Hm.", landed: 0, speechEnded: 0, now: 0 });
    assert.equal(d, POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
  });

  it("the tail after speech is 1.5 s, not the old 2.8 s post-talk hold", () => {
    const speechEnd = 20_400;
    const d = resetDelay({ line: "Smug pose locked in, all for you", landed: 6000, speechEnded: speechEnd, now: speechEnd });
    assert.equal(d, SMUG_BEAT_TAIL_MS);
  });

  it("other poses keep their own timing: only the smug sheet holds a beat", () => {
    for (const pose of ["wave", "pout", "talk", "wink", "peace", "shy", "tired"] as const) {
      assert.equal(holdsSmugBeat(pose, "bratty"), false, pose);
    }
    assert.equal(holdsSmugBeat("idle", "bratty"), false);
    assert.equal(holdsSmugBeat("smug", "smug"), true);
    assert.equal(holdsSmugBeat("idle", "smug"), true, "the emotion path shows the smug sheet");
    const wave = resetDelay({ line: LONG_LINE, landed: 0, speechEnded: 0, now: 0, pose: "wave", emotion: "bratty" });
    assert.equal(wave, poseResetDelayMs({ pose: "wave", emotion: "bratty", talking: false, actLandedAt: 0, now: 0 }));
  });

  it("long line on the real turn: smug is on stage the whole beat, then bridge 06..01 to idle", () => {
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: spokenTurnStartPose(), emotion: "glance" });
    s.commit({ pose: "smug", emotion: "smug" });
    s.commit({ pose: "smug", emotion: "smug", talking: false });
    const landedAt = s.clock.now();
    const delay = resetDelay({ line: LONG_LINE, landed: landedAt, speechEnded: 0, now: landedAt });
    s.wait(delay - 10);
    assert.ok(!s.log.slice(-1).includes("idle"), "still on smug just before the beat ends");
    assert.equal(s.log.at(-1), "smug");
    s.commit({ pose: settledRestPose(), emotion: "glance" }); // the timer fires
    s.wait(1000);
    expectInThenOut(s.log);
    assert.equal(s.log.indexOf("idle", 1) > s.log.indexOf("smug"), true, "no idle frame between 06 and the hold");
  });

  it("a new send during the hold is handled as before: smug -> idle bridge at once", () => {
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(1500);
    s.commit({ pose: spokenTurnStartPose(), emotion: "glance" }); // complete() resets the pose
    s.wait(900);
    assert.deepEqual(s.log.slice(s.log.lastIndexOf("smug")), OUT);
  });
});

describe("backgrounded page", () => {
  it("a bridge that starts while hidden holds its first frame, then plays at normal pace on return", () => {
    const s = stage();
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(900);
    s.log.length = 0;
    s.bridge.setPaused(true);
    s.commit(IDLE); // the timer fired in the background
    s.wait(5000);
    assert.deepEqual(s.log, ["b06"], "no frame moves while hidden, no cut to idle");
    s.bridge.setPaused(false);
    s.wait(900);
    assert.deepEqual(s.log, ["b06", "b05", "b04", "b03", "b02", "b01", "idle"]);
  });

  it("hiding mid-bridge freezes the frame; returning continues with the next one", () => {
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(250);
    assert.equal(s.log.at(-1), "b03");
    s.bridge.setPaused(true);
    s.wait(10_000);
    assert.equal(s.log.at(-1), "b03");
    s.bridge.setPaused(false);
    s.wait(700);
    assert.deepEqual(s.log, IN);
  });

  it("pause and resume are idempotent and never double-schedule", () => {
    const s = stage();
    s.commit(IDLE);
    s.commit({ pose: "smug", emotion: "smug" });
    s.bridge.setPaused(false);
    s.bridge.setPaused(true);
    s.bridge.setPaused(true);
    s.bridge.setPaused(false);
    s.bridge.setPaused(false);
    s.wait(900);
    assert.deepEqual(s.log, IN);
  });
});

describe("reduced motion", () => {
  it("only a requested reduced motion hard-cuts; without it the bridge always runs", () => {
    const on = stage({ reduced: true });
    on.commit(IDLE);
    on.commit({ pose: "smug", emotion: "smug" });
    on.wait(300);
    assert.deepEqual(on.log, ["idle", "smug"]);
    const off = stage({ reduced: false });
    off.commit(IDLE);
    off.commit({ pose: "smug", emotion: "smug" });
    off.wait(900);
    assert.deepEqual(off.log, IN);
  });
});

describe("entry: every arm frame is seen, in order, before smug (paint-paced)", () => {
  const BLINK = { pose: "idle" as PoseId, emotion: "glance" as EmotionId };

  it("no smug on the pose-change frame: the commit that resolves the pose shows 01, not smug", () => {
    for (const from of [IDLE, { ...IDLE, blink: 1 }, { ...IDLE, blink: 2 }, { ...IDLE, talking: true, mouth: 3 }, { ...IDLE, mouth: 5 }] as Commit[]) {
      for (const to of [
        { pose: "smug", emotion: "smug" },
        { pose: "idle", emotion: "smug" },
        { pose: "smug", emotion: "bratty" },
      ] as Commit[]) {
        const s = stage({ paced: true });
        s.commit(from);
        s.wait(200);
        s.commit(to);
        assert.equal(s.log.at(-1), "b01", `first frame after the change: ${JSON.stringify([from, to])}`);
        assert.ok(!s.log.slice(-2).includes("smug"));
        s.wait(900);
        assert.deepEqual(s.painted.slice(-IN.length + 1), IN.slice(1));
      }
    }
  });

  it("a busy main thread cannot skip a frame: with no paint a frame stays up, then each is painted in turn", () => {
    const s = stage({ paced: true });
    s.commit(BLINK);
    s.paint();
    s.commit({ pose: "smug", emotion: "smug" });
    s.stall(1500); // sheets punching / a stream of renders: no paint for 1.5 s
    assert.equal(s.log.at(-1), "b01", "still on 01, the timer has not run out under it");
    s.wait(1000);
    assert.deepEqual(s.painted, IN, `painted: ${s.painted.join(">")}`);
  });

  it("repeated stalls through the bridge: 01..06 each painted once, in order, then smug", () => {
    const s = stage({ paced: true });
    s.commit(BLINK);
    s.paint();
    s.commit({ pose: "smug", emotion: "smug" });
    for (let i = 0; i < 12; i += 1) {
      s.stall(300);
      s.paint();
      s.wait(30);
    }
    s.wait(300);
    assert.deepEqual(s.painted, IN, `painted: ${s.painted.join(">")}`);
  });

  it("each frame is on screen 80-120 ms once painted (paint-to-paint, at 10 ms resolution)", () => {
    const s = stage({ paced: true });
    s.commit(BLINK);
    s.paint();
    const stamps: number[] = [];
    let last = "";
    s.commit({ pose: "smug", emotion: "smug" });
    const t0 = s.clock.now();
    for (let i = 0; i < 100; i += 1) {
      s.wait(10);
      const name = s.log.at(-1)!;
      if (name !== last) {
        stamps.push(s.clock.now() - t0);
        last = name;
      }
    }
    // stamps[k] = when 01..06 (then smug) appeared
    for (let k = 1; k < 7; k += 1) {
      const dwell = stamps[k]! - stamps[k - 1]!;
      assert.ok(dwell >= 80 && dwell <= 130, `frame ${k} dwell ${dwell}`);
    }
  });

  it("the old unpaced bridge skips frames under the same stall (why the pacing exists)", () => {
    const s = stage({ paced: false });
    s.commit(BLINK);
    s.commit({ pose: "smug", emotion: "smug" });
    s.stall(1500);
    // every timer ran out while nothing painted: the next paint is smug
    assert.equal(s.log.at(-1), "smug");
  });

  it("exit is unchanged: it never waits for a paint, same frames at the same pace", () => {
    const s = stage({ paced: true });
    s.commit(IDLE);
    s.wait(900);
    s.commit({ pose: "smug", emotion: "smug" });
    s.wait(900);
    s.log.length = 0;
    s.commit(IDLE);
    for (let t = 0; t < 1000; t += 10) s.stall(10); // no paint at all: the exit still runs on its timers
    assert.deepEqual(s.log, ["b06", "b05", "b04", "b03", "b02", "b01", "idle"]);
  });
});

describe("hold: the beat belongs to the line, not the pose", () => {
  const LINE = "Smug pose locked in, all for you";

  /** The app: pose resolves at poseAt (sending stays true), the line lands at landAt, timer armed then. */
  function turn(o: { poseAt: number; landAt: number; speechEnd?: number }) {
    const s = stage({ paced: true });
    s.commit(IDLE);
    s.wait(o.poseAt);
    s.commit({ pose: "smug", emotion: "smug" }); // tag resolves; no timer is armed while sending
    const poseResolved = s.clock.now();
    s.wait(o.landAt - o.poseAt);
    const landed = s.clock.now();
    const speechEnded = o.speechEnd ?? 0;
    if (o.speechEnd) {
      s.commit({ pose: "smug", emotion: "smug", talking: true });
      s.wait(o.speechEnd - landed);
      s.commit({ pose: "smug", emotion: "smug", talking: false });
    }
    const now = s.clock.now();
    const delay = resetDelay({ line: LINE, landed, speechEnded, now });
    return { s, poseResolved, landed, now, delay };
  }

  it("pose at 1.5 s, line lands at 6 s, silent: the hip holds until landing + 3.4 s + 1.5 s", () => {
    const { s, landed, now, delay } = turn({ poseAt: 1500, landAt: 6000 });
    assert.equal(now + delay, landed + POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
    // counted from the pose resolving, the old clock ran out at 1.5 s + 3.4 s = 4.9 s, before the line
    assert.ok(now + delay > 1500 + POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
    s.wait(delay - 20);
    assert.equal(s.log.at(-1), "smug", "still on the hip just before the beat ends");
    assert.ok(!s.log.slice(IN.length).some((n) => n === "idle" || /^b0/.test(n)), "no bridge or idle in the hold");
    s.commit(IDLE); // the timer fires
    s.wait(900);
    assert.deepEqual(s.log.slice(s.log.lastIndexOf("smug")), OUT, "then the exit as before");
  });

  it("voiced: the hip holds through speech, until speech end + 1.5 s", () => {
    const { s, now, delay } = turn({ poseAt: 1500, landAt: 6000, speechEnd: 20_400 });
    assert.equal(delay, SMUG_BEAT_TAIL_MS);
    assert.equal(now + delay, 20_400 + SMUG_BEAT_TAIL_MS);
    s.wait(delay - 20);
    assert.equal(s.log.at(-1), "smug");
  });

  it("no landing yet counts from now (a timer is never armed against a line not on screen)", () => {
    const d = resetDelay({ line: LINE, landed: 0, speechEnded: 0, now: 4000 });
    assert.equal(d, POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
  });

  it("re-arming later (typing then clearing the draft) keeps the same absolute end", () => {
    const end = (now: number) => now + resetDelay({ line: LINE, landed: 6000, speechEnded: 0, now });
    assert.equal(end(6000), end(7300));
    assert.equal(end(6000), 6000 + POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
  });

  it("pose resolving at any time before the line gives the same end: landing + beat", () => {
    for (const poseAt of [0, 300, 1500, 3000, 5900]) {
      const { now, delay, landed } = turn({ poseAt, landAt: 6000 });
      assert.equal(now + delay, landed + POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS, `poseAt ${poseAt}`);
    }
  });

  it("a long line reads at 45 ms a character from its landing", () => {
    const long = "x".repeat(200);
    assert.equal(resetDelay({ line: long, landed: 6000, speechEnded: 0, now: 6000 }), 200 * SMUG_READ_MS_PER_CHAR + SMUG_BEAT_TAIL_MS);
  });
});

describe("named smug send at 5 / 7 / 9 / 12 s reply latency", () => {
  const LINE = "Smug pose locked in, all for you";
  const need = (landed: number) => landed + Math.max(POSE_HOLD_MIN_MS, LINE.length * SMUG_READ_MS_PER_CHAR) + SMUG_BEAT_TAIL_MS;

  /**
   * The app's turn: a named send puts smug on stage at once (sending stays true, so the
   * reset effect arms nothing), the reply lands at `latency`, then (voiced) she talks for
   * `speechMs`. Returns the stage and the absolute time the rest timer is armed to.
   */
  function turn(latency: number, o: { speechMs?: number; nonStreamed?: boolean } = {}) {
    const s = stage({ paced: true });
    s.commit(IDLE);
    s.wait(100);
    s.commit({ pose: "smug", emotion: "smug" }); // send(): setPose(named); complete(): sending = true
    // nothing may release smug while the reply is in flight: the reset effect returns on `sending`
    s.wait(latency);
    const landed = s.clock.now(); // line lands: setCaption(line), lineLandedAt = now
    let speechEnded = 0;
    if (o.speechMs) {
      s.commit({ pose: "smug", emotion: "smug", talking: true });
      s.wait(o.speechMs);
      speechEnded = s.clock.now();
    }
    s.commit({ pose: "smug", emotion: "smug", talking: false }); // finally: sending/talking false, effect arms
    const now = s.clock.now();
    const delay = smugBeatResetDelayMs({ line: LINE, lineLandedAt: landed, speechEndedAt: speechEnded, now });
    return { s, landed, speechEnded, now, delay };
  }

  for (const latency of [5000, 7000, 9000, 12000]) {
    it(`${latency / 1000} s, text only: the hip is up through the landing and held to landing + beat + 1.5 s`, () => {
      const { s, landed, now, delay } = turn(latency);
      assert.deepEqual(s.painted.slice(0, IN.length), IN, "entry 01..06 then smug");
      assert.equal(now + delay, need(landed));
      assert.ok(now + delay - landed >= POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
      // hip continuous: smug from entry end until the timer, nothing else on the stage
      assert.equal(s.log.at(-1), "smug");
      s.wait(delay - 20);
      assert.deepEqual(s.log, IN, "no idle / bridge frame at any point before the release");
      s.commit(IDLE); // timer fires
      s.wait(900);
      assert.deepEqual(s.log.slice(s.log.lastIndexOf("smug")), OUT, "exit 06..01 as before");
    });

    it(`${latency / 1000} s, voiced (2.2 s clip): released at speech end + 1.5 s, never at speech end`, () => {
      const { s, landed, speechEnded, now, delay } = turn(latency, { speechMs: 2200 });
      assert.equal(speechEnded, landed + 2200);
      assert.equal(now + delay, need(landed), "the 3.4 s reading minimum from the landing outlasts a 2.2 s clip");
      const long = turn(latency, { speechMs: 9000 });
      assert.equal(long.now + long.delay, long.speechEnded + SMUG_BEAT_TAIL_MS);
      s.wait(delay - 20);
      assert.equal(s.log.at(-1), "smug");
      assert.deepEqual(s.log, IN);
    });

    it(`${latency / 1000} s: the release depends only on the landing + the line, never on when the pose resolved`, () => {
      const base = turn(latency);
      for (const poseAt of [0, 1500, latency - 100]) {
        const e = smugBeatResetDelayMs({ line: LINE, lineLandedAt: base.landed, speechEndedAt: 0, now: base.now });
        assert.equal(base.now + e, need(base.landed), `pose at ${poseAt}`);
      }
      // the rest rule that shipped in #104 (landing + 3.4 s, no tail, no reading) would have let go 1.5 s too early
      const old = smugWinkTextRestDelayMs({ voiced: false, chewUntil: 0, pose: "smug", emotion: "smug", actLandedAt: base.landed, now: base.now })!;
      assert.ok(base.now + old < need(base.landed));
    });
  }

  it("a non-streamed reply (whole JSON at once) lands the same way: nothing runs before it, then landing + beat + 1.5 s", () => {
    const { s, landed, now, delay } = turn(7000, { nonStreamed: true });
    assert.equal(now + delay, need(landed));
    s.wait(delay - 20);
    assert.deepEqual(s.log, IN);
  });

  it("nothing is armed while the reply is in flight: the delay is for a landed line only", () => {
    // not landed (0) and not sending counts from now, so an aborted turn still rests, but only after a full beat
    assert.equal(smugBeatResetDelayMs({ line: "", lineLandedAt: 0, speechEndedAt: 0, now: 3000 }), POSE_HOLD_MIN_MS + SMUG_BEAT_TAIL_MS);
  });
});
