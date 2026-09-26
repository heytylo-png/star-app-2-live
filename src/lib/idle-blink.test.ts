import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IDLE_EYE_RECTS,
  IDLE_PLATE_HEIGHT,
  IDLE_PLATE_WIDTH,
  applyEyeOverlay,
  eyeRectsFitPlate,
  isEyePixel,
} from "./idle-blink.ts";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "../../public");
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function decodeRgbPng(path: string): { width: number; height: number; rgba: Uint8ClampedArray } {
  const buf = readFileSync(path);
  assert.equal(buf.toString("ascii", 1, 4), "PNG");
  let off = 8;
  let width = 0;
  let height = 0;
  let bit = 0;
  let color = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    off += 4;
    const type = buf.toString("ascii", off, off + 4);
    off += 4;
    const data = buf.subarray(off, off + len);
    off += len + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bit = data[8] ?? 0;
      color = data[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  assert.equal(bit, 8);
  assert.equal(color, 2, "RGB plate");
  const bpp = 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let s = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[s++] ?? 0;
    const row = raw.subarray(s, s + stride);
    s += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const x = row[i] ?? 0;
      const a = i >= bpp ? (recon[i - bpp] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
      let v = x;
      if (filter === 1) v = (x + a) & 255;
      else if (filter === 2) v = (x + b) & 255;
      else if (filter === 3) v = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (x + pr) & 255;
      } else if (filter !== 0) {
        throw new Error(`unsupported png filter ${filter}`);
      }
      recon[i] = v;
    }
    prev = recon;
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const si = x * bpp;
      rgba[di] = recon[si] ?? 0;
      rgba[di + 1] = recon[si + 1] ?? 0;
      rgba[di + 2] = recon[si + 2] ?? 0;
      rgba[di + 3] = 255;
    }
  }
  return { width, height, rgba };
}

describe("idle blink eye composite", () => {
  it("registers two eye rects on the 1008×1792 plate", () => {
    assert.equal(IDLE_PLATE_WIDTH, 1008);
    assert.equal(IDLE_PLATE_HEIGHT, 1792);
    assert.equal(IDLE_EYE_RECTS.length, 2);
    assert.equal(eyeRectsFitPlate(), true);
    const [left, right] = IDLE_EYE_RECTS;
    assert.ok(left && right);
    assert.ok(left.x + left.width <= right.x, "eye rects must not overlap");
  });

  it("writes only the eye rects and leaves every other pixel untouched", () => {
    const n = IDLE_PLATE_WIDTH * IDLE_PLATE_HEIGHT * 4;
    const dest = new Uint8ClampedArray(n);
    const blink = new Uint8ClampedArray(n);
    dest.fill(7);
    for (let i = 0; i < n; i += 4) {
      blink[i] = 10;
      blink[i + 1] = 20;
      blink[i + 2] = 30;
      blink[i + 3] = 255;
    }
    // Poison the standing body on the blink sheet. It must not be copied.
    blink[0] = 255;
    blink[1] = 0;
    blink[2] = 0;
    blink[3] = 255;

    const before = dest.slice();
    assert.equal(
      applyEyeOverlay(dest, IDLE_PLATE_WIDTH, IDLE_PLATE_HEIGHT, blink, 1),
      true,
    );

    let eyes = 0;
    let bodyMoved = 0;
    for (let i = 0; i < n; i += 4) {
      const p = i / 4;
      const x = p % IDLE_PLATE_WIDTH;
      const y = (p / IDLE_PLATE_WIDTH) | 0;
      if (!isEyePixel(x, y)) {
        if (
          dest[i] !== before[i] ||
          dest[i + 1] !== before[i + 1] ||
          dest[i + 2] !== before[i + 2] ||
          dest[i + 3] !== before[i + 3]
        ) {
          bodyMoved++;
        }
      } else {
        eyes++;
        if (dest[i] !== 10 || dest[i + 1] !== 20 || dest[i + 2] !== 30 || dest[i + 3] !== 255) {
          bodyMoved++;
        }
      }
    }
    assert.equal(bodyMoved, 0);
    assert.ok(eyes > 0);

    const faded = new Uint8ClampedArray(n);
    faded.fill(3);
    applyEyeOverlay(faded, IDLE_PLATE_WIDTH, IDLE_PLATE_HEIGHT, blink, 0);
    let fadeMoved = 0;
    for (let i = 0; i < n; i += 4) {
      const p = i / 4;
      const x = p % IDLE_PLATE_WIDTH;
      const y = (p / IDLE_PLATE_WIDTH) | 0;
      if (isEyePixel(x, y)) {
        if (faded[i + 3] !== 0) fadeMoved++;
      } else if (faded[i] !== 3) {
        fadeMoved++;
      }
    }
    assert.equal(fadeMoved, 0);
  });

  it("refuses a plate that is not the registered idle size", () => {
    const dest = new Uint8ClampedArray(16);
    dest.fill(9);
    const blink = new Uint8ClampedArray(16);
    blink.fill(1);
    assert.equal(applyEyeOverlay(dest, 2, 2, blink, 1), false);
    assert.equal(dest[0], 9);
  });

  it("idle_blink differs from idle.png only inside the eye rects", () => {
    const idle = decodeRgbPng(join(publicRoot, "rai/idle.png"));
    const blink = decodeRgbPng(join(publicRoot, "rai/idle_blink.png"));
    assert.equal(idle.width, IDLE_PLATE_WIDTH);
    assert.equal(idle.height, IDLE_PLATE_HEIGHT);
    assert.equal(blink.width, idle.width);
    assert.equal(blink.height, idle.height);

    let outside = 0;
    let lid = 0;
    for (let y = 0; y < idle.height; y++) {
      for (let x = 0; x < idle.width; x++) {
        const i = (y * idle.width + x) * 4;
        const delta = Math.max(
          Math.abs((idle.rgba[i] ?? 0) - (blink.rgba[i] ?? 0)),
          Math.abs((idle.rgba[i + 1] ?? 0) - (blink.rgba[i + 1] ?? 0)),
          Math.abs((idle.rgba[i + 2] ?? 0) - (blink.rgba[i + 2] ?? 0)),
        );
        if (!isEyePixel(x, y)) {
          if (delta !== 0) outside++;
        } else if (delta >= 32) {
          lid++;
        }
      }
    }
    assert.equal(outside, 0, "standing body pixels differ — blink sheet is not eye-only");
    assert.ok(lid > 100, "eye rects do not cover the closed lids");
  });

  it("does not swap a full-body blink layer or clear the idle plate", () => {
    const rai = readFileSync(join(root, "src/lib/rai.ts"), "utf8");
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.doesNotMatch(rai, /body\(SPRITES\.idleBlink\)/);
    assert.doesNotMatch(puppet, /clearRect\(\s*0\s*,\s*0/);
    assert.match(puppet, /eyeOverlayRect/);
    assert.match(puppet, /data-rai-sheet="idle"/);
    assert.match(puppet, /data-rai-sheet="idle-eyes"/);
  });
});
