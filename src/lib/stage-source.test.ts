import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_SHELL_TAB } from "./shell.ts";
import {
  DIARY_LOOP_FILE,
  DIARY_POSTER_FILE,
  launchStageSource,
  stagePlace,
  stageSourceAfterLeave,
  stageSourceFor,
} from "./stage-source.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Life desk loop stage source", () => {
  it("Life gives the muted looping video", () => {
    const life = stageSourceFor({ place: "life" });
    assert.equal(life.kind, "video");
    if (life.kind !== "video") return;
    assert.equal(life.src, DIARY_LOOP_FILE);
    assert.equal(life.src, "clips/diary-loop.mp4");
    assert.equal(life.poster, DIARY_POSTER_FILE);
    assert.equal(life.poster, "clips/diary-poster.jpg");
    assert.equal(life.loop, true);
    assert.equal(life.muted, true);
    assert.equal(life.playsInline, true);
    assert.equal(life.autoplay, true);
    assert.equal(life.controls, false);
  });

  it("Chat, Chart, and Call give the PNG puppet", () => {
    for (const place of ["chat", "chart", "call"] as const) {
      assert.equal(stageSourceFor({ place }).kind, "png", place);
    }
    assert.equal(stagePlace({ tab: "chat", callActive: false }), "chat");
    assert.equal(stagePlace({ tab: "chart" }), "chart");
    assert.equal(stagePlace({ tab: "life", callActive: true }), "call");
    assert.equal(stageSourceFor({ place: stagePlace({ tab: "life", callActive: true }) }).kind, "png");
  });

  it("reduced motion on Life gives the poster still and does not play", () => {
    const still = stageSourceFor({ place: "life", reducedMotion: true });
    assert.equal(still.kind, "poster");
    if (still.kind !== "poster") return;
    assert.equal(still.src, "clips/diary-poster.jpg");
    assert.equal("src" in still && !("loop" in still), true);
  });

  it("leaving Life for Chat, Chart, or Call gives the PNG", () => {
    assert.equal(stageSourceFor({ place: "life" }).kind, "video");
    assert.equal(stageSourceAfterLeave("chat").kind, "png");
    assert.equal(stageSourceAfterLeave("chart").kind, "png");
    assert.equal(stageSourceAfterLeave("call").kind, "png");
    assert.equal(stageSourceFor({ place: "chat", reducedMotion: true }).kind, "png");
    assert.equal(stageSourceFor({ place: "chart", reducedMotion: true }).kind, "png");
  });

  it("boots on the PNG because launch is Chat, never the clip", () => {
    assert.equal(DEFAULT_SHELL_TAB, "chat");
    assert.equal(launchStageSource().kind, "png");
    assert.notEqual(stageSourceFor({ place: "chat" }).kind, "video");
    assert.notEqual(stageSourceFor({ place: "chat" }).kind, "poster");
  });

  it("falls back to the PNG when playback fails", () => {
    const failed = stageSourceFor({ place: "life", playbackFailed: true });
    assert.equal(failed.kind, "png");
    const still = stageSourceFor({ place: "life", reducedMotion: true, playbackFailed: true });
    assert.equal(still.kind, "png");
  });

  it("follows the video-loop spec and does not reference sleep.mp4", () => {
    const spec = readFileSync(join(root, "artifacts/star-rai-video-loops.txt"), "utf8");
    assert.match(spec, /diary-loop\.mp4/);
    assert.match(spec, /diary-poster\.jpg/);
    assert.match(spec, /prefers-reduced-motion/);
    assert.match(spec, /fall back to the PNG puppet/);
    assert.match(spec, /sleep\.mp4 does not exist/);
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const desk = readFileSync(join(root, "src/components/desk-loop.tsx"), "utf8");
    const stage = readFileSync(join(root, "src/components/presence-stage.tsx"), "utf8");
    const logic = readFileSync(join(root, "src/lib/stage-source.ts"), "utf8");
    const bundle = `${app}\n${desk}\n${stage}\n${logic}`;
    assert.doesNotMatch(bundle, /sleep\.mp4/);
    assert.match(app, /stageSourceFor\(/);
    assert.match(app, /stagePlace\(/);
    assert.match(app, /usePrefersReducedMotion\(/);
    assert.match(desk, /playsInline=\{source\.playsInline\}/);
    assert.match(desk, /muted=\{source\.muted\}/);
    assert.match(desk, /loop=\{source\.loop\}/);
    assert.match(desk, /autoPlay=\{source\.autoplay\}/);
    assert.match(desk, /controls=\{source\.controls\}/);
    assert.match(desk, /el\.pause\(\)/);
    assert.match(desk, /removeAttribute\("src"\)/);
    assert.match(desk, /el\.src = src/);
    assert.match(desk, /withBasePath\(/);
    assert.match(desk, /className="rai-desk-loop"/);
    assert.match(stage, /desk\.kind !== "png"/);
    assert.doesNotMatch(desk, /className="rai-rig"|className="rai-layer"|className="rai-stage"/);
  });

  it("lets the service worker skip the mp4 so range playback is not cached", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    const precache = sw.slice(sw.indexOf("const PRECACHE"), sw.indexOf("];"));
    assert.doesNotMatch(precache, /\.mp4/);
    assert.doesNotMatch(precache, /diary-loop/);
    assert.match(sw, /function bypassMedia\(url\)/);
    assert.match(sw, /pathname\.endsWith\("\.mp4"\)/);
    assert.match(sw, /if \(bypassMedia\(url\)\) return;/);
    const css = readFileSync(join(root, "src/styles.css"), "utf8");
    assert.match(css, /\.rai-desk-loop\s*\{/);
    assert.match(css, /\.rai-desk-stage\s*\{/);
    const deskCss = css.slice(css.indexOf(".rai-desk-loop"));
    assert.match(deskCss, /object-fit:\s*cover/);
    assert.match(deskCss, /object-position:\s*30%\s+50%/);
  });
});
