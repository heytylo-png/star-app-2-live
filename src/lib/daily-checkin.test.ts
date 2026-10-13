import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readLocalNow } from "./clock.ts";
import {
  CHECKIN_LINES,
  checkInBand,
  checkInGist,
  checkInLineIsInBand,
  composeCheckInLine,
  loadCheckInDate,
  planDailyCheckIn,
  saveCheckInDate,
  type CheckInThread,
} from "./daily-checkin.ts";
import { showStarterChips } from "./starter-chips.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TZ = "America/Chicago";
const MORNING = new Date("2026-09-23T08:00:00-05:00");
const AFTERNOON = new Date("2026-09-23T14:00:00-05:00");
const EVENING = new Date("2026-09-23T19:00:00-05:00");
const LATE = new Date("2026-09-23T02:00:00-05:00");
const YESTERDAY = new Date("2026-09-22T21:00:00-05:00").getTime();

function thread(createdAt: number): CheckInThread {
  return {
    id: "t1",
    messages: [{ role: "user", content: "Hey. Just got here.", createdAt }],
  };
}

const open = {
  now: MORNING,
  timeZone: TZ,
  lastDate: null as string | null,
  threads: [thread(YESTERDAY)],
  callActive: false,
  birthdayCard: false,
  staleNotice: false,
};

describe("daily check-in", () => {
  it("picks a clock band and stays off the wrong hour", () => {
    assert.equal(checkInBand(8), "morning");
    assert.equal(checkInBand(14), "afternoon");
    assert.equal(checkInBand(19), "evening");
    assert.equal(checkInBand(21), "evening");
    assert.equal(checkInBand(22), "late");
    assert.equal(checkInBand(2), "late");
    for (const [band, when] of [
      ["morning", MORNING],
      ["afternoon", AFTERNOON],
      ["evening", EVENING],
      ["late", LATE],
    ] as const) {
      const line = composeCheckInLine(readLocalNow(when, TZ), "2026-09-23", []);
      assert.ok(CHECKIN_LINES[band].includes(line), line);
      assert.equal(checkInLineIsInBand(line, band), true);
      assert.equal(line.includes("\n"), false);
    }
  });

  it("posts once for a returning morning, then stays quiet the same day", () => {
    const first = planDailyCheckIn(open);
    assert.equal(first.post, true);
    if (!first.post) return;
    assert.equal(first.date, "2026-09-23");
    assert.equal(first.band, "morning");
    assert.ok(CHECKIN_LINES.morning.includes(first.line));

    const storage = new Map<string, string>();
    saveCheckInDate(first.date, (key, value) => storage.set(key, value));
    const again = planDailyCheckIn({
      ...open,
      lastDate: loadCheckInDate((key) => storage.get(key) ?? null),
    });
    assert.equal(again.post, false);
  });

  it("skips a first session, a same-day send, a call, the birthday card, and a stale notice", () => {
    assert.equal(planDailyCheckIn({ ...open, threads: [] }).post, false);
    assert.equal(planDailyCheckIn({ ...open, threads: [{ messages: [] }] }).post, false);
    assert.equal(planDailyCheckIn({ ...open, threads: [thread(MORNING.getTime())] }).post, false);
    assert.equal(planDailyCheckIn({ ...open, callActive: true }).post, false);
    assert.equal(planDailyCheckIn({ ...open, birthdayCard: true }).post, false);
    assert.equal(planDailyCheckIn({ ...open, staleNotice: true }).post, false);
    assert.equal(
      showStarterChips({ hasSent: false, hasHistory: false, starterChipsDone: false, birthdayCard: false }),
      true,
    );
  });

  it("mentions one memory gist, and drops an off-hour gist", () => {
    const line = composeCheckInLine(readLocalNow(MORNING, TZ), "2026-09-23", [
      "Their name is Ada",
      "They like quiet tea",
    ]);
    const gist = checkInGist(["Their name is Ada", "They like quiet tea"], "2026-09-23");
    assert.ok(gist);
    assert.equal(line.includes(gist!), true);
    assert.equal(line.split(gist!).length - 1, 1);

    const banned = composeCheckInLine(readLocalNow(MORNING, TZ), "2026-09-23", [
      "late nights thinking about you",
    ]);
    assert.ok(CHECKIN_LINES.morning.includes(banned));
    assert.equal(/late night/i.test(banned), false);
  });

  it("appends one chat beat and does not speak, pose, or restore the chips", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const at = app.indexOf("planDailyCheckIn(");
    assert.ok(at > 0);
    const body = app.slice(at, app.indexOf("}, [chromeReady, showSetup, showNotice, callActive, callStarting]);", at));
    assert.match(body, /appendMessage/);
    assert.match(body, /saveCheckInDate/);
    assert.doesNotMatch(body, /setPose|speak\(|markStarterChipsDone|setCaption/);
  });
});
