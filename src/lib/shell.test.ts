import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { chartPaneOnOpen, chartReadingRequested, resolveChartTurn } from "./chart.ts";
import { LIFE_SHOWS_LOGIN, lifeNowPlayingChrome, resolveLifeTurn } from "./life.ts";
import { RAI_SYSTEM, SHELL_SOURCE } from "./generated/star-rai-artifacts.ts";
import { SPOTIFY_TOKEN_STORAGE } from "./spotify.ts";
import {
  DEFAULT_SHELL_TAB,
  SHELL_TABS,
  birthDateInputValue,
  chatOpenForTab,
  isShellTab,
  lastDiaryEntry,
  launchChrome,
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
    assert.match(SHELL_SOURCE, /sparse daily dashboard/);
    assert.match(SHELL_SOURCE, /sky labels/);
    assert.match(SHELL_SOURCE, /Life comments still fire in Chat only/);
    assert.match(SHELL_SOURCE, /her-day section/);
    assert.match(SHELL_SOURCE, /No now-playing bar \/ music strip on Chat/);
    assert.match(SHELL_SOURCE, /optional Spotify Connect/);
    assert.match(SHELL_SOURCE, /her suggestions/);
    assert.match(SHELL_SOURCE, /read-only daily mood/);
    assert.match(SHELL_SOURCE, /Login never required/);
    assert.match(SHELL_SOURCE, /Show a now-playing \/ music bar on Chat/);
    assert.match(SHELL_SOURCE, /Move Grok settings \/ Chat replies into Chart/);
    assert.match(SHELL_SOURCE, /Chart\/her-day/);
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

  it("launches on Chat with a skippable birthday overlay", () => {
    assert.equal(launchChrome().tab, "chat");
    assert.equal(launchChrome().tab, DEFAULT_SHELL_TAB);
    assert.equal(launchChrome().birthdayCard, "skippable-overlay");
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const card = readFileSync(join(root, "src/components/chart-setup-card.tsx"), "utf8");
    assert.match(app, /useState<ShellTab>\(DEFAULT_SHELL_TAB\)/);
    assert.match(app, /<ChartSetupCard/);
    assert.match(app, /onSkip=/);
    assert.match(card, /onClick=\{onSkip\}/);
    assert.match(card, /\bSkip\b/);
    assert.doesNotMatch(app, /tab === "birthday"/);
  });

  it("Chart open has no wheel and no auto reading", () => {
    const open = chartPaneOnOpen();
    assert.equal(open.wheel, false);
    assert.equal(open.autoReading, false);
    assert.equal(open.layout, "sparse-daily-facts");
    assert.equal(chartReadingRequested(false), false);
    assert.equal(chartReadingRequested(true), true);
    const panel = readFileSync(join(root, "src/components/chart-panel.tsx"), "utf8");
    assert.doesNotMatch(panel, /requestHerDayCopy|ZodiacWheel|<svg|backdrop-blur|localHerDay/);
    assert.match(panel, /id="star-chart-menu"/);
    assert.match(panel, /Edit date · time · place/);
    assert.match(panel, /Ask her in Chat/);
    assert.doesNotMatch(panel, /dash\.view\.labels|her\.heading/);
  });

  it("Life now-playing is the title and Stop, with no login wall", () => {
    const chrome = lifeNowPlayingChrome({ sessionOn: true, title: "Super Shy" });
    assert.equal(chrome.title, "Super Shy");
    assert.equal(chrome.showStop, true);
    assert.equal(chrome.showLogin, false);
    assert.equal(chrome.showConnect, false);
    assert.equal(LIFE_SHOWS_LOGIN, false);
    assert.equal(lifeNowPlayingChrome({ sessionOn: false, title: "Super Shy" }).showStop, false);
    assert.equal(lifeNowPlayingChrome({ sessionOn: false, title: "Super Shy" }).showPlay, true);
    assert.equal(lifeNowPlayingChrome({ sessionOn: true, title: "Super Shy" }).showPlay, false);
    const panel = readFileSync(join(root, "src/components/life-panel.tsx"), "utf8");
    const bar = readFileSync(join(root, "src/components/now-playing-bar.tsx"), "utf8");
    const spotify = readFileSync(join(root, "src/lib/spotify.ts"), "utf8");
    assert.doesNotMatch(panel, /SpotifyLifePlayer|Connect Spotify|beginSpotifyLogin/);
    assert.doesNotMatch(bar, /Connect Spotify|Log in|placeholder=/);
    assert.match(bar, /onStop\(\)/);
    assert.match(bar, /\bStop\b/);
    assert.match(bar, /Play \$\{chrome\.title\}/);
    assert.match(spotify, new RegExp(SPOTIFY_TOKEN_STORAGE));
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
