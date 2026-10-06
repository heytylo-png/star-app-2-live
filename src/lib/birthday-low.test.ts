import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BIRTHDAY_CARD_GAP_REM,
  BIRTHDAY_CARD_MAX_DVH,
  BIRTHDAY_CARD_MAX_REM,
  BIRTHDAY_COMPOSER_REM,
  BIRTHDAY_FRAME_H,
  BIRTHDAY_FRAME_W,
  BIRTHDAY_TAB_ROW_REM,
  applyBirthdaySkip,
  birthdayCardBottomPx,
  birthdayCardStaysHidden,
  birthdayCardTopPx,
  birthdayCardVisible,
  birthdayChinPx,
} from "./birthday-card.ts";
import { mergeChartPersist, type ChartSetupStatus } from "./chart-store.ts";
import { HEADER_STATUS_LEAD, headerLiveState } from "./header-status.ts";
import { composerActionLabel, composerCancelsTurn, composerShowsStop } from "./rai.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
const card = readFileSync(join(root, "src/components/chart-setup-card.tsx"), "utf8");
const menu = readFileSync(join(root, "src/components/stage-menu.tsx"), "utf8");
const css = readFileSync(join(root, "src/styles.css"), "utf8");
const birth = readFileSync(join(root, "src/components/birth-details.tsx"), "utf8");

describe("birthday skip", () => {
  it("lands on Chat and stays hidden across reload, tabs, and a new day", () => {
    assert.equal(
      birthdayCardVisible({ hydrated: true, setup: "pending", hasBirthDate: false }),
      true,
    );
    assert.equal(
      birthdayCardVisible({ hydrated: false, setup: "pending", hasBirthDate: false }),
      false,
    );
    const skipped = applyBirthdaySkip();
    assert.equal(skipped.tab, "chat");
    assert.equal(skipped.setup, "skipped");
    assert.equal(
      birthdayCardVisible({ hydrated: true, setup: skipped.setup, hasBirthDate: false }),
      false,
    );
    for (const day of ["2026-10-06", "2026-10-07"]) {
      for (const tab of ["chat", "chart", "life"] as const) {
        assert.equal(birthdayCardStaysHidden({ tab, day, setup: "skipped" }), true, `${tab} ${day}`);
      }
    }
    assert.equal(
      birthdayCardVisible({ hydrated: true, setup: "done", hasBirthDate: true }),
      false,
    );
    assert.equal(birthdayCardStaysHidden({ tab: "life", day: "2026-12-01", setup: "done" }), true);

    const skip = app.slice(app.indexOf("onSkip={() => {"), app.indexOf("onSave="));
    assert.match(skip, /markSetupSkipped\(\)/);
    assert.match(skip, /selectTab\("chat"\)/);
    assert.match(app, /useState<ShellTab>\(DEFAULT_SHELL_TAB\)/);
    assert.match(birth, /markSetupDone\(\)/);
    assert.match(app, /Birth details/);
    assert.doesNotMatch(app, /setup:\s*"pending"/);
  });

  it("persists skip in the chart store and does not reopen it for a later day", () => {
    const store = readFileSync(join(root, "src/lib/chart-store.ts"), "utf8");
    assert.match(store, /markSetupSkipped: \(\) => set\(\{ setup: "skipped" \}\)/);
    assert.match(store, /setup: state\.setup/);
    const current = {
      hydrated: true,
      setup: "pending" as ChartSetupStatus,
      lastFiredDate: "2026-10-06",
      askedBirthday: false,
      diaryByDay: {},
      herDayByDay: {},
      skyNoteByDay: {},
      setHydrated: () => {},
      markSetupSkipped: () => {},
      markSetupDone: () => {},
      markFired: () => {},
      markAskedBirthday: () => {},
      saveDiary: () => {},
      diaryFor: () => undefined,
      saveHerDay: () => {},
      herDayFor: () => undefined,
      lockSkyNote: () => {},
    };
    const merged = mergeChartPersist(
      { setup: "skipped", lastFiredDate: "2026-10-07" },
      current,
    );
    assert.equal(merged.setup, "skipped");
    assert.equal(merged.lastFiredDate, "2026-10-07");
    assert.equal(merged.hydrated, false);
    assert.equal(
      birthdayCardVisible({ hydrated: true, setup: merged.setup, hasBirthDate: false }),
      false,
    );
  });
});

