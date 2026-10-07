import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import {
  idleBlinkFrameUrls,
  BRIDGE_FILE_VERSION,
  PRE_CUT_ALPHA_FILES,
  PRE_CUT_ALPHA_VERSION,
  SPRITES,
  smugClipUrls,
  spriteNeedsWhitePunch,
  waveClipUrls,
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

/**
 * Official pose sheets that ship as offline white-matte cuts. Each keeps its own canvas;
 * everything else in PRE_CUT_ALPHA_FILES is the 1008×1792 idle canvas.
 */
const POSE_SHEET_SIZE: Record<string, [number, number]> = {
  "rai/shy_official.png": [720, 1280],
  "rai/wink_official.png": [720, 1280],
  "rai/laugh_official.png": [720, 1280],
  "rai/surprise_official.png": [720, 1280],
  "rai/content_official.png": [720, 1280],
  "rai/sad_official.png": [720, 1280],
  "rai/heart_official.png": [720, 1280],
  "rai/hold_official.png": [720, 1280],
  "rai/talk_official.png": [720, 1280],
  "rai/think_official.png": [720, 1264],
  "rai/embarrassed_official.png": [720, 1280],
  "rai/pout_official.png": [720, 1280],
  "rai/middle_finger.png": [720, 1280],
  "rai/scold_official.png": [720, 1280],
  "rai/tired_official.png": [720, 1280],
  "rai/peace.png": [843, 1500],
  "rai/side_profile.png": [768, 1168],
  "rai/three_quarter_left.png": [768, 1168],
  "rai/three_quarter_right.png": [768, 1168],
  // Smug hold (paste-15): the 2.000 s frame of 1085 (RGBA WebP). The clips are AVIF video, not sheets.
  "rai/smug1085_hold.webp": [720, 1280],
  "rai/wave1110_hold.webp": [720, 1280],
};

/** Minimal WebP read: VP8X canvas size + alpha flag (the bridge frames ship as RGBA WebP). */
function webpInfo(file: string) {
  const buf = readFileSync(join(root, "public", file));
  assert.equal(buf.toString("ascii", 0, 4), "RIFF", file);
  assert.equal(buf.toString("ascii", 8, 12), "WEBP", file);
  assert.equal(buf.toString("ascii", 12, 16), "VP8X", file);
  const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16));
  const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16));
  return { width, height, alpha: (buf[20]! & 0x10) !== 0, bytes: buf };
}

/** sha256 of every shipped pose-sheet cut. Re-pin when a sheet is re-cut (and bump the version). */
const POSE_SHEET_SHA256: Record<string, string> = {
  "rai/shy_official.png": "d5f8a39493c255f8614cffac93fa76ebcc92b1a3c7d5ddbb4ccbae110e1b4f7d",
  "rai/wink_official.png": "75288a29d8a269f05827ce123ac7ce237b9d495fd039f2767037e1c073b37c8c",
  "rai/laugh_official.png": "42eba8cc817f7066346ffcdad4a7cf1def00e0ce841a49e141851f7f58a728dd",
  "rai/surprise_official.png": "0426bfe5c8ace4c174bee10500803e3a7a56846a5f4602f2e251aa98b7c004cc",
  "rai/content_official.png": "283ae8522f127a20ee95315cf397fe4855257c9ff0985c4d48d2456cb755024e",
  "rai/sad_official.png": "4e6d8fbdfa117566c47f22383663ec51ecc39049ee917776cef39f638329d520",
  "rai/heart_official.png": "f5978119682124a1e4c2d481dc28cd2582be92affbe87c4c9f7331c13f6e6839",
  "rai/hold_official.png": "150c049302bd77e941f07495ed1ed23999661e97c2efc7616ffc2fd5001d80ed",
  "rai/talk_official.png": "ed19c949ae9803372cc15bb042e9299342cdba52d747c750841ecd0017bfa170",
  "rai/think_official.png": "b285e705b3c2098b91f58c50d8ed6d8168fb772cc7c2e13204e1e55a9434d157",
  "rai/embarrassed_official.png": "1b2dd5112aa23e47d79b4f58be8690701850d2e167f5a105e136cdd83f8c5f86",
  "rai/pout_official.png": "3a73db5c509a769c28e0d79b0d7811c7138e80468ffbba6c853b9218a6acd377",
  "rai/middle_finger.png": "e0e2a458643817734899a144af4ed8880fc252b54f5b2525acfb5145913ea75f",
  "rai/scold_official.png": "642bd3492f733378b28077bde431bfe2db57e8047f8ca0291ccce6ee82b5d436",
  "rai/tired_official.png": "ba32302195f10389464ef3b7919cfddc5edf79e861264b24d198af7eac312d82",
  "rai/peace.png": "5aa748d647e44fe2316297d16e94ffbcd438ac21592ae010f15d7a6e87772c0e",
  "rai/side_profile.png": "9d33442f05f7334548f2cadde6fd2af63091f8ef7b3c289ab0f2a6550eeb3b81",
  "rai/three_quarter_left.png": "7058fe31566b151075680faf30c756c5878327ea16f4a5c80c767248c2f3ea85",
  "rai/three_quarter_right.png": "528a5439e93271a7e8abc3e7324bcbc3ffdae2ff6a86bd680a0c22bbe6bf244e",
  // Smug hold (paste-15): 1085 frame 48 (2.000 s), the last frame of the intro clip.
  "rai/smug1085_hold.webp": "45cd6eea6c438b340e1d33c8aaeb6003828b6dfb7cc40ed9ed49359643c75cbf",
  "rai/wave1110_hold.webp": "972e82bbc2ed29befc0a9e7b3b3a7396d958ff6f93b519fa244eb26e0f42fb6d",
  // TyLo's 2026-10-06 wave still: white-matte cut, uniform x1.4 to the 1008x1792 idle canvas, no re-tone.
  "rai/wave_official.png": "1c1a888074b64729c9937c9dbc407eebec82f6b6c4699a1ec30a02c2574cddb9",
};

