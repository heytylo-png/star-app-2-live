import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import { actForLifeTurn, resolveLifeTurn } from "./life.ts";
import { reduceLifeMenu, type LifeMenuState } from "./life-menu.ts";
import { stageSourceAfterLeave, stageSourceFor } from "./stage-source.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const onLife = (open: boolean): LifeMenuState => ({ tab: "life", open, callActive: false });

describe("Life menu open and close", () => {
  it("arrives on Life with the menu closed", () => {
    const next = reduceLifeMenu(
      { tab: "chat", open: false, callActive: false },
      { type: "select-tab", tab: "life" },
    );
    assert.deepEqual(next, onLife(false));
  });

  it("toggles on a Life re-tap and closes on another", () => {
    const opened = reduceLifeMenu(onLife(false), { type: "toggle-life" });
    assert.equal(opened.open, true);
    assert.equal(opened.tab, "life");
    const closed = reduceLifeMenu(opened, { type: "toggle-life" });
    assert.equal(closed.open, false);
    assert.equal(closed.tab, "life");
  });

  it("closes on an outside tap and on Escape", () => {
    assert.equal(reduceLifeMenu(onLife(true), { type: "outside" }).open, false);
    assert.equal(reduceLifeMenu(onLife(true), { type: "escape" }).open, false);
    assert.equal(reduceLifeMenu(onLife(true), { type: "escape" }).tab, "life");
  });

  it("closes when switching to Chat, Chart, or Call", () => {
    for (const tab of ["chat", "chart"] as const) {
      const next = reduceLifeMenu(onLife(true), { type: "select-tab", tab });
      assert.equal(next.tab, tab);
      assert.equal(next.open, false);
    }
    const call = reduceLifeMenu(onLife(true), { type: "call", active: true });
    assert.equal(call.open, false);
    assert.equal(call.callActive, true);
  });
});

describe("Life menu does not cover the desk", () => {
  it("keeps the desk loop mounted while Life is selected, menu open or closed", () => {
    for (const open of [false, true]) {
      const menu = reduceLifeMenu(onLife(false), open ? { type: "toggle-life" } : { type: "escape" });
      assert.equal(menu.tab, "life");
      assert.equal(menu.open, open);
      const stage = stageSourceFor({ place: "life" });
      assert.equal(stage.kind, "video");
      if (stage.kind === "video") assert.equal(stage.src, "clips/diary-loop.mp4");
    }
    const still = stageSourceFor({ place: "life", reducedMotion: true });
    assert.equal(still.kind, "poster");
  });

  it("unmounts the clip when leaving Life", () => {
    const left = reduceLifeMenu(onLife(true), { type: "select-tab", tab: "chat" });
    assert.equal(left.open, false);
    assert.equal(stageSourceAfterLeave("chat").kind, "png");
    assert.equal(stageSourceAfterLeave("chart").kind, "png");
    assert.equal(stageSourceAfterLeave("call").kind, "png");
  });

  it("does not render the full Life sheet", () => {
    const panel = readFileSync(join(root, "src/components/life-panel.tsx"), "utf8");
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const tabs = readFileSync(join(root, "src/components/app-tabs.tsx"), "utf8");
    assert.doesNotMatch(panel, /max-h-\[min\(36rem,74%\)\]/);
    assert.doesNotMatch(panel, /backdrop-blur/);
    assert.doesNotMatch(panel, /Her lists/);
    assert.doesNotMatch(panel, /\bdiary\b/i);
    assert.doesNotMatch(panel, /SpotifyLifePlayer|Connect Spotify|beginSpotifyLogin/);
    assert.match(panel, /id="star-life-menu"/);
    assert.match(panel, /role="region"/);
    assert.match(panel, /aria-labelledby="star-tab-life"/);
    assert.match(panel, /Connect music/);
    assert.match(tabs, /aria-expanded=/);
    assert.match(tabs, /aria-controls=\{life \? "star-pane-life star-life-menu"/);
    assert.match(app, /reduceLifeMenu\(/);
    assert.match(app, /id="star-pane-life"/);
    assert.doesNotMatch(app, /max-h-\[min\(36rem,74%\)\]/);
    assert.doesNotMatch(app, /<LifePanel/);
  });
});

describe("suggestion play is one comment", () => {
  it("sends a single short track-change line, then nothing on the same title", () => {
    const title = "Super Shy";
    const text = `I'm listening to ${title}`;
    const turn = resolveLifeTurn({
      userText: text,
      before: { on: true, now_playing: "ETA", commented_track: "ETA" },
      after: { on: true, now_playing: title, commented_track: "ETA" },
    });
    assert.equal(turn.kind, "track_change");
    const act = actForLifeTurn(turn);
    assert.ok(act);
    assert.equal(act.line.split(/\n+/).filter((row) => row.trim()).length, 1);
    const sentences = act.line.split(/(?<=[.!?~])\s+/).filter(Boolean);
    assert.ok(sentences.length <= 3, act.line);
    assert.doesNotMatch(act.line, /setlist|concert|lecture/i);

    const composed = composeAct([{ role: "user", content: text }], undefined, "idle", undefined, turn);
    assert.equal(composed.line, act.line);

    const again = resolveLifeTurn({
      userText: text,
      before: { on: true, now_playing: title, commented_track: title },
      after: { on: true, now_playing: title, commented_track: title },
    });
    assert.equal(again.kind, "none");
    assert.equal(actForLifeTurn(again), null);

    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const play = app.slice(app.indexOf("onPlayTitle"), app.indexOf("onPlayTitle") + 420);
    assert.equal((play.match(/void send\(/g) ?? []).length, 1);
    assert.match(play, /I'm listening to \$\{title\}/);
  });
});