describe("birthday card anchor", () => {
  it("sits below the chin at 893 and 915, in the low tab band", () => {
    const block = css.match(/\.birthday-card\s*\{([^}]*)\}/);
    assert.ok(block);
    assert.match(block![1]!, /position:\s*absolute/);
    assert.match(block![1]!, /bottom:\s*calc\(3\.4rem \+ 3\.625rem \+ 0\.25rem\)/);
    assert.match(block![1]!, /max-height:\s*min\(12\.5rem,\s*36dvh\)/);
    assert.match(card, /className="birthday-card"/);
    assert.equal(BIRTHDAY_TAB_ROW_REM + BIRTHDAY_COMPOSER_REM + BIRTHDAY_CARD_GAP_REM, 7.275);
    assert.equal(BIRTHDAY_CARD_MAX_REM, 12.5);
    assert.equal(BIRTHDAY_CARD_MAX_DVH, 0.36);

    const width = 412;
    for (const height of [893, 915]) {
      assert.ok(width / height < BIRTHDAY_FRAME_W / BIRTHDAY_FRAME_H, String(height));
      const chin = birthdayChinPx(height);
      const top = birthdayCardTopPx(height);
      assert.ok(top > chin, `card top ${top} overlaps chin ${chin} at ${height}`);
      assert.ok(top - chin >= 160, `face clearance ${top - chin}px at ${height}`);
      assert.ok(birthdayCardBottomPx() > BIRTHDAY_TAB_ROW_REM * 16);
      assert.equal(top, height - birthdayCardBottomPx() - Math.min(12.5 * 16, 0.36 * height));
    }
    assert.doesNotMatch(css, /\.life-menu,\s*\.chart-menu\s*\{[^}]*birthday-card/);
    assert.match(css, /\.life-menu,\s*\.chart-menu\s*\{[^}]*bottom:\s*calc\(100%\s*\+\s*0\.4rem\)/);
  });

  it("makes Skip the primary control", () => {
    const skipAt = card.indexOf("onClick={onSkip}");
    const saveAt = card.indexOf('type="submit"');
    assert.ok(skipAt > 0 && saveAt > skipAt);
    const skipButton = card.slice(card.lastIndexOf("<Button", skipAt), skipAt);
    assert.doesNotMatch(skipButton, /variant="ghost"|variant="secondary"/);
    const saveButton = card.slice(saveAt, saveAt + 48);
    assert.match(saveButton, /variant="secondary"/);
  });
});

describe("header status chip", () => {
  it("shows With you plus thinking, speaking, and with you, and drops Stranger and Local", () => {
    assert.equal(HEADER_STATUS_LEAD, "With you");
    assert.equal(headerLiveState({ talking: false, sending: false }), "with you");
    assert.equal(headerLiveState({ talking: false, sending: true }), "thinking");
    assert.equal(headerLiveState({ talking: true, sending: true }), "speaking");
    assert.equal(headerLiveState({ talking: true, sending: false }), "speaking");
    assert.match(menu, /\{status\}/);
    assert.match(menu, /\{liveState\}/);
    assert.doesNotMatch(menu, /Stranger|Local|tierLabel|brainLabel|streakDays/);
    assert.doesNotMatch(app, /tierLabel=|brainLabel=/);
    assert.match(app, /status=\{HEADER_STATUS_LEAD\}/);
    assert.match(app, /liveState=\{liveState\}/);
    const chip = menu.slice(menu.indexOf("{status}"), menu.indexOf("</span>", menu.indexOf("{liveState}")));
    assert.match(chip, /\{status\}/);
    assert.match(chip, /\{liveState\}/);
  });
});

describe("composer Stop on this main", () => {
  it("shows the Stop square only while talking, and Cancel aborts a hung send", () => {
    assert.equal(composerShowsStop(true), true);
    assert.equal(composerShowsStop(false), false);
    assert.equal(composerActionLabel({ talking: false, sending: false }), "Send");
    assert.equal(composerActionLabel({ talking: false, sending: true }), "Cancel");
    assert.equal(composerActionLabel({ talking: true, sending: false }), "Stop");
    assert.equal(composerCancelsTurn({ talking: false, sending: true }), true);
    const form = app.slice(app.indexOf("<form"), app.indexOf("</form>"));
    assert.match(form, /composerShowsStop\(talking\) \? <Square/);
    assert.match(form, /aria-label=\{composerActionLabel\(\{ talking, sending \}\)\}/);
    assert.match(form, /composerCancelsTurn\(\{ talking, sending \}\)\) stop\(\)/);
    assert.doesNotMatch(form, /sending \? <Square/);
  });
});