/** The two smug clips (paste-15): animated AVIF, AV1 + alpha, 24 fps, no audio; pinned bytes. */
const SMUG_CLIP_SHA256: Record<string, string> = {
  "rai/smug1085_in.avif": "0c2c6a4bb9ab5b995720b2026f8919dfe71632a3d19902fa3ac905c870ec5351",
  "rai/smug1084_out.avif": "c44e3af0a6233c9979747710cab1c731e5d96691dc3816628978f227f9ff1b50",
  "rai/wave1110_in.avif": "4f100189121976968255a158b04afe650a043f4bdb1ba7674b87999b6f58ada1",
  "rai/wave1114_out.avif": "844a8f4e09e8a505233c7709e5f12cefddbfc256f5cf4a0d7a16593045b98201",
};

describe("smug clips (1085 in / 1084 out)", () => {
  it("ships both clips with pinned bytes, and no 968 / 973 file is left", () => {
    const sha = (f: string) => createHash("sha256").update(readFileSync(join(root, "public", f))).digest("hex");
    for (const [file, pinned] of Object.entries(SMUG_CLIP_SHA256)) assert.equal(sha(file), pinned, file);
    const rai = readdirSync(join(root, "public/rai"));
    assert.deepEqual(rai.filter((f) => /^smug/.test(f)).sort(), ["smug1084_out.avif", "smug1085_hold.webp", "smug1085_in.avif"]);
    assert.deepEqual(rai.filter((f) => /^wave111/.test(f)).sort(), ["wave1110_hold.webp", "wave1110_in.avif", "wave1114_out.avif"]);
    assert.equal(rai.some((f) => /9(56|60|62|68|70|71|73)/.test(f)), false);
  });
});

describe("bridge file cache keys (wave w2)", () => {
  it("versions only the re-cut wave files; smug and idle URLs stay as they were", () => {
    assert.deepEqual(BRIDGE_FILE_VERSION, {
      "rai/wave1110_in.avif": "w2",
      "rai/wave1114_out.avif": "w2",
      "rai/wave1110_hold.webp": "w2",
    });
    assert.match(SPRITES.poses.wave, /rai\/wave1110_hold\.webp\?v=w2$/);
    assert.equal(spriteNeedsWhitePunch(SPRITES.poses.wave), false);
    const [win, wout] = waveClipUrls();
    assert.match(win!, /rai\/wave1110_in\.avif\?v=w2$/);
    assert.match(wout!, /rai\/wave1114_out\.avif\?v=w2$/);
    assert.match(SPRITES.poses.smug, new RegExp(`smug1085_hold\\.webp\\?v=${PRE_CUT_ALPHA_VERSION}$`));
    assert.match(SPRITES.poses.idle, new RegExp(`idle\\.png\\?v=${PRE_CUT_ALPHA_VERSION}$`));
    for (const u of smugClipUrls()) assert.equal(u.includes("?"), false, u);
  });
});

