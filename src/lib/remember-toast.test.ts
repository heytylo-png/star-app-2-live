import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REMEMBER_TOAST_MS,
  birthdayToastLine,
  loadRememberSeen,
  memorySaves,
  memoryToastLine,
  nextRememberToast,
  rememberToastExpired,
  rememberToastVisible,
  saveRememberSeen,
} from "./remember-toast.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function channel(hex: string): number {
  const n = Number.parseInt(hex, 16) / 255;
  return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function contrast(fg: string, bg: string): number {
  const lum = (hex: string) =>
    0.2126 * channel(hex.slice(0, 2)) + 0.7152 * channel(hex.slice(2, 4)) + 0.0722 * channel(hex.slice(4, 6));
  const lighter = Math.max(lum(fg), lum(bg));
  const darker = Math.min(lum(fg), lum(bg));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("remember toast copy", () => {
  it("is one in-character line plus the gist, with no emoji", () => {
    assert.equal(memoryToastLine(""), "Noted. I'll remember that.");
    assert.equal(memoryToastLine("   "), "Noted. I'll remember that.");
    assert.equal(memoryToastLine("They like night talks."), "Noted. They like night talks.");
    assert.equal(memoryToastLine("They like night talks"), "Noted. They like night talks.");
    assert.equal(birthdayToastLine(), "Got it — your birthday.");
    for (const line of [memoryToastLine("They like night talks 🌙"), birthdayToastLine()]) {
      assert.equal(line.includes("\n"), false);
      assert.equal(/\p{Extended_Pictographic}/u.test(line), false);
    }
    assert.ok(contrast("3f3b36", "efece6") >= 4.5);
  });

  it("shows once per new item, one line for a batch, and skips a repeat", () => {
    const first = nextRememberToast(new Set(), { type: "memories", texts: ["They like night talks", "Their name is Ada"] }, 10);
    assert.equal(first.toast?.line, "Noted. They like night talks.");
    assert.equal(first.toast?.shownAt, 10);
    assert.equal(first.seen.size, 2);

    const again = nextRememberToast(first.seen, { type: "memories", texts: ["They like night talks"] }, 20);
    assert.equal(again.toast, null);

    const birthday = nextRememberToast(new Set(), { type: "birthday", date: "1994-04-12" }, 5);
    assert.equal(birthday.toast?.line, "Got it — your birthday.");
    const sameDay = nextRememberToast(birthday.seen, { type: "birthday", date: "1994-04-12" }, 9);
    assert.equal(sameDay.toast, null);
    const otherDay = nextRememberToast(birthday.seen, { type: "birthday", date: "1995-01-02" }, 9);
    assert.equal(otherDay.toast?.line, "Got it — your birthday.");
  });

  it("ignores case and trailing punctuation, including after a reload", () => {
    const storage = new Map<string, string>();
    const read = (key: string) => storage.get(key) ?? null;
    const write = (key: string, value: string) => {
      storage.set(key, value);
    };

    const first = nextRememberToast(loadRememberSeen(read), { type: "memories", texts: ["They like night talks"] }, 1);
    assert.equal(first.toast?.line, "Noted. They like night talks.");
    saveRememberSeen(first.seen, write);

    const cased = nextRememberToast(first.seen, { type: "memories", texts: ["THEY LIKE NIGHT TALKS"] }, 2);
    assert.equal(cased.toast, null);
    const dotted = nextRememberToast(first.seen, { type: "memories", texts: ["They like night talks."] }, 3);
    assert.equal(dotted.toast, null);

    const restored = loadRememberSeen(read);
    assert.equal(nextRememberToast(restored, { type: "memories", texts: ["They like night talks"] }, 4).toast, null);
    assert.equal(nextRememberToast(restored, { type: "memories", texts: ["they like night talks."] }, 5).toast, null);

    const fresh = nextRememberToast(restored, { type: "memories", texts: ["Their name is Ada"] }, 6);
    assert.equal(fresh.toast?.line, "Noted. Their name is Ada.");
  });

  it("yields to the stale-build line and a call, and leaves after 3.5s", () => {
    const line = "Noted. They like night talks.";
    assert.equal(rememberToastVisible({ line, staleNotice: false, callActive: false }), true);
    assert.equal(rememberToastVisible({ line, staleNotice: true, callActive: false }), false);
    assert.equal(rememberToastVisible({ line, staleNotice: false, callActive: true }), false);
    assert.equal(rememberToastVisible({ line: "  ", staleNotice: false, callActive: false }), false);
    assert.equal(rememberToastVisible({ line: null, staleNotice: false, callActive: false }), false);
    assert.equal(REMEMBER_TOAST_MS, 3500);
    assert.equal(rememberToastExpired(0, 3499), false);
    assert.equal(rememberToastExpired(0, 3500), true);
  });

  it("renders one paper pill in the hint slot and does not speak or pose", () => {
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const at = app.indexOf("data-remember-toast");
    assert.ok(at > 0);
    const pill = app.slice(at, at + 800);
    assert.match(pill, /h-11/);
    assert.match(pill, /min-h-11/);
    assert.match(pill, /bg-\[rgba\(239,236,230,0\.85\)\]/);
    assert.match(pill, /text-\[#3f3b36\]/);
    assert.match(pill, /truncate/);
    assert.match(pill, /rounded-full/);
    assert.doesNotMatch(pill, /setPose|speak\(|appendMessage|streamChat|speechSynthesis/);
    const noticeAt = app.indexOf("data-stale-build-notice");
    const hintAt = app.indexOf("data-empty-chat-hint");
    const chipsAt = app.indexOf("data-starter-chips");
    const formAt = app.indexOf("<form");
    assert.ok(noticeAt < at && at < hintAt && hintAt < chipsAt && chipsAt < formAt);
    assert.match(app, /rememberToastVisible\(/);
    assert.match(app, /staleNotice: showNotice/);
    assert.match(app, /callActive: callActive \|\| callStarting/);
    assert.match(app, /!showRemember/);
    assert.match(app, /memorySaves.subscribe/);
    assert.match(app, /loadRememberSeen/);
    assert.match(app, /saveRememberSeen/);
    assert.match(app, /type: "birthday"/);
  });
});

describe("memory saves notify once", () => {
  it("batches new writes and ignores an empty gist", async () => {
    const noted: string[][] = [];
    const stop = memorySaves.subscribe((texts) => noted.push(texts));
    memorySaves.notify("They like night talks");
    memorySaves.notify("   ");
    memorySaves.notify("Their name is Ada");
    await new Promise((resolve) => queueMicrotask(resolve));
    stop();
    assert.deepEqual(noted, [["They like night talks", "Their name is Ada"]]);

    const store = readFileSync(join(root, "src/lib/memory-store.ts"), "utf8");
    const addStart = store.indexOf("add: (text) => {");
    const addFn = store.slice(addStart, store.indexOf("addMany: (texts) => {"));
    const duplicateAt = addFn.lastIndexOf("return null");
    const notifyAt = addFn.indexOf("memorySaves.notify(cleaned)");
    const similarAt = addFn.indexOf("isDuplicate(item.text, cleaned)");
    assert.ok(similarAt > 0 && duplicateAt > similarAt && notifyAt > duplicateAt);
    assert.match(store, /if \(wrote\) saved.push\(wrote\)/);
  });
});
