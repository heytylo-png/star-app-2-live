import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { STARTERS } from "./helix.ts";
import {
  chatHasHistory,
  persistedStarterChipsDone,
  showEmptyChatHint,
  showStarterChips,
  starterChipsVisible,
} from "./starter-chips.ts";

const fresh = { hasSent: false, hasHistory: false, starterChipsDone: false };

describe("starter chip visibility", () => {
  it("shows the four chips only before any send, history, or saved flag", () => {
    assert.equal(starterChipsVisible(fresh), true);
    assert.equal(starterChipsVisible({ ...fresh, hasSent: true }), false);
    assert.equal(starterChipsVisible({ ...fresh, hasHistory: true }), false);
    assert.equal(starterChipsVisible({ ...fresh, starterChipsDone: true }), false);
    assert.deepEqual(
      STARTERS.map((chip) => chip.label),
      ["Hey", "I bumped you", "Who are you?", "Remember this"],
    );
  });

  it("stays hidden after the thread is cleared, on reload, and with no day reset", () => {
    assert.equal(chatHasHistory([]), false);
    assert.equal(chatHasHistory([{ messages: [] }]), false);
    assert.equal(chatHasHistory([{ messages: [{ role: "user" }] }]), true);
    assert.equal(persistedStarterChipsDone(undefined, []), false);
    assert.equal(persistedStarterChipsDone(false, [{ messages: [] }]), false);
    assert.equal(persistedStarterChipsDone(undefined, [{ messages: [{ role: "user" }] }]), true);
    assert.equal(persistedStarterChipsDone("yes", []), false);
    assert.equal(persistedStarterChipsDone(true, []), true);
    assert.equal(
      starterChipsVisible({ hasSent: false, hasHistory: false, starterChipsDone: true }),
      false,
    );
  });

  it("hides the chips and the hint while the birthday card is up", () => {
    assert.equal(showStarterChips({ ...fresh, birthdayCard: true }), false);
    assert.equal(showStarterChips({ ...fresh, birthdayCard: false }), true);
    assert.equal(showStarterChips({ ...fresh, hasSent: true, birthdayCard: false }), false);
    assert.equal(showEmptyChatHint({ empty: true, birthdayCard: false, callActive: false }), true);
    assert.equal(showEmptyChatHint({ empty: true, birthdayCard: true, callActive: false }), false);
    assert.equal(showEmptyChatHint({ empty: false, birthdayCard: false, callActive: false }), false);
    assert.equal(showEmptyChatHint({ empty: true, birthdayCard: false, callActive: true }), false);
  });

  it("keeps the hint on one line and the chips in a single scrolling row", () => {
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/rai-app.tsx"), "utf8");
    assert.match(app, /data-empty-chat-hint/);
    assert.match(app, /Say hey — or tap the phone to call her\./);
    assert.match(app, /truncate/);
    assert.match(app, /data-starter-chips/);
    assert.match(app, /flex-nowrap/);
    assert.match(app, /overflow-x-auto/);
    assert.match(app, /showStarterChips\(/);
    assert.match(app, /showEmptyChatHint\(/);
    assert.match(app, /inline-block max-w-full truncate rounded-full bg-\[rgba\(239,236,230,0\.85\)\]/);
    assert.match(app, /h-12 min-h-12 shrink-0 rounded-full/);
    assert.doesNotMatch(app, /text-shadow/);
    assert.doesNotMatch(app, /flex-wrap justify-center/);
  });
});