describe("pre-cut RGBA idle + blink sheets", () => {
  it("skips the runtime white punch for the pre-cut idle and all four blink frames", () => {
    const precut = [SPRITES.poses.idle, ...idleBlinkFrameUrls()];
    assert.equal(precut.length, 5);
    for (const src of precut) {
      assert.equal(spriteNeedsWhitePunch(src), false, src);
      assert.equal(spriteNeedsWhitePunch(`${src}?v=abc`), false, `${src} with query`);
    }
    // Sheets that are still RGB on white (held back from the cut sweep) keep the punch.
    for (const src of [SPRITES.poses.three_quarter, SPRITES.poses.point, SPRITES.poses.turn]) {
      assert.equal(spriteNeedsWhitePunch(src), true, src);
    }
    assert.equal(spriteNeedsWhitePunch(SPRITES.poses.wave), false);
    assert.equal(spriteNeedsWhitePunch("/star-app-2-live/rai/not_idle.png"), true);
  });

  it("versions the pre-cut URLs so the service worker's cached RGB copy is bypassed", () => {
    const precut = [SPRITES.poses.idle, ...idleBlinkFrameUrls()];
    for (const src of precut) {
      assert.ok(src.endsWith(`.png?v=${PRE_CUT_ALPHA_VERSION}`), src);
      assert.equal(spriteNeedsWhitePunch(src), false, src);
    }
    for (const src of [SPRITES.poses.three_quarter, SPRITES.poses.point, SPRITES.poses.turn]) {
      assert.equal(src.includes("?"), false, src);
    }
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.doesNotMatch(sw, /const CACHE = "star-rai-shell-v1";/);
  });

  it("ships the shy sheet as a pre-cut RGBA file (no runtime punch, versioned URL)", () => {
    assert.ok((PRE_CUT_ALPHA_FILES as readonly string[]).includes("rai/shy_official.png"));
    assert.equal(spriteNeedsWhitePunch(SPRITES.poses.shy), false);
    assert.ok(SPRITES.poses.shy.endsWith(`rai/shy_official.png?v=${PRE_CUT_ALPHA_VERSION}`), SPRITES.poses.shy);
    assert.equal(PRE_CUT_ALPHA_VERSION, "rgba3");
    const sha = createHash("sha256").update(pngInfo("rai/shy_official.png").bytes).digest("hex");
    assert.equal(sha, "d5f8a39493c255f8614cffac93fa76ebcc92b1a3c7d5ddbb4ccbae110e1b4f7d");
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.match(sw, /const CACHE = "star-rai-shell-v6";/);
  });

  it("ships those files as true RGBA with a transparent background", () => {
    // Idle/blink/mouth share the 1008×1792 idle canvas; each pose sheet keeps its own (see POSE_SHEET_SIZE).
    const expectedSize = (file: string): [number, number] => POSE_SHEET_SIZE[file] ?? [1008, 1792];
    for (const file of PRE_CUT_ALPHA_FILES) {
      if (file.endsWith(".webp")) {
        const w = webpInfo(file);
        assert.equal(w.alpha, true, `${file} must carry alpha`);
        assert.deepEqual([w.width, w.height], expectedSize(file), `${file} size`);
        continue;
      }
      const info = pngInfo(file);
      assert.equal(info.colorType, 6, `${file} must be RGBA (PNG colour type 6)`);
      const [w, h] = expectedSize(file);
      assert.equal(info.width, w, `${file} width`);
      assert.equal(info.height, h, `${file} height`);
      assert.equal(info.firstPixel[3], 0, `${file} top-left must be transparent`);
    }
  });

  it("ships every cut pose sheet with its pinned bytes and a versioned URL", () => {
    const sha = (f: string) => createHash("sha256").update(readFileSync(join(root, "public", f))).digest("hex");
    for (const [file, pinned] of Object.entries(POSE_SHEET_SHA256)) {
      assert.ok((PRE_CUT_ALPHA_FILES as readonly string[]).includes(file), `${file} in PRE_CUT_ALPHA_FILES`);
      assert.equal(sha(file), pinned, file);
    }
    // Every non-idle-canvas entry of the list is a pinned pose sheet, so a file cannot be added unpinned.
    for (const file of PRE_CUT_ALPHA_FILES) {
      if (/idle(_blink|_mouth)?/.test(file) && !(file in POSE_SHEET_SHA256)) continue;
      assert.ok(file in POSE_SHEET_SHA256, `${file} must be pinned`);
    }
    assert.match(SPRITES.poses.smug, new RegExp(`smug1085_hold\\.webp\\?v=${PRE_CUT_ALPHA_VERSION}$`));
    assert.equal(spriteNeedsWhitePunch(SPRITES.poses.smug), false);
    for (const key of ["talk", "peace", "profile", "three_quarter_left", "three_quarter_right"] as const) {
      assert.match(SPRITES.poses[key], new RegExp(`\\.png\\?v=${PRE_CUT_ALPHA_VERSION}$`), key);
      assert.equal(spriteNeedsWhitePunch(SPRITES.poses[key]), false, key);
    }
  });

  it("holds back the sheets whose edges are not chosen yet", () => {
    for (const file of ["rai/three_quarter.png", "star-rai/poses/turn-away.png", "star-rai/point-front.png"]) {
      assert.equal((PRE_CUT_ALPHA_FILES as readonly string[]).includes(file), false, file);
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
      assert.equal(await punchedSpriteUrl(SPRITES.poses.three_quarter), "blob:punched");
      assert.equal(calls.punched, 1);
    } finally {
      restore();
    }
  });
});
