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
  updateSafeNow,
  updateUrl,
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
    const idle = { visible: true, sending: false, talking: false, callActive: false };
    assert.equal(updateSafeNow(idle), true);
    assert.equal(updateSafeNow({ ...idle, visible: false }), false);
    assert.equal(updateSafeNow({ ...idle, sending: true }), false);
    assert.equal(updateSafeNow({ ...idle, talking: true }), false);
    assert.equal(updateSafeNow({ ...idle, callActive: true }), false);
  });

  it("tries each target build once per tab (no reload loop) and lands on a fresh ?v=", () => {
    const store = (v: string | null) => ({ getItem: () => v });
    assert.equal(mayTryUpdate("abc1234", store(null)), true);
    assert.equal(mayTryUpdate("abc1234", store("abc1234")), false);
    assert.equal(updateUrl("abc1234"), "/star-app-2-live/?v=abc1234");
  });

  it("checks on resume, and the service worker leaves the check to the network", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    assert.match(app, /addEventListener\("visibilitychange", onResume\)/);
    assert.match(app, /useState\(takeUpdateDraft\)/);
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.ok(sw.includes(`url.searchParams.has("${BUILD_CHECK_PARAM}")`));
    assert.ok(sw.indexOf(`has("${BUILD_CHECK_PARAM}")`) < sw.indexOf("event.respondWith(\n    caches.match"));
  });
});
