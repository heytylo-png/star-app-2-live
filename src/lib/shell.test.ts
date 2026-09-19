import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveChartTurn } from "./chart.ts";
import { resolveLifeTurn } from "./life.ts";
import { RAI_SYSTEM, SHELL_SOURCE } from "./generated/star-rai-artifacts.ts";
import {
  DEFAULT_SHELL_TAB,
  SHELL_TABS,
  birthDateInputValue,
  chatOpenForTab,
  isShellTab,
  lastDiaryEntry,
} from "./shell.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const NOW = new Date("2026-09-19T18:00:00-05:00");
const TZ = "America/Chicago";

describe("3-tab shell artifact", () => {
  it("matches artifacts/star-rai-shell.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-rai-shell.txt"), "utf8");
    assert.equal(SHELL_SOURCE, disk);
    assert.match(SHELL_SOURCE, /STAR RAI — 3-TAB SHELL/);
    assert.match(SHELL_SOURCE, /Launch on Chat/);
    assert.match(SHELL_SOURCE, /No natal wheel/);
    assert.match(SHELL_SOURCE, /No auto-reading on open/);
    assert.match(SHELL_SOURCE, /Life comments still fire in Chat only/);
    assert.match(SHELL_SOURCE, /Move Grok into Chart/);
    assert.match(SHELL_SOURCE, /Put diary on Life/);
    assert.match(SHELL_SOURCE, /No xAI key in git/);
  });

  it("does not change the voice card output contract", () => {
    assert.match(RAI_SYSTEM, /\{"line":/);
    assert.match(RAI_SYSTEM, /LORE USE/);
    assert.match(SHELL_SOURCE, /\{"line","emotion","pose"\}/);
  });
});

describe("tab chrome", () => {
  it("launches on Chat and only knows Chat · Chart · Life", () => {
    assert.equal(DEFAULT_SHELL_TAB, "chat");
    assert.deepEqual([...SHELL_TABS], ["chat", "chart", "life"]);
    assert.equal(isShellTab("chat"), true);
    assert.equal(isShellTab("setup"), false);
    assert.equal(chatOpenForTab("chat"), true);
    assert.equal(chatOpenForTab("chart"), false);
    assert.equal(chatOpenForTab("life"), false);
  });

  it("does not auto-read when Chart or Life opens", () => {
    const chartOpen = resolveChartTurn({
      userText: "",
      chatOpen: chatOpenForTab("chart"),
      userSun: "Aries",
      lastTopic: "rough day",
      mood: "tired",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(chartOpen.kind, "none");

    const lifeOpen = resolveChartTurn({
      userText: "",
      chatOpen: chatOpenForTab("life"),
      userSun: "Aries",
      lastTopic: "rough day",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(lifeOpen.kind, "none");
  });

  it("keeps last diary on Chart helpers and prefills natal date", () => {
    assert.equal(lastDiaryEntry({}), undefined);
    assert.deepEqual(lastDiaryEntry({ "2026-09-18": "Yesterday.", "2026-09-19": "Today." }), {
      dateKey: "2026-09-19",
      text: "Today.",
    });
    assert.equal(birthDateInputValue("1994-04-12"), "1994-04-12");
    assert.equal(birthDateInputValue("09-29"), "2000-09-29");
    assert.equal(birthDateInputValue(undefined), "");
  });

  it("lets a Life track change comment fire without dumping Chart on the Life pane", () => {
    const life = resolveLifeTurn({
      userText: "I'm listening to Super Shy",
      before: { on: false },
      after: { on: true, now_playing: "Super Shy" },
    });
    assert.equal(life.kind, "track_change");
    const chart = resolveChartTurn({
      userText: "I'm listening to Super Shy",
      chatOpen: chatOpenForTab("life"),
      userSun: "Aries",
      now: NOW,
      timeZone: TZ,
    });
    assert.equal(chart.kind, "none");
  });
});
