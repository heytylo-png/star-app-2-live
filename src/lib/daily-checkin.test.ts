import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readLocalNow } from "./clock.ts";
import {
  CHECKIN_LINES,
  checkInBand,
  checkInLineIsInBand,
  checkInMemoryLine,
  checkInSpokenUserName,
  composeCheckInLine,
  loadCheckInDate,
  planDailyCheckIn,
  saveCheckInDate,
  settleDailyCheckIn,
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

  it("says hi to an allowlisted pet and keeps the name's casing", () => {
    assert.equal(checkInMemoryLine("Their cat's name is Miso"), "Tell Miso I said hi.");
    assert.equal(checkInMemoryLine("Their dog is named Biscuit"), "Tell Biscuit I said hi.");
    assert.equal(checkInMemoryLine("best friend's name is Jo"), "Tell Jo I said hi.");
    assert.equal(checkInMemoryLine("Their sister's name is ada"), "Tell ada I said hi.");
    assert.equal(checkInMemoryLine("Their cat's name is Alex"), "Tell Alex I said hi.");
    assert.equal(checkInMemoryLine("Their cat's name is Andrew"), "Tell Andrew I said hi.");
    const line = composeCheckInLine(readLocalNow(MORNING, TZ), "2026-09-23", ["Their cat's name is Miso"]);
    assert.ok(CHECKIN_LINES.morning.some((row) => line === `${row} Tell Miso I said hi.`), line);
    assert.equal(/still into|i remember|their cat/i.test(line), false);
    assert.equal(line.includes("Their cat's name is Miso"), false);
  });

  it("drops blocked gists and the user's own name", () => {
    const morning = readLocalNow(MORNING, TZ);
    const blocked = [
      "Their abuser's name is Mark",
      "cutting themselves",
      "My name is Ty",
      "user's name is Ty",
      "Their name is Ty",
      "drink until they black out",
      "Their ex's name is Mark",
      "Their therapist's name is Mark",
      "Their doctor's name is Mark",
      "Their dr's name is Mark",
      "Their counselor's name is Mark",
      "Their dealer's name is Mark",
      "Their boss's name is Mark",
      "Their coworker's name is Mark",
      "They like quiet tea",
    ];
    for (const gist of blocked) {
      assert.equal(checkInMemoryLine(gist), null, gist);
      const line = composeCheckInLine(morning, "2026-09-23", [gist]);
      assert.ok(CHECKIN_LINES.morning.includes(line), `${gist} -> ${line}`);
      assert.equal(/mark|cutting|\bty\b|drink|black|tell |still into|i remember/i.test(line), false, line);
    }
    const ownCat = composeCheckInLine(morning, "2026-09-23", ["My name is Ty", "Their cat's name is Ty"]);
    assert.ok(CHECKIN_LINES.morning.includes(ownCat), ownCat);
    assert.equal(/\bty\b/i.test(ownCat), false);
    const profile = composeCheckInLine(morning, "2026-09-23", ["Their friend's name is Ty"], "Ty");
    assert.ok(CHECKIN_LINES.morning.includes(profile), profile);
    assert.equal(/\bty\b/i.test(profile), false);
    const other = composeCheckInLine(morning, "2026-09-23", ["Their name is Ty", "Their cat's name is Miso"]);
    assert.match(other, /Tell Miso I said hi\.$/);
    assert.equal(/\bTy\b/.test(other), false);
    assert.equal(checkInSpokenUserName("Miso", ["Their cat's name is Miso"]), null);
    const copied = composeCheckInLine(
      morning,
      "2026-09-23",
      ["Their cat's name is Miso"],
      checkInSpokenUserName("Miso", ["Their cat's name is Miso"]),
    );
    assert.match(copied, /Tell Miso I said hi\.$/);
    assert.equal(checkInSpokenUserName("Ty", ["My name is Ty", "Their cat's name is Ty"]), "Ty");
  });

  it("posts one late beat at 23:59 and stays quiet two minutes later", () => {
    const before = new Date("2026-09-23T23:59:00-05:00");
    const after = new Date("2026-09-24T00:01:00-05:00");
    const prior = new Date("2026-09-22T18:00:00-05:00").getTime();
    const first = planDailyCheckIn({ ...open, now: before, threads: [thread(prior)] });
    assert.equal(first.post, true);
    if (!first.post) return;
    assert.equal(first.date, "2026-09-23");
    assert.equal(first.band, "late");
    assert.ok(CHECKIN_LINES.late.includes(first.line));
    const second = planDailyCheckIn({
      ...open,
      now: after,
      lastDate: null,
      threads: [
        {
          id: "t1",
          messages: [
            { role: "user", content: "Hey. Just got here.", createdAt: prior },
            { role: "assistant", content: first.line, createdAt: before.getTime() },
          ],
        },
      ],
    });
    assert.equal(second.post, false);
  });

  it("a call that starts and ends after midnight inserts nothing", () => {
    const before = new Date("2026-09-23T23:59:00-05:00");
    const after = new Date("2026-09-24T00:01:00-05:00");
    const prior = new Date("2026-09-22T18:00:00-05:00").getTime();
    const base = {
      timeZone: TZ,
      lastDate: null as string | null,
      threads: [thread(prior)],
      birthdayCard: false,
      staleNotice: false,
    };
    const first = settleDailyCheckIn(false, { ...base, now: before, callActive: false });
    assert.equal(first.tried, true);
    assert.equal(first.plan.post, true);
    const started = settleDailyCheckIn(first.tried, { ...base, now: after, callActive: true });
    assert.equal(started.plan.post, false);
    const ended = settleDailyCheckIn(started.tried, {
      ...base,
      now: after,
      callActive: false,
      lastDate: null,
    });
    assert.equal(ended.plan.post, false);
  });

  it("appends one chat beat once per load and does not speak, pose, or restore the chips", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const lib = readFileSync(join(root, "src/lib/daily-checkin.ts"), "utf8");
    assert.equal(lib.includes("Still into"), false);
    const at = app.indexOf("settleDailyCheckIn(");
    assert.ok(at > 0);
    const close = app.indexOf("}, [chromeReady]);", at);
    assert.ok(close > at);
    const body = app.slice(at, close);
    assert.match(body, /appendMessage/);
    assert.match(body, /saveCheckInDate/);
    assert.match(body, /checkInSpokenUserName\(memory\.slots\.name, memoryGists\)/);
    assert.match(app.slice(0, at), /checkInTriedRef/);
    assert.doesNotMatch(body, /setPose|speak\(|markStarterChipsDone|setCaption/);
    assert.equal(/callActive|callStarting|showSetup|showNotice/.test(app.slice(close, close + 24)), false);
  });
});
