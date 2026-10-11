import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  activateWaitingWorker,
  BUILD_CHECK_PARAM,
  buildStampFromHtml,
  isNewerBuild,
  markUpdateIdle,
  mayTryUpdate,
  noteUpdateTry,
  SKIP_WAITING_MESSAGE,
  staleNoticeVisible,
  StaleBuildGuard,
  takeUpdateIdle,
  UPDATE_MAX_TRIES,
  UPDATE_RETRY_AFTER_MS,
  UPDATE_SETTLE_POLL_MS,
  updateReloadClearsPose,
  updateSafeLive,
  updateUrl,
  withoutReloadParam,
  type UpdateBusy,
} from "./app-update.ts";
import { readPosePhase, readSmugReleasePending, resetHeldPose, setPosePhase, setSmugReleasePending } from "./pose-phase.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("stale-build guard (a resumed PWA must not keep running an old deploy)", () => {
  it("reads the deploy stamp the gh-pages publish writes", () => {
    const html = '<head>\n    <meta charset="UTF-8" />\n    <meta name="star-rai-build" content="d0a74e8" />\n';
    assert.equal(buildStampFromHtml(html), "d0a74e8");
    assert.equal(buildStampFromHtml("<head></head>"), null);
  });

  it("updates only onto a different deploy, never from dev", () => {
    assert.equal(isNewerBuild("eb2348d", "d0a74e8"), true);
    assert.equal(isNewerBuild("d0a74e8", "d0a74e8"), false);
    assert.equal(isNewerBuild("dev", "d0a74e8"), false);
    assert.equal(isNewerBuild("eb2348d", null), false);
  });

  it("reloads only when nothing is in flight", () => {
    const idle: UpdateBusy = { sending: false, streaming: false, talking: false, callActive: false, callStarting: false };
    assert.equal(updateSafeLive(idle, "visible"), true);
    assert.equal(updateSafeLive(idle, "hidden"), false);
    for (const k of Object.keys(idle) as (keyof UpdateBusy)[]) assert.equal(updateSafeLive({ ...idle, [k]: true }, "visible"), false, k);
  });

  it("retries a reload that landed on a stale copy after 2 min, capped, never a loop", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const t0 = 1_000_000;
    assert.equal(mayTryUpdate("new1", store, t0), true);
    noteUpdateTry("new1", store, t0);
    assert.equal(mayTryUpdate("new1", store, t0 + 1_000), false);
    assert.equal(mayTryUpdate("new1", store, t0 + UPDATE_RETRY_AFTER_MS), true);
    let t = t0;
    for (let n = 2; n <= UPDATE_MAX_TRIES; n++) {
      t += UPDATE_RETRY_AFTER_MS;
      noteUpdateTry("new1", store, t);
    }
    assert.equal(mayTryUpdate("new1", store, t + 10 * UPDATE_RETRY_AFTER_MS), false, "capped");
    assert.equal(mayTryUpdate("new2", store, t), true, "a newer deploy starts fresh");
  });

  it("checks on resume, reads live refs, and the service worker leaves the check to the network", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    assert.match(app, /addEventListener\("visibilitychange", onResume\)/);
    assert.match(app, /sending: sendingRef\.current,\s+streaming: abortRef\.current != null,\s+talking: talkingRef\.current,\s+callActive: callActiveRef\.current,/);
    assert.doesNotMatch(app, /updateSafeRef/);
    assert.match(app, /useState\(takeUpdateDraft\)/);
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.ok(sw.includes(`url.searchParams.has("${BUILD_CHECK_PARAM}")`));
    assert.ok(sw.indexOf(`has("${BUILD_CHECK_PARAM}")`) < sw.indexOf("event.respondWith(\n    caches.match"));
  });
});

