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
  SPRITES,
  spriteNeedsWhitePunch,
} from "./rai.ts";

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

  it("ships those files as true RGBA with a transparent background", () => {
    for (const file of PRE_CUT_ALPHA_FILES) {
      const info = pngInfo(file);
      assert.equal(info.colorType, 6, `${file} must be RGBA (PNG colour type 6)`);
      assert.equal(info.width, 1008);
      assert.equal(info.height, 1792);
      assert.equal(info.firstPixel[3], 0, `${file} top-left must be transparent`);
    }
  });

  it("keeps blink 01 byte-identical to idle.png", () => {
    const sha = (f: string) => createHash("sha256").update(pngInfo(f).bytes).digest("hex");
    assert.equal(sha("rai/idle_blink_01_open.png"), sha("rai/idle.png"));
  });

  it("routes pre-cut sheets around punchedSpriteUrl in the puppet", () => {
    const src = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.match(src, /const preCut = !spriteNeedsWhitePunch\(src\);/);
    assert.match(src, /preCut \? preCutSpriteUrl\(src\) : punchedSpriteUrl\(src\)/);
  });
});
