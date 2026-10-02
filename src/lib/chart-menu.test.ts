import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  chartAskDraft,
  chartAskHandoff,
  chartDiaryDateLabel,
  chartDiaryExcerpt,
  chartMenuDiaryLine,
  chartMenuSun,
  chartMenuTodaySunLine,
  composeChartAstronomyReading,
  lockChartReading,
  reduceChartMenu,
  type ChartMenuState,
} from "./chart-menu.ts";
import { notableAspectLine } from "./sky.ts";
import { stagePlace, stageSourceFor } from "./stage-source.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const onChart = (open: boolean): ChartMenuState => ({ tab: "chart", open, callActive: false });

describe("Chart menu open and close", () => {
  it("opens when Chart is selected, and a second tap closes it", () => {
    const opened = reduceChartMenu(
      { tab: "chat", open: false, callActive: false },
      { type: "select-tab", tab: "chart" },
    );
    assert.deepEqual(opened, onChart(true));
    const closed = reduceChartMenu(opened, { type: "toggle-chart" });
    assert.equal(closed.open, false);
    assert.equal(closed.tab, "chart");
    const again = reduceChartMenu(closed, { type: "toggle-chart" });
    assert.equal(again.open, true);
  });

  it("closes on an outside tap and on Escape, and stays on Chart", () => {
    assert.equal(reduceChartMenu(onChart(true), { type: "outside" }).open, false);
    const escaped = reduceChartMenu(onChart(true), { type: "escape" });
    assert.equal(escaped.open, false);
    assert.equal(escaped.tab, "chart");
  });

  it("closes when switching to Chat, Life, or Call", () => {
    for (const tab of ["chat", "life"] as const) {
      const next = reduceChartMenu(onChart(true), { type: "select-tab", tab });
      assert.equal(next.tab, tab);
      assert.equal(next.open, false);
    }
    const call = reduceChartMenu(onChart(true), { type: "call", active: true });
    assert.equal(call.open, false);
    assert.equal(call.callActive, true);
    assert.equal(call.tab, "chart");
  });
});

