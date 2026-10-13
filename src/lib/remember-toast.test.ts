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
    assert.match(addFn, /rememberGistKey\(item\.text\) === gist/);
    assert.match(addFn, /if \(replaced\) return null/);
    assert.match(store, /if \(wrote\) saved.push\(wrote\)/);
  });

  it("replaces a refined fact without toasting, and a reload stays quiet", async () => {
    const storage = new Map<string, string>();
    const local = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, String(value));
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
    };
    Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true });

    const { useMemoryStore } = await import("./memory-store.ts");
    if (!useMemoryStore.persist.hasHydrated()) {
      await new Promise<void>((resolve) => {
        const unsub = useMemoryStore.persist.onFinishHydration(() => {
          unsub();
          resolve();
        });
      });
    }
    useMemoryStore.getState().clear();

    const noted: string[][] = [];
    const stop = memorySaves.subscribe((texts) => noted.push(texts));
    const flush = () => new Promise((resolve) => queueMicrotask(resolve));
    const add = (text: string) => useMemoryStore.getState().add(text);
    const texts = () => useMemoryStore.getState().items.map((item) => item.text);

    add("Your cat is named Miso");
    await flush();
    assert.deepEqual(texts(), ["Your cat is named Miso"]);
    assert.deepEqual(noted, [["Your cat is named Miso"]]);

    assert.equal(add("YOUR CAT IS NAMED MISO."), null);
    assert.equal(add("Your cat is named Miso"), null);
    await flush();
    assert.deepEqual(texts(), ["Your cat is named Miso"]);
    assert.equal(noted.length, 1);

    assert.equal(add("Your cat is named Miso and she is three"), null);
    await flush();
    assert.deepEqual(texts(), ["Your cat is named Miso and she is three"]);
    assert.equal(noted.length, 1);

    assert.equal(add("Your cat is named Miso"), null);
    assert.equal(add("your cat is named miso."), null);
    await flush();
    assert.deepEqual(texts(), ["Your cat is named Miso and she is three"]);
    assert.equal(noted.length, 1);

    assert.equal(add("Their name is Ada"), "Their name is Ada");
    await flush();
    assert.deepEqual(texts(), ["Their name is Ada", "Your cat is named Miso and she is three"]);
    assert.deepEqual(noted[1], ["Their name is Ada"]);

    assert.equal(add("Name is Ada from home"), null);
    await flush();
    assert.deepEqual(texts(), ["Name is Ada from home", "Your cat is named Miso and she is three"]);
    assert.equal(noted.length, 2);

    assert.equal(add("They like rain"), "They like rain");
    await flush();
    assert.equal(noted.length, 3);
    assert.deepEqual(noted[2], ["They like rain"]);
    assert.equal(texts().filter((text) => text === "They like rain").length, 1);

    let seen = loadRememberSeen((key) => storage.get(key) ?? null);
    for (const batch of noted) {
      const next = nextRememberToast(seen, { type: "memories", texts: batch }, 1);
      assert.ok(next.toast);
      seen = next.seen;
      saveRememberSeen(seen, (key, value) => storage.set(key, value));
    }

    await useMemoryStore.persist.rehydrate();
    const before = noted.length;
    const kept = texts();
    add("YOUR CAT IS NAMED MISO AND SHE IS THREE.");
    add("name is ada from home");
    add("They like rain.");
    await flush();
    assert.equal(noted.length, before);
    assert.deepEqual(texts(), kept);

    const restored = loadRememberSeen((key) => storage.get(key) ?? null);
    const replay = nextRememberToast(
      restored,
      { type: "memories", texts: ["Your cat is named Miso", "Their name is Ada", "They like rain"] },
      2,
    );
    assert.equal(replay.toast, null);
    stop();
  });

  it("keeps a different name subject as its own memory", async () => {
    const { useMemoryStore } = await import("./memory-store.ts");
    useMemoryStore.getState().clear();
    const noted: string[][] = [];
    const stop = memorySaves.subscribe((texts) => noted.push(texts));
    const flush = () => new Promise((resolve) => queueMicrotask(resolve));
    const add = (text: string) => useMemoryStore.getState().add(text);
    const texts = () => useMemoryStore.getState().items.map((item) => item.text);

    assert.equal(add("best friend's name is Jo"), "best friend's name is Jo");
    await flush();
    assert.equal(add("coworker's name is Jo"), "coworker's name is Jo");
    await flush();
    assert.deepEqual(texts(), ["coworker's name is Jo", "best friend's name is Jo"]);
    assert.deepEqual(noted, [["best friend's name is Jo"], ["coworker's name is Jo"]]);

    assert.equal(add("best friend's name is Jo really"), null);
    await flush();
    assert.equal(noted.length, 2);
    assert.ok(texts().includes("best friend's name is Jo really"));
    assert.ok(!texts().includes("best friend's name is Jo"));
    assert.ok(texts().includes("coworker's name is Jo"));

    assert.equal(add("best friend's name is Jo actually"), null);
    await flush();
    assert.equal(noted.length, 2);
    assert.ok(texts().includes("best friend's name is Jo actually"));
    assert.ok(!texts().includes("best friend's name is Jo really"));
    assert.ok(texts().includes("coworker's name is Jo"));
    stop();
  });
});