describe("stale-build guard reads live state at decision time (CoS, bc685e8)", () => {
  type World = {
    vis: string;
    busy: UpdateBusy;
    live: string | null | Error;
    now: number;
    reloads: [string, string][];
    timers?: (() => void)[];
  };
  const mk = (w: World) => {
    const m = new Map<string, string>();
    return new StaleBuildGuard({
      running: () => "old1111",
      fetchLive: async () => {
        if (w.live instanceof Error) throw w.live;
        return w.live;
      },
      busy: () => w.busy,
      visibility: () => w.vis,
      draft: () => "Pout for me",
      now: () => w.now,
      wallNow: () => 1_700_000_000_000 + w.now,
      store: () => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }),
      reload: (live, draft) => void w.reloads.push([live, draft]),
      setTimer: (fn) => void (w.timers ??= []).push(fn),
    });
  };
  const idle = (): UpdateBusy => ({ sending: false, streaming: false, talking: false, callActive: false, callStarting: false });

  it("hidden mid-reply, stop() while hidden, then a newer version reloads on the FIRST resume", async () => {
    const w: World = { vis: "visible", busy: { ...idle(), sending: true, streaming: true, talking: true }, live: "new2222", now: 1_000, reloads: [] };
    const g = mk(w);
    // She is talking; the user switches away.
    w.vis = "hidden";
    w.now += 100;
    assert.equal(await g.onVisibility(), false);
    // stop() runs while hidden: refs go idle, no re-render reaches the guard.
    w.busy = idle();
    w.now += 30_000;
    // First resume finds the new version and shows the notice. It does not reload
    // until the one Reload tap. The draft is kept.
    w.vis = "visible";
    assert.equal(await g.onVisibility(), false);
    assert.equal(g.noticeLive(), "new2222");
    assert.deepEqual(w.reloads, []);
    assert.equal(g.requestReload(), true);
    assert.deepEqual(w.reloads, [["new2222", "Pout for me"]]);
  });

  it("a resume mid-turn waits; the line shows when the turn ends, and one tap reloads", async () => {
    const w: World = { vis: "visible", busy: { ...idle(), talking: true }, live: "new2222", now: 1_000, reloads: [] };
    const g = mk(w);
    assert.equal(await g.onVisibility(), false);
    assert.equal(g.requestReload(), false, "a tap during speech does not reload");
    assert.deepEqual(w.reloads, []);
    w.busy = idle();
    w.now += 3_000;
    assert.equal(g.settle(), true, "the tap applies once the reply settles");
    assert.equal(w.reloads.length, 1);
  });

  it("no reload when versions match, on a 500 / missing stamp (null), or offline (throws)", async () => {
    for (const live of ["old1111", null, new Error("offline")] as (string | null | Error)[]) {
      const w: World = { vis: "visible", busy: idle(), live, now: 1_000, reloads: [] };
      const g = mk(w);
      for (let k = 0; k < 5; k++) {
        w.vis = "hidden";
        await g.onVisibility();
        w.now += 10_000;
        w.vis = "visible";
        await g.onVisibility();
        g.requestReload();
        g.settle();
      }
      assert.deepEqual(w.reloads, [], String(live));
    }
  });

  it("a reload that lands back on the old build retries only after 2 min, at most 3 times", async () => {
    const w: World = { vis: "visible", busy: idle(), live: "new2222", now: 1_000, reloads: [] };
    const g = mk(w);
    for (let k = 0; k < 40; k++) {
      w.vis = "hidden";
      await g.onVisibility();
      w.now += 10_000;
      w.vis = "visible";
      await g.onVisibility();
      g.requestReload();
    }
    // 400 s of resumes every 10 s: tries at 0, >=120 s, >=240 s, then capped.
    assert.equal(w.reloads.length, UPDATE_MAX_TRIES);
  });

  it("voiced reply ending inside the window reloads at speech end (onStop clears talk first, finally clears the stream)", async () => {
    const w: World = { vis: "visible", busy: { ...idle(), sending: true, streaming: true, talking: true }, live: "new2222", now: 1_000, reloads: [] };
    const g = mk(w);
    assert.equal(await g.onVisibility(), false, "resume mid-speech waits");
    assert.equal(g.requestReload(), false, "the tap waits out the reply");
    w.now += 14_900;
    // TTS onStop: talking / sending cleared, the reply's AbortController still set.
    w.busy = { ...idle(), streaming: true };
    assert.equal(g.settle(), false);
    // complete() finally: abortRef = null, then settleUpdate().
    w.busy = idle();
    w.now += 5;
    assert.equal(g.settle(), true);
    assert.deepEqual(w.reloads, [["new2222", "Pout for me"]]);
  });

  it("backstop: with no explicit settle call, the in-window re-check applies it once the refs clear", async () => {
    const w: World = { vis: "visible", busy: { ...idle(), streaming: true, talking: true }, live: "new2222", now: 1_000, reloads: [], timers: [] };
    const g = mk(w);
    assert.equal(await g.onVisibility(), false);
    assert.equal(g.requestReload(), false, "tap while the reply is in flight");
    let ticks = 0;
    while (w.timers!.length && ticks < 60) {
      const fn = w.timers!.shift()!;
      w.now += UPDATE_SETTLE_POLL_MS;
      ticks++;
      if (ticks === 10) w.busy = idle(); // speech ends 5 s after resume
      fn();
    }
    assert.equal(w.reloads.length, 1);
    assert.equal(ticks, 10, "applied on the first re-check after the refs cleared");
    // window closed and nothing pending: no more timers
    assert.equal(w.timers!.length, 0);
  });

  it("the backstop stops when the window closes (busy for the whole window: no reload, no endless timer)", async () => {
    const w: World = { vis: "visible", busy: { ...idle(), talking: true }, live: "new2222", now: 1_000, reloads: [], timers: [] };
    const g = mk(w);
    await g.onVisibility();
    assert.equal(g.requestReload(), false);
    let ticks = 0;
    while (w.timers!.length && ticks < 1000) {
      const fn = w.timers!.shift()!;
      w.now += UPDATE_SETTLE_POLL_MS;
      ticks++;
      fn();
    }
    assert.equal(w.reloads.length, 0);
    assert.ok(ticks <= 41, String(ticks));
  });
});