describe("Chart menu contents", () => {
  it("shows a sun sign only when birth data can derive one", () => {
    assert.equal(chartMenuSun({ userSun: "Aries" }), "Aries");
    assert.equal(chartMenuSun({ birthDate: "1994-04-12" }), "Aries");
    assert.equal(chartMenuSun({ userSun: "  ", birthDate: "1994-04-12" }), "Aries");
    assert.equal(chartMenuSun({}), null);
    assert.equal(chartMenuSun({ birthDate: "not a date" }), null);
  });

  it("keeps the diary excerpt short and sends Ask her into Chat", () => {
    const page = "Quiet page for today. She stayed. The long version keeps going past the menu.";
    const excerpt = chartDiaryExcerpt(page, 32);
    assert.ok(excerpt.endsWith("…"));
    assert.ok(excerpt.length <= 33);
    const handoff = chartAskHandoff({ text: page, userSun: "Aries" });
    assert.equal(handoff.tab, "chat");
    assert.equal(handoff.sent, true);
    assert.equal(handoff.draft, "What's in my chart today?");
    assert.equal(handoff.draft, chartAskDraft({ text: page, userSun: "Aries" }));
    assert.doesNotMatch(handoff.draft, /Quiet page|2026|page\?/);
    assert.equal(chartAskDraft({ text: page }), "What did you write?");
    assert.equal(chartAskDraft(null), "What's in my chart today?");
    assert.equal(chartDiaryDateLabel("2026-09-26"), "Sep 26");
  });

  it("orders the dropdown as today's sun, daily astronomy reading, last diary, then ask in Chat", () => {
    assert.equal(chartMenuTodaySunLine("Libra"), "Sun · Libra");
    assert.equal(chartMenuTodaySunLine("  "), "Sun · —");
    assert.equal(chartMenuTodaySunLine(null), "Sun · —");
    const panel = readFileSync(join(root, "src/components/chart-panel.tsx"), "utf8");
    const sunAt = panel.indexOf('aria-label="Today\'s sun"');
    const readingAt = panel.indexOf("Daily astronomy reading");
    const diaryAt = panel.indexOf("Last diary");
    const askAt = panel.indexOf("Ask her in Chat");
    assert.ok(sunAt >= 0 && readingAt > sunAt && diaryAt > readingAt && askAt > diaryAt);
    assert.match(panel, /chartMenuTodaySunLine/);
    assert.match(panel, /composeChartAstronomyReading/);
    assert.match(panel, /chartMenuDiaryLine/);
    assert.doesNotMatch(panel, /Edit birth|Edit date · time · place|Birth date/);
  });

  it("keeps the daily astronomy reading stable for a day and rotates by date", () => {
    const sky = {
      sunSignToday: "Libra" as const,
      moonSignToday: "Cancer" as const,
      moonPhase: "Full" as const,
    };
    const first = composeChartAstronomyReading({ dateKey: "2026-10-02", sky });
    assert.equal(first, composeChartAstronomyReading({ dateKey: "2026-10-02", sky }));
    assert.ok(first.split("\n").length >= 2 && first.split("\n").length <= 3);
    assert.match(first, /Libra/);
    assert.match(first, /Cancer/);
    assert.match(first, /Full/);
    let changed = false;
    for (let day = 1; day <= 28; day++) {
      const dateKey = `2026-10-${String(day).padStart(2, "0")}`;
      if (composeChartAstronomyReading({ dateKey, sky }) !== first) changed = true;
    }
    assert.equal(changed, true);

    const withAspect = composeChartAstronomyReading({
      dateKey: "2026-10-02",
      sky: { ...sky, notableAspect: "Sun and moon are across the room." },
    });
    assert.match(withAspect, /across the room/);
    assert.ok(withAspect.split("\n").length <= 3);

    const locked = lockChartReading({}, "2026-10-02", first);
    const again = lockChartReading(locked, "2026-10-02", "A different line.\nNope.");
    assert.equal(again, locked);
    assert.equal(again["2026-10-02"], first);
    const nextDay = lockChartReading(locked, "2026-10-03", "Aries sun.\nNew.");
    assert.equal(nextDay["2026-10-02"], first);
    assert.equal(nextDay["2026-10-03"], "Aries sun.\nNew.");
  });

  it("uses a deterministic sun and moon phase when sky facts are offline", () => {
    const offline = composeChartAstronomyReading({ dateKey: "2026-10-02", sky: null });
    assert.equal(offline, composeChartAstronomyReading({ dateKey: "2026-10-02", sky: null }));
    assert.match(offline, /Libra/);
    assert.match(offline, /New|Crescent|Quarter|Gibbous|Full/);
    assert.match(offline, /Offline|Local|quiet|didn't land/i);
    assert.ok(offline.split("\n").length >= 2 && offline.split("\n").length <= 3);
    const april = composeChartAstronomyReading({ dateKey: "2026-04-12", sky: null });
    assert.match(april, /Aries/);
    assert.notEqual(april, offline);
    assert.equal(notableAspectLine(0), "Sun's sitting on the moon.");
    assert.equal(notableAspectLine(180), "Sun and moon are across the room.");
    assert.equal(notableAspectLine(45), undefined);
    const menu = readFileSync(join(root, "src/lib/chart-menu.ts"), "utf8");
    assert.doesNotMatch(menu, /streamGrok|speechSynthesis|\bfetch\(|requestHerDay|grok-4/);
  });

  it("shows a quiet empty diary line when no page is saved", () => {
    assert.equal(chartMenuDiaryLine(null), "No diary yet");
    assert.equal(chartMenuDiaryLine({ text: "  " }), "No diary yet");
    assert.equal(chartMenuDiaryLine({ text: "Kept it short." }), "Kept it short.");
    assert.equal(
      chartMenuDiaryLine({ dateKey: "2026-09-26", text: "You sounded tired. That's the whole page." }),
      "Sep 26 · You sounded tired. That's the whole page.",
    );
    const panel = readFileSync(join(root, "src/components/chart-panel.tsx"), "utf8");
    assert.match(panel, /No diary yet/);
    assert.match(panel, /Last diary/);
  });
});

describe("Chart menu keeps the puppet", () => {
  it("leaves the PNG puppet mounted while the Chart menu is open", () => {
    const open = reduceChartMenu(
      { tab: "chat", open: false, callActive: false },
      { type: "select-tab", tab: "chart" },
    );
    assert.equal(open.open, true);
    assert.equal(open.tab, "chart");
    const stage = stageSourceFor({ place: stagePlace({ tab: "chart", callActive: false }) });
    assert.equal(stage.kind, "png");

    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    const presenceAt = app.indexOf("<PresenceStage");
    const chartAt = app.indexOf('id="star-pane-chart"');
    assert.ok(presenceAt > 0 && chartAt > presenceAt);
    const presence = app.slice(presenceAt, app.indexOf("/>", presenceAt) + 2);
    assert.match(presence, /desk=\{desk\}/);
    assert.doesNotMatch(presence, /chartMenuOpen/);
    assert.equal((app.match(/<PresenceStage/g) ?? []).length, 1);
    const pane = app.slice(chartAt, chartAt + 220);
    assert.match(pane, /star-pane-chart/);
    assert.doesNotMatch(pane, /bg-|backdrop|hidden|opacity-0|PresenceStage|Puppet/);
    assert.match(puppet, /data-rai-engine="png-puppet"/);
    assert.match(puppet, /className="rai-layer"/);
    assert.doesNotMatch(readFileSync(join(root, "src/components/chart-panel.tsx"), "utf8"), /rai-stage|PresenceStage|Puppet/);
  });
});

describe("Chart menu does not cover the puppet", () => {
  it("keeps the PNG puppet on Chart and never mounts the desk loop", () => {
    for (const open of [false, true]) {
      const menu = reduceChartMenu(
        { tab: "chat", open: false, callActive: false },
        open ? { type: "select-tab", tab: "chart" } : { type: "select-tab", tab: "life" },
      );
      if (open) assert.equal(menu.tab, "chart");
      assert.equal(stageSourceFor({ place: "chart" }).kind, "png");
      assert.notEqual(stageSourceFor({ place: "chart" }).kind, "video");
    }
    const panel = readFileSync(join(root, "src/components/chart-panel.tsx"), "utf8");
    const life = readFileSync(join(root, "src/components/life-panel.tsx"), "utf8");
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const tabs = readFileSync(join(root, "src/components/app-tabs.tsx"), "utf8");
    assert.doesNotMatch(panel, /diary-loop|DeskLoop|requestHerDayCopy|streamGrok|localHerDay|lockHerDailyMood|void send\(|ZodiacWheel|<svg|backdrop-blur/);
    assert.doesNotMatch(panel, /speechSynthesis|\bspeak\(|streamChat|setPose/);
    assert.doesNotMatch(life, /\bdiary\b/i);
    assert.match(panel, /Last diary/);
    assert.match(panel, /Ask her in Chat/);
    assert.match(panel, /Daily astronomy reading/);
    assert.doesNotMatch(panel, /Edit birth|Edit date · time · place/);
    const editor = readFileSync(join(root, "src/components/birth-details.tsx"), "utf8");
    assert.match(app, /Birth details/);
    assert.match(app, /<BirthDetailsEditor/);
    assert.match(editor, /Birth date/);
    assert.match(editor, /type="date"/);
    assert.match(editor, /type="time"/);
    assert.doesNotMatch(panel, /Birth date|type="date"/);
    assert.match(panel, /id="star-chart-menu"/);
    assert.match(panel, /role="region"/);
    assert.match(panel, /aria-labelledby="star-tab-chart"/);
    assert.match(tabs, /aria-label="Chart menu"/);
    assert.match(tabs, /aria-controls="star-chart-menu"/);
    assert.match(tabs, /aria-expanded=\{life \? lifeOpen : chart \? chartOpen : undefined\}/);
    assert.match(app, /reduceChartMenu\(/);
    assert.match(app, /id="star-pane-chart"/);
    assert.match(app, /askHerFromChart/);
    assert.match(app, /chartTabRef\.current\?\.focus\(\)/);
    assert.doesNotMatch(app, /<ChartPanel/);
    assert.doesNotMatch(app, /Write today's diary/);
    assert.doesNotMatch(app, /max-h-\[min\(40rem,78%\)\]/);
    const askAt = app.indexOf("const askHerFromChart");
    const ask = app.slice(askAt, app.indexOf("useEffect", askAt));
    assert.match(ask, /tabRef\.current = "chat"/);
    assert.match(ask, /selectTab\("chat"\)/);
    assert.match(ask, /void send\(prompt\)/);
    assert.equal((ask.match(/send\(/g) ?? []).length, 1);
    assert.doesNotMatch(ask, /setDraft/);
    const chartPane = app.slice(app.indexOf('tab === "chart"'), app.indexOf('tab === "chart"') + 280);
    assert.doesNotMatch(chartPane, /ChartPanel|backdrop-blur|diary-loop/);

    const selectAt = app.indexOf("const selectTab");
    const select = app.slice(selectAt, app.indexOf("const toggleLifeMenu", selectAt));
    assert.doesNotMatch(select, /send\(|speak\(|speechSynthesis|streamGrok|streamChat|requestHerDay/);
    const menuAt = app.indexOf("<ChartMenu");
    const menu = app.slice(menuAt, app.indexOf("/>", menuAt) + 2);
    assert.match(menu, /onAsk=\{askHerFromChart\}/);
    assert.doesNotMatch(menu, /send\(|speak\(|speechSynthesis/);

    const css = readFileSync(join(root, "src/styles.css"), "utf8");
    assert.match(css, /\.life-menu,\s*\.chart-menu\s*\{/);
    assert.doesNotMatch(css, /\.chart-menu\s*\{[^}]*68dvh/);
    assert.doesNotMatch(css, /\.chart-menu\s*\{[^}]*left:\s*50%/);
  });
});
