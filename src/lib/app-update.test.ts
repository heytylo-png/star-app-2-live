import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BUILD_CHECK_PARAM,
  buildStampFromHtml,
  isNewerBuild,
  mayTryUpdate,
  noteUpdateTry,
  StaleBuildGuard,
  UPDATE_MAX_TRIES,
  UPDATE_RETRY_AFTER_MS,
  updateSafeLive,
  updateUrl,
  type UpdateBusy,
} from "./app-update.ts";

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
  type World = { vis: string; busy: UpdateBusy; live: string | null | Error; now: number; reloads: [string, string][] };
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
    // First resume: the new version is found and applied at once, draft kept.
    w.vis = "visible";
    assert.equal(await g.onVisibility(), true);
    assert.deepEqual(w.reloads, [["new2222", "Pout for me"]]);
  });

  it("a resume mid-turn waits; the turn ending inside the window applies it", async () => {
    const w: World = { vis: "visible", busy: { ...idle(), talking: true }, live: "new2222", now: 1_000, reloads: [] };
    const g = mk(w);
    assert.equal(await g.onVisibility(), false);
    w.busy = idle();
    w.now += 3_000;
    assert.equal(g.settle(), true);
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
    }
    // 400 s of resumes every 10 s: tries at 0, >=120 s, >=240 s, then capped.
    assert.equal(w.reloads.length, UPDATE_MAX_TRIES);
  });
});