describe("update reload always reaches the network (CoS, f84389f)", () => {
  it("each attempt is a distinct URL; v is kept, r is unique and dropped after load", () => {
    const a = updateUrl("abc1234", 1, 1_000);
    const b = updateUrl("abc1234", 2, 121_000);
    assert.notEqual(a, b);
    assert.match(b, /[?&]v=abc1234&r=2-/);
    assert.equal(withoutReloadParam("https://x.io/star-app-2-live/?v=abc1234&r=2-abc#t"), "/star-app-2-live/?v=abc1234#t");
    assert.equal(withoutReloadParam("https://x.io/star-app-2-live/?v=abc1234"), null);
  });

  it("every busy-clearing path re-triggers settle after the ref is cleared; SW navigations revalidate", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    // complete() finally: after abortRef = null
    const fin = app.indexOf("    } finally {\n      abortRef.current = null;");
    assert.ok(fin > 0);
    const finEnd = app.indexOf("\n  }\n", fin);
    assert.ok(app.slice(fin, finEnd).includes("settleUpdate();"), "finally");
    // TTS onStop
    const onStop = app.indexOf("onStop: () => {");
    assert.ok(app.slice(onStop, app.indexOf("},\n", app.indexOf("setSending(false);", onStop))).includes("settleUpdate();"), "onStop");
    for (const fn of ["function stop()", "function hangUp()", "function bargeInTap()"]) {
      const i = app.indexOf(fn);
      const body = app.slice(i, app.indexOf("\n  }\n", i));
      assert.ok(body.trimEnd().endsWith("settleUpdate();"), fn);
    }
    const fail = app.indexOf(".catch((err) => {\n        callStartingRef.current = false;");
    assert.ok(app.slice(fail, fail + 200).includes("settleUpdate();"), "call start failure");
    assert.match(app, /stripReloadParam\(\);/);
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.match(sw, /req\.mode === "navigate"[\s\S]{0,300}fetch\(new Request\(req, \{ cache: "no-cache" \}\)\)/);
  });
});

