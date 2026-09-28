import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeSheet, SHEET_DECODE_TIMEOUT_MS, type DecodableImage } from "./sheet-decode.ts";

function fakeImage(init: { complete?: boolean; naturalWidth?: number } = {}) {
  let resolveDecode: () => void = () => {};
  let rejectDecode: (e: Error) => void = () => {};
  const listeners = new Map<string, Set<() => void>>();
  const img = {
    complete: init.complete ?? false,
    naturalWidth: init.naturalWidth ?? 0,
    decode: () =>
      new Promise<void>((res, rej) => {
        resolveDecode = res;
        rejectDecode = rej;
      }),
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
  };
  return {
    img: img as DecodableImage & { complete: boolean; naturalWidth: number },
    resolveDecode: () => resolveDecode(),
    rejectDecode: () => rejectDecode(new Error("EncodingError")),
    fire(type: "load" | "error") {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

function manualTimers() {
  const pending = new Map<number, () => void>();
  let seq = 0;
  return {
    timers: {
      set: (fn: () => void) => {
        seq += 1;
        pending.set(seq, fn);
        return seq;
      },
      clear: (handle: unknown) => {
        pending.delete(handle as number);
      },
    },
    fireAll() {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    },
    size: () => pending.size,
  };
}

const tick = () => new Promise((r) => setImmediate(r));

describe("decodeSheet (decode before swap)", () => {
  it("waits at most ~400ms", () => {
    assert.equal(SHEET_DECODE_TIMEOUT_MS, 400);
  });

  it("resolves decoded when decode() lands in time and clears its timer", async () => {
    const f = fakeImage();
    const t = manualTimers();
    const p = decodeSheet(f.img, 400, t.timers);
    f.resolveDecode();
    assert.equal(await p, "decoded");
    assert.equal(t.size(), 0);
  });

  it("falls back to loaded when decode() is slow but the file is in", async () => {
    const f = fakeImage({ complete: true, naturalWidth: 1008 });
    const t = manualTimers();
    const p = decodeSheet(f.img, 400, t.timers);
    t.fireAll();
    assert.equal(await p, "loaded");
  });

  it("falls back to loaded when decode() rejects on a loaded file", async () => {
    const f = fakeImage({ complete: true, naturalWidth: 1008 });
    const t = manualTimers();
    const p = decodeSheet(f.img, 400, t.timers);
    f.rejectDecode();
    assert.equal(await p, "loaded");
    assert.equal(t.size(), 0);
  });

  it("fails (keep the current frame) when the file is broken", async () => {
    const f = fakeImage({ complete: true, naturalWidth: 0 });
    const t = manualTimers();
    const p = decodeSheet(f.img, 400, t.timers);
    f.rejectDecode();
    assert.equal(await p, "failed");
  });

  it("after the timeout, waits for load or error while still downloading", async () => {
    const slow = fakeImage();
    const t = manualTimers();
    const p = decodeSheet(slow.img, 400, t.timers);
    t.fireAll();
    await tick();
    assert.equal(slow.listenerCount(), 2);
    slow.img.naturalWidth = 1008;
    slow.img.complete = true;
    slow.fire("load");
    assert.equal(await p, "loaded");
    assert.equal(slow.listenerCount(), 0);

    const broken = fakeImage();
    const t2 = manualTimers();
    const p2 = decodeSheet(broken.img, 400, t2.timers);
    t2.fireAll();
    broken.fire("error");
    assert.equal(await p2, "failed");

    // A decode that lands after the timeout (still downloading) still counts as decoded.
    const late = fakeImage();
    const t3 = manualTimers();
    const p3 = decodeSheet(late.img, 400, t3.timers);
    t3.fireAll();
    late.resolveDecode();
    assert.equal(await p3, "decoded");
    assert.equal(late.listenerCount(), 0);
  });
});
