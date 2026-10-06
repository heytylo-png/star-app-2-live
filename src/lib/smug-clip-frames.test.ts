import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClipFrames, SMUG_CLIP_AHEAD, SMUG_CLIP_PRIME, type ClipDecoder } from "./smug-clip-frames.ts";

/** A decoder stand-in: records every decode in order; images know their frame and whether they were closed. */
function fakeDecoder(frames: number, opts: { failAt?: number } = {}) {
  const decoded: number[] = [];
  const open = new Set<number>();
  let closed = false;
  const dec: ClipDecoder<{ i: number; close: () => void }> = {
    decode: async ({ frameIndex }) => {
      if (frameIndex === opts.failAt) throw new Error("bad frame");
      decoded.push(frameIndex);
      open.add(frameIndex);
      return { image: { i: frameIndex, close: () => open.delete(frameIndex) } };
    },
    close: () => {
      closed = true;
    },
    frameCount: async () => frames,
  };
  return { dec, decoded, open, isClosed: () => closed };
}

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

describe("smug clip frames (decode order)", () => {
  it("load decodes the kept prefix in order; a play decodes ahead sequentially and closes what is behind", async () => {
    const f = fakeDecoder(49);
    const clip = new ClipFrames({ open: async () => f.dec, frames: 49 });
    assert.equal(await clip.load(), true);
    assert.deepEqual(f.decoded, Array.from({ length: SMUG_CLIP_PRIME }, (_, i) => i));
    assert.equal(clip.ready(), true);
    // play every frame in order, like the worker does
    for (let i = 0; i < 49; i++) {
      for (let t = 0; t < 20 && !clip.has(i); t++) await flush();
      assert.ok(clip.has(i), `frame ${i} decoded before it is due`);
      assert.equal(clip.take(i)?.i, i);
      await flush();
      assert.ok(clip.decodedCount() <= SMUG_CLIP_PRIME + SMUG_CLIP_AHEAD + 1, `bounded memory at ${i}`);
    }
    // strictly sequential: 0..48 once each (no seek-backs, no repeats during the play)
    assert.deepEqual(f.decoded, Array.from({ length: 49 }, (_, i) => i));
    assert.equal(clip.has(49), false, "nothing past the last frame");
    clip.finish();
    await flush();
    for (let i = 0; i < SMUG_CLIP_PRIME; i++) assert.ok(clip.has(i), `kept ${i}`);
    assert.equal(clip.has(SMUG_CLIP_PRIME), false);
    assert.equal(clip.ready(), true, "the next play starts again from frame 0");
  });

  it("every play starts from frame 0 again (no mid-clip start), and repeat plays show the same frames", async () => {
    const f = fakeDecoder(145);
    const clip = new ClipFrames({ open: async () => f.dec, frames: 145 });
    await clip.load();
    for (let run = 0; run < 2; run++) {
      assert.equal(clip.peek(0)?.i, 0);
      const seen: number[] = [];
      for (let i = 0; i < 145; i++) {
        for (let t = 0; t < 20 && !clip.has(i); t++) await flush();
        seen.push(clip.take(i)!.i);
      }
      assert.deepEqual(seen, Array.from({ length: 145 }, (_, i) => i));
      clip.finish();
      await flush();
    }
  });

  it("a short file fails the load (never plays a truncated clip)", async () => {
    const f = fakeDecoder(40);
    const clip = new ClipFrames({ open: async () => f.dec, frames: 49 });
    assert.equal(await clip.load(), false);
    assert.equal(clip.failed(), true);
    assert.equal(f.isClosed(), true);
  });

  it("an unsupported browser is marked as such (the stage hard-cuts)", async () => {
    class Unsupported extends Error {}
    const clip = new ClipFrames({
      open: async () => {
        throw new Unsupported("no ImageDecoder");
      },
      isUnsupported: (e) => e instanceof Unsupported,
      frames: 49,
    });
    assert.equal(await clip.load(), false);
    assert.equal(clip.unsupported(), true);
  });

  it("dispose closes every frame and the decoder", async () => {
    const f = fakeDecoder(49);
    const clip = new ClipFrames({ open: async () => f.dec, frames: 49 });
    await clip.load();
    clip.dispose();
    assert.equal(f.open.size, 0);
    assert.equal(f.isClosed(), true);
  });
});

describe("smug clip worker / player (source contracts: Worker + OffscreenCanvas do not run in node)", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const worker = readFileSync(join(here, "smug-clip-worker.ts"), "utf8");
  const player = readFileSync(join(here, "smug-clip-player.ts"), "utf8");
  const puppet = readFileSync(join(here, "../components/puppet.tsx"), "utf8");
  const css = readFileSync(join(here, "../styles.css"), "utf8");

  it("the worker paints at most one frame per animation frame, the next one only, and stops at the last (no loop)", () => {
    const tick = worker.slice(worker.indexOf("function tick()"), worker.indexOf("function schedule()"));
    assert.match(tick, /const next = p\.index \+ 1;/);
    assert.match(tick, /if \(next >= p\.clip\.count\) \{[\s\S]*?type: "done"[\s\S]*?stopPlay\(\);\s*return;/);
    assert.match(tick, /const image = p\.clip\.frames\.peek\(next\);\s*if \(!image\) \{\s*p\.stalls \+= 1;/);
    assert.equal((tick.match(/draw\(/g) ?? []).length, 1);
    assert.doesNotMatch(worker, /index = 0;|% p\.clip\.count|loop/);
    assert.match(worker, /const FRAME_MS = 1000 \/ 24;/);
    assert.match(worker, /self\.requestAnimationFrame/);
  });

  it("every play starts on frame 0, already painted on the hidden canvas (armed); re-arm only after the stage hid it", () => {
    assert.match(player, /if \(!key \|\| !this\.st\[key\] \|\| start !== 0\) return false;/);
    assert.match(worker, /const first = clip\.frames\.ready\(\) \? clip\.frames\.peek\(0\) : null;/);
    assert.match(worker, /if \(clip\.dirty \|\| \(play && play\.clip === clip\)\) return;/);
    assert.match(player, /requestAnimationFrame\(\(\) =>\s*requestAnimationFrame\(\(\) => \{[\s\S]*?type: "hidden"/);
  });

  it("the stage hands both canvases to the worker and never draws on them itself", () => {
    assert.match(player, /transferControlToOffscreen\(\)/);
    assert.match(player, /new Worker\(new URL\("\.\/smug-clip-worker\.ts", import\.meta\.url\), \{ type: "module" \}\)/);
    assert.doesNotMatch(puppet, /drawImage|getContext/);
    assert.match(puppet, /data-rai-clip="in"/);
    assert.match(puppet, /data-rai-clip="out"/);
    assert.match(puppet, /rig\.dataset\.raiBridgeOn = key;/);
  });

  it("only the playing clip's canvas is visible, and while it is, no live sheet (idle.png included) is", () => {
    assert.match(css, /\.rai-rig > \.rai-layer\[data-rai-role="bridge"\] \{\s*visibility: hidden;/);
    assert.match(css, /\.rai-rig\[data-rai-bridge-on="in"\] > \.rai-layer\[data-rai-role="bridge"\]\[data-rai-clip="in"\]/);
    assert.match(css, /\.rai-rig\[data-rai-bridge-on="out"\] > \.rai-layer\[data-rai-role="bridge"\]\[data-rai-clip="out"\]/);
    assert.match(css, /\.rai-rig\[data-rai-bridge-on\] > \.rai-layer:not\(\[data-rai-role="bridge"\]\) \{\s*visibility: hidden;/);
  });
});