describe("stale-build notice (one line, one tap, idle after reload)", () => {
  const idle = (): UpdateBusy => ({ sending: false, streaming: false, talking: false, callActive: false, callStarting: false });

  it("shows the notice only when a newer build is waiting and nothing is in flight", () => {
    const base = { pending: "new2222", running: "old1111", busy: idle(), visibility: "visible", mayTry: true };
    assert.equal(staleNoticeVisible(base), true);
    assert.equal(staleNoticeVisible({ ...base, busy: { ...idle(), talking: true } }), false);
    assert.equal(staleNoticeVisible({ ...base, busy: { ...idle(), sending: true } }), false);
    assert.equal(staleNoticeVisible({ ...base, busy: { ...idle(), streaming: true } }), false);
    assert.equal(staleNoticeVisible({ ...base, busy: { ...idle(), callActive: true } }), false);
    assert.equal(staleNoticeVisible({ ...base, visibility: "hidden" }), false);
    assert.equal(staleNoticeVisible({ ...base, birthdayCard: true }), false);
    assert.equal(staleNoticeVisible({ ...base, mayTry: false }), false);
    assert.equal(staleNoticeVisible({ ...base, pending: null }), false);
    assert.equal(staleNoticeVisible({ ...base, running: "dev" }), false);
    assert.equal(staleNoticeVisible({ ...base, pending: "old1111" }), false);
  });

  it("the notice is one paper-pill line above the input, and it takes the hint slot", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const at = app.indexOf("data-stale-build-notice");
    assert.ok(at > 0);
    const notice = app.slice(at, at + 800);
    assert.match(notice, /New build ready/);
    assert.match(notice, /data-stale-reload/);
    assert.match(notice, />\s*Reload\s*</);
    assert.match(notice, /min-h-11/);
    assert.match(notice, /bg-\[rgba\(239,236,230,0\.85\)\]/);
    assert.match(notice, /text-\[#3f3b36\]/);
    assert.match(notice, /whitespace-nowrap/);
    assert.doesNotMatch(notice, /text-shadow/);
    assert.doesNotMatch(notice, /role="dialog"/);
    assert.match(app, /!showNotice/);
    const hintAt = app.indexOf("data-empty-chat-hint");
    const chipsAt = app.indexOf("data-starter-chips");
    const formAt = app.indexOf("<form");
    assert.ok(at < hintAt && hintAt < chipsAt && chipsAt < formAt);
    assert.match(app, /requestReload\(\)/);
  });

  it("one tap activates a waiting worker, then reloads once onto ?v=", async () => {
    let posted: string | null = null;
    let onController: (() => void) | null = null;
    const sw = {
      getRegistration: async () => ({
        waiting: {
          postMessage: (data: string) => {
            posted = data;
            onController?.();
          },
        },
      }),
      addEventListener: (_type: "controllerchange", fn: () => void) => {
        onController = fn;
      },
    };
    assert.equal(await activateWaitingWorker(sw, 50), true);
    assert.equal(posted, SKIP_WAITING_MESSAGE);
    assert.equal(await activateWaitingWorker({ getRegistration: async () => ({}), addEventListener: () => {} }, 20), false);
    const swFile = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.match(swFile, /SKIP_WAITING/);
    assert.match(swFile, /self\.skipWaiting\(\)/);
    assert.match(readFileSync(join(root, "src/lib/app-update.ts"), "utf8"), /location\.reload\(\)/);
    assert.match(updateUrl("abc1234", 1, 1_000), /\?v=abc1234&r=1-/);
  });

  it("an update reload clears a held pose and does not restore it", () => {
    setPosePhase("hold", 5_000);
    setSmugReleasePending(true);
    assert.equal(readPosePhase().phase, "hold");
    assert.equal(readSmugReleasePending(), true);
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    markUpdateIdle(store);
    assert.equal(takeUpdateIdle(store, "https://x.io/star-app-2-live/?v=abc1234"), true);
    assert.equal(takeUpdateIdle(store, "https://x.io/star-app-2-live/?v=abc1234"), false);
    assert.equal(updateReloadClearsPose("https://x.io/star-app-2-live/?v=abc1234&r=1-zz", false), true);
    assert.equal(updateReloadClearsPose("https://x.io/star-app-2-live/?v=abc1234", false), false);
    resetHeldPose();
    assert.equal(readPosePhase().phase, "idle");
    assert.equal(readPosePhase().holdSince, 0);
    assert.equal(readSmugReleasePending(), false);
    assert.match(readFileSync(join(root, "src/components/rai-app.tsx"), "utf8"), /takeUpdateIdle\(\)/);
    assert.match(readFileSync(join(root, "src/components/rai-app.tsx"), "utf8"), /resetHeldPose\(\)/);
  });
});
