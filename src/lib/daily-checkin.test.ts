import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readLocalNow } from "./clock.ts";
import { migrateItemsToSlots } from "./memory-slots.ts";
import {
  CHECKIN_LINES,
  checkInBand,
  checkInLineIsInBand,
  checkInMemoryLine,
  checkInSpokenUserName,
  composeCheckInLine,
  loadCheckInDate,
  loadCheckInLineId,
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

  it("still greets the cat when that name never became the profile", () => {
    const slots = migrateItemsToSlots([{ text: "Their cat's name is Miso" }], {});
    assert.equal(slots.name, undefined);
    const line = composeCheckInLine(
      readLocalNow(MORNING, TZ),
      "2026-09-23",
      ["Their cat's name is Miso"],
      slots.name,
    );
    assert.match(line, /Tell Miso I said hi\.$/);
  });

  it("says hi to an allowlisted pet and keeps the name's casing", () => {
    assert.equal(checkInMemoryLine("Their cat's name is Miso"), "Tell Miso I said hi.");
    assert.equal(checkInMemoryLine("Their dog is named Biscuit"), "Tell Biscuit I said hi.");
    assert.equal(checkInMemoryLine("best friend's name is Jo"), "Tell Jo I said hi.");
    assert.equal(checkInMemoryLine("Their sister's name is ada"), null);
    assert.equal(checkInMemoryLine("Their sister's name is Ada"), "Tell Ada I said hi.");
    assert.equal(checkInMemoryLine("Their cat's name is Mary Jane"), null);
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
    assert.equal(checkInSpokenUserName("TY"), "TY");
    const sameName = composeCheckInLine(morning, "2026-09-23", ["Their cat's name is Miso"], "Miso");
    assert.ok(CHECKIN_LINES.morning.includes(sameName), sameName);
    assert.equal(/\bmiso\b/i.test(sameName), false);
  });

  it("does not speak a name that keeps going, a word-name, or the user's own name", () => {
    const morning = readLocalNow(MORNING, TZ);
    const leaks = [
      "Their cat's name is Miso who died last year",
      "Their cat's name is Miso, he died",
      "Their cat's name is Miso (passed away)",
      "Their cat's name is Miso in rehab",
      "Their cat's name is Miso in prison",
      "Their cat's name is Miso was assaulted",
      "Their cat's name is Miso he killed himself",
      "Their cat's name is Miso from school",
      "Their cat's name is Mom",
      "Their friend's name is God",
      "Their dog's name is mom",
      "Your name is Rex",
    ];
    for (const gist of leaks) {
      assert.equal(checkInMemoryLine(gist), null, gist);
      const line = composeCheckInLine(morning, "2026-09-23", [gist]);
      assert.ok(CHECKIN_LINES.morning.includes(line), `${gist} -> ${line}`);
      assert.equal(/\b(?:miso|mom|god|rex|tell)\b/i.test(line), false, line);
    }
    assert.equal(checkInMemoryLine("Their cat's name is Miso."), "Tell Miso I said hi.");
    for (const gist of [
      "Their dog's name is Rex Passed",
      "Their dog's name is Rex Gone",
      "Their friend's name is Sam Sick",
      "Their cat's name is Kim Missing",
      "Their cat's name is Satan",
      "Their cat's name is Hitler",
      "Their cat's name is Sexy",
      "Their cat's name is Passed",
      "Their dog's name is Dead",
    ]) {
      assert.equal(checkInMemoryLine(gist), null, gist);
      const line = composeCheckInLine(morning, "2026-09-23", [gist]);
      assert.ok(CHECKIN_LINES.morning.includes(line), `${gist} -> ${line}`);
      assert.equal(/\b(?:rex|sam|kim|satan|hitler|sexy|passed|dead|tell)\b/i.test(line), false, line);
    }
    const lower = composeCheckInLine(morning, "2026-09-23", ["Your name is ty", "dog's name is Ty"]);
    assert.ok(CHECKIN_LINES.morning.includes(lower), lower);
    assert.equal(/\bty\b/i.test(lower), false);
    const profileTy = composeCheckInLine(morning, "2026-09-23", ["dog's name is Ty"], "TY");
    assert.ok(CHECKIN_LINES.morning.includes(profileTy), profileTy);
    assert.equal(/\bty\b/i.test(profileTy), false);
    for (const self of ["ty", "TY", "Ty"]) {
      const line = composeCheckInLine(morning, "2026-09-23", ["Their dog's name is Ty"], self);
      assert.ok(CHECKIN_LINES.morning.includes(line), `${self} -> ${line}`);
      assert.equal(/\bty\b/i.test(line), false, self);
    }
    const rex = composeCheckInLine(morning, "2026-09-23", [
      "Your name is Rex",
      "Their dog's name is Rex",
    ]);
    assert.ok(CHECKIN_LINES.morning.includes(rex), rex);
    assert.equal(/\brex\b/i.test(rex), false);
    for (const gist of ["they go by Rex", "you go by Rex", "called Rex", "I'm Rex", "I am Rex", "Name: Rex"]) {
      const line = composeCheckInLine(morning, "2026-09-23", [gist, "Their dog's name is Rex"]);
      assert.ok(CHECKIN_LINES.morning.includes(line), `${gist} -> ${line}`);
      assert.equal(/\brex\b/i.test(line), false, gist);
    }
    const profile = composeCheckInLine(morning, "2026-09-23", ["Their dog's name is Rex"], "Rex");
    assert.ok(CHECKIN_LINES.morning.includes(profile), profile);
  });

  it("does not repeat yesterday's time-of-day line", () => {
    const next = new Date("2026-09-24T08:00:00-05:00");
    const prior = new Date("2026-09-22T12:00:00-05:00").getTime();
    const natural = planDailyCheckIn({
      ...open,
      now: next,
      threads: [thread(prior)],
      lastDate: "2026-09-23",
    });
    assert.equal(natural.post, true);
    if (!natural.post) return;
    const avoided = planDailyCheckIn({
      ...open,
      now: next,
      threads: [thread(prior)],
      lastDate: "2026-09-23",
      lastLineId: natural.lineId,
    });
    assert.equal(avoided.post, true);
    if (!avoided.post) return;
    assert.notEqual(avoided.line, natural.line);
    assert.notEqual(avoided.lineId, natural.lineId);
    assert.ok(CHECKIN_LINES.morning.includes(avoided.line));

    const storage = new Map<string, string>();
    saveCheckInDate(natural.date, (key, value) => storage.set(key, value), natural.lineId);
    assert.equal(loadCheckInDate((key) => storage.get(key) ?? null), natural.date);
    assert.equal(loadCheckInLineId((key) => storage.get(key) ?? null), natural.lineId);
    const loaded = planDailyCheckIn({
      ...open,
      now: next,
      threads: [thread(prior)],
      lastDate: "2026-09-23",
      lastLineId: loadCheckInLineId((key) => storage.get(key) ?? null),
    });
    assert.equal(loaded.post, true);
    if (!loaded.post) return;
    assert.notEqual(loaded.line, natural.line);
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
    assert.match(body, /turn\.plan\.lineId/);
    assert.match(body, /loadCheckInLineId/);
    assert.match(body, /checkInSpokenUserName\(memory\.slots\.name\)/);
    assert.match(app.slice(0, at), /checkInTriedRef/);
    assert.doesNotMatch(body, /setPose|speak\(|markStarterChipsDone|setCaption/);
    assert.equal(/callActive|callStarting|showSetup|showNotice/.test(app.slice(close, close + 24)), false);
  });
});
