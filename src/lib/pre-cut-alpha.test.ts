import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import {
  idleBlinkFrameUrls,
  PRE_CUT_ALPHA_FILES,
  PRE_CUT_ALPHA_VERSION,
  SPRITES,
  spriteNeedsWhitePunch,
} from "./rai.ts";
import { punchedSpriteUrl } from "./punch-white.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Minimal PNG read: IHDR + the first pixel of row 0 (raw under every filter type). */
function pngInfo(file: string) {
  const buf = readFileSync(join(root, "public", file));
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", file);
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("latin1");
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9]!;
    } else if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return { width, height, colorType, firstPixel: [...raw.subarray(1, 5)], bytes: buf };
}

describe("pre-cut RGBA idle + blink sheets", () => {
  it("skips the runtime white punch for the pre-cut idle and all four blink frames", () => {
    const precut = [SPRITES.poses.idle, ...idleBlinkFrameUrls()];
    assert.equal(precut.length, 5);
    for (const src of precut) {
      assert.equal(spriteNeedsWhitePunch(src), false, src);
      assert.equal(spriteNeedsWhitePunch(`${src}?v=abc`), false, `${src} with query`);
    }
    // Everything else is still RGB on white and keeps the punch.
    for (const src of [SPRITES.poses.talk, SPRITES.poses.peace, SPRITES.poses.wave]) {
      assert.equal(spriteNeedsWhitePunch(src), true, src);
    }
    assert.equal(spriteNeedsWhitePunch("/star-app-2-live/rai/not_idle.png"), true);
  });

  it("versions the pre-cut URLs so the service worker's cached RGB copy is bypassed", () => {
    const precut = [SPRITES.poses.idle, ...idleBlinkFrameUrls()];
    for (const src of precut) {
      assert.ok(src.endsWith(`.png?v=${PRE_CUT_ALPHA_VERSION}`), src);
      assert.equal(spriteNeedsWhitePunch(src), false, src);
    }
    for (const src of [SPRITES.poses.talk, SPRITES.poses.peace, SPRITES.poses.wave]) {
      assert.equal(src.includes("?"), false, src);
    }
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.doesNotMatch(sw, /const CACHE = "star-rai-shell-v1";/);
  });

  it("ships the shy sheet as a pre-cut RGBA file (no runtime punch, versioned URL)", () => {
    assert.ok((PRE_CUT_ALPHA_FILES as readonly string[]).includes("rai/shy_official.png"));
    assert.equal(spriteNeedsWhitePunch(SPRITES.poses.shy), false);
    assert.ok(SPRITES.poses.shy.endsWith(`rai/shy_official.png?v=${PRE_CUT_ALPHA_VERSION}`), SPRITES.poses.shy);
    assert.equal(PRE_CUT_ALPHA_VERSION, "rgba2");
    const sha = createHash("sha256").update(pngInfo("rai/shy_official.png").bytes).digest("hex");
    assert.equal(sha, "d5f8a39493c255f8614cffac93fa76ebcc92b1a3c7d5ddbb4ccbae110e1b4f7d");
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.match(sw, /const CACHE = "star-rai-shell-v4";/);
  });

  it("ships those files as true RGBA with a transparent background", () => {
    // Idle/blink/mouth share the 1008×1792 idle canvas; official pose sheets are 720×1280.
    const expectedSize = (file: string): [number, number] =>
      file === "rai/shy_official.png" ? [720, 1280] : [1008, 1792];
    for (const file of PRE_CUT_ALPHA_FILES) {
      const info = pngInfo(file);
      assert.equal(info.colorType, 6, `${file} must be RGBA (PNG colour type 6)`);
      const [w, h] = expectedSize(file);
      assert.equal(info.width, w, `${file} width`);
      assert.equal(info.height, h, `${file} height`);
      assert.equal(info.firstPixel[3], 0, `${file} top-left must be transparent`);
    }
  });

  it("keeps blink 01 byte-identical to idle.png", () => {
    const sha = (f: string) => createHash("sha256").update(pngInfo(f).bytes).digest("hex");
    assert.equal(sha("rai/idle_blink_01_open.png"), sha("rai/idle.png"));
  });

});

/** Just enough Image/canvas/URL for punchedSpriteUrl in node; counts real punches. */
function stubBrowser(cornerAlpha: number) {
  const calls = { punched: 0, decoded: [] as string[] };
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { Image: g.Image, document: g.document, createObjectURL: URL.createObjectURL };
  class FakeImage {
    decoding = "";
    src = "";
    naturalWidth = 4;
    naturalHeight = 4;
    async decode() {
      calls.decoded.push(this.src);
    }
  }
  const ctx = {
    drawImage() {},
    getImageData(_x: number, _y: number, w: number, h: number) {
      const data = new Uint8ClampedArray(w * h * 4).fill(255);
      for (let i = 0; i < w * h; i++) data[i * 4 + 3] = cornerAlpha;
      return { data, width: w, height: h };
    },
    putImageData() {},
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob(cb: (b: Blob | null) => void) {
      calls.punched++;
      cb(new Blob(["png"]));
    },
  };
  g.Image = FakeImage;
  g.document = { createElement: () => canvas };
  URL.createObjectURL = () => "blob:punched";
  const restore = () => {
    g.Image = saved.Image;
    g.document = saved.document;
    URL.createObjectURL = saved.createObjectURL;
  };
  return { calls, restore };
}

describe("punchedSpriteUrl skips the punch for pre-cut sheets", () => {
  it("returns the pre-cut idle and blink files as-is (decoded, never punched)", async () => {
    const { calls, restore } = stubBrowser(0);
    try {
      for (const src of [SPRITES.poses.idle, ...idleBlinkFrameUrls()]) {
        assert.equal(await punchedSpriteUrl(src), src, src);
        assert.ok(calls.decoded.includes(src), `${src} decoded before use`);
      }
      assert.equal(calls.punched, 0);
    } finally {
      restore();
    }
  });

  it("still punches a stale opaque RGB copy of a pre-cut file", async () => {
    const { calls, restore } = stubBrowser(255);
    try {
      assert.equal(await punchedSpriteUrl(`${SPRITES.poses.idle}?stale=1`), "blob:punched");
      assert.equal(calls.punched, 1);
    } finally {
      restore();
    }
  });

  it("still punches the RGB-on-white sheets", async () => {
    const { calls, restore } = stubBrowser(0);
    try {
      assert.equal(await punchedSpriteUrl(SPRITES.poses.talk), "blob:punched");
      assert.equal(await punchedSpriteUrl(SPRITES.poses.wave), "blob:punched");
      assert.equal(calls.punched, 2);
    } finally {
      restore();
    }
  });
});
