import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canIdleBlink,
  canIdleMouth,
  idleMouthLineLive,
  IDLE_MOUTH_ENABLED,
  IDLE_REST_LAYER_ID,
  idleMouthFrameSrc,
  idleMouthFrameUrls,
  idleRestSrc,
  layersFor,
  PRE_CUT_ALPHA_FILES,
  resolveSpokenPose,
  textChewDeadline,
  textChewMs,
  TEXT_CHEW_MAX_MS,
  TEXT_CHEW_MIN_MS,
  TEXT_CHEW_MS_PER_CHAR,
  PRE_CUT_ALPHA_VERSION,
  SPRITES,
  spriteNeedsWhitePunch,
  type EmotionId,
  type PoseId,
} from "./rai.ts";
import {
  IDLE_MOUTH_STEP_MAX_MS,
  IDLE_MOUTH_STEP_MIN_MS,
  idleMouthStepMs,
  idleMouthStepName,
  idleMouthSyllable,
  isHypeLine,
} from "./rai-motion.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Final baked sheets from artifacts/star-rai-blink-frames/baked (TyLo "Wire it"). */
const MOUTH_SHA256: Record<string, string> = {
  "rai/idle_mouth_02_small.png": "f9a96d3bb301ac74ada56802637a294cdc9e282f15a7ac775fe4acd288b9c260",
  "rai/idle_mouth_03_open.png": "232ea026d99abcf10a5b8219a88fa3f7a61c0653ce28536d47dd3bd1658144e6",
  "rai/idle_mouth_04_oo.png": "d62c2477202074b7a1cae9689dc4a34ed852d0a3437197aac08f508e7725873c",
  "rai/idle_mouth_05_wide.png": "c8916feabb909af938b086b2c108da6c9994139a598b7adda717337efb76f8e9",
  "rai/idle_mouth_06_smirk.png": "97e36df31b167a27f9f141af81a7cdf3676425c9b725978eb1f6ce598733f736",
};
/** 01 closed is idle.png / blink 01 byte for byte. */
const IDLE_SHA256 = "85ad7430097c992b75a3f67a09774675867a8c5f3c5f63730a34c180eb807568";

function sha(file: string): string {
  return createHash("sha256").update(readFileSync(join(root, "public", file))).digest("hex");
}

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

const talkingIdle = {
  pose: "idle" as PoseId,
  emotion: "bratty" as EmotionId,
  talking: true,
  amplitude: 0.5,
  angle: 0,
};

describe("idle mouth sheets", () => {
  it("ships 02-06 byte-identical to the baked artifacts, and 01 is the rest sheet", () => {
    for (const [file, hash] of Object.entries(MOUTH_SHA256)) assert.equal(sha(file), hash, file);
    assert.equal(sha("rai/idle.png"), IDLE_SHA256);
    assert.equal(sha("rai/idle_blink_01_open.png"), IDLE_SHA256);
    assert.equal(idleMouthFrameSrc(1), idleRestSrc());
    assert.equal(idleMouthFrameSrc(0), idleRestSrc());
    assert.equal(SPRITES.idleMouth.closed, SPRITES.idleBlinkOpen);
  });

  it("skips the runtime white punch and carries ?v=rgba1 like idle/blink", () => {
    const urls = idleMouthFrameUrls();
    assert.equal(urls.length, 5);
    for (const file of Object.keys(MOUTH_SHA256)) {
      assert.ok((PRE_CUT_ALPHA_FILES as readonly string[]).includes(file), file);
    }
    for (const src of urls) {
      assert.ok(src.endsWith(`.png?v=${PRE_CUT_ALPHA_VERSION}`), src);
      assert.equal(spriteNeedsWhitePunch(src), false, src);
    }
    assert.equal(spriteNeedsWhitePunch(SPRITES.poses.talk), true);
  });

  it("bumps the service-worker cache for the new sheets", () => {
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.match(sw, /const CACHE = "star-rai-shell-v3";/);
  });
});

describe("idle mouth on the one rest image", () => {
  it("is on, and only while speaking on the idle pose with no mood sheet", () => {
    assert.equal(IDLE_MOUTH_ENABLED, true);
    assert.equal(canIdleMouth({ pose: "idle", emotion: "bratty", talking: true }), true);
    assert.equal(canIdleMouth({ pose: "idle", emotion: "glance", talking: true }), true);
    assert.equal(canIdleMouth({ pose: "idle", emotion: "bratty", talking: false }), false);
    assert.equal(canIdleMouth({ pose: "idle", emotion: "bratty", talking: false, lineLive: true }), true);
    assert.equal(canIdleMouth({ pose: "talk", emotion: "bratty", talking: true }), false);
    assert.equal(canIdleMouth({ pose: "wave", emotion: "bratty", talking: true }), false);
    assert.equal(canIdleMouth({ pose: "idle", emotion: "smug", talking: true }), false);
    assert.equal(canIdleMouth({ pose: "idle", emotion: "hype", talking: true }), false);
    assert.equal(
      canIdleMouth({ pose: "idle", emotion: "bratty", talking: true, reducedMotion: true }),
      false,
    );
    // Blink never runs in the mouth window.
    assert.equal(canIdleBlink({ pose: "idle", emotion: "bratty", talking: true }), false);
  });

  it("keeps a generic spoken line on idle and chews a text-only reply", () => {
    const generic = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "idle",
      seed: "hey there",
    });
    const omitted = resolveSpokenPose({
      namedPose: null,
      modelPose: "idle",
      emotion: "bratty",
      spoken: true,
      seed: "hey there",
    });
    assert.equal(generic, "idle");
    assert.equal(omitted, "idle");
    assert.equal(canIdleMouth({ pose: generic, emotion: "bratty", talking: false, lineLive: true }), true);
    assert.match(
      layersFor({
        pose: generic,
        emotion: "bratty",
        talking: true,
        amplitude: 0,
        angle: 0,
        mouth: 3,
      })[0]!.src,
      /idle_mouth_03_open/,
    );

    assert.equal(TEXT_CHEW_MS_PER_CHAR, 55);
    assert.equal(textChewMs(""), 0);
    assert.equal(textChewMs("Hi"), TEXT_CHEW_MIN_MS);
    assert.equal(textChewMs("a".repeat(20)), 20 * 55);
    assert.equal(textChewMs("a".repeat(80)), TEXT_CHEW_MAX_MS);
    const started = 1_000;
    assert.equal(textChewDeadline(started, "hey there"), started + textChewMs("hey there"));
    assert.equal(
      idleMouthLineLive({
        caption: "hey there",
        sending: false,
        talking: false,
        now: started + 100,
        chewUntil: textChewDeadline(started, "hey there"),
      }),
      true,
    );
    assert.equal(
      idleMouthLineLive({
        caption: "hey there",
        sending: true,
        talking: false,
        now: started,
        chewUntil: 0,
      }),
      true,
    );
    assert.equal(
      idleMouthLineLive({
        caption: "hey there",
        sending: false,
        talking: false,
        now: textChewDeadline(started, "hey there"),
        chewUntil: textChewDeadline(started, "hey there"),
      }),
      false,
    );

    const wave = resolveSpokenPose({
      namedPose: "wave",
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "idle",
    });
    assert.equal(wave, "wave");
    assert.equal(canIdleMouth({ pose: wave, emotion: "bratty", talking: true, lineLive: true }), false);
    const namedTalk = resolveSpokenPose({
      namedPose: "talk",
      modelPose: null,
      emotion: "bratty",
      spoken: true,
    });
    assert.equal(namedTalk, "talk");
    assert.equal(canIdleMouth({ pose: namedTalk, emotion: "bratty", talking: true, lineLive: true }), false);
    const kiss = resolveSpokenPose({
      namedPose: false,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "wave",
    });
    assert.equal(kiss, "wave");
  });

  it("hard-cuts full sheets on the rest layer id, one image, never talk_official", () => {
    const expected: Record<number, RegExp> = {
      1: /idle_blink_01_open\.png\?v=rgba1$/,
      2: /idle_mouth_02_small\.png\?v=rgba1$/,
      3: /idle_mouth_03_open\.png\?v=rgba1$/,
      4: /idle_mouth_04_oo\.png\?v=rgba1$/,
      5: /idle_mouth_05_wide\.png\?v=rgba1$/,
      6: /idle_mouth_06_smirk\.png\?v=rgba1$/,
    };
    for (const mouth of [1, 2, 3, 4, 5, 6] as const) {
      const layers = layersFor({ ...talkingIdle, mouth, blink: 4 });
      assert.equal(layers.length, 1);
      assert.equal(layers[0]!.id, IDLE_REST_LAYER_ID);
      assert.equal(layers[0]!.role, "body");
      assert.equal(layers[0]!.opacity, 1);
      assert.match(layers[0]!.src, expected[mouth]!);
      assert.doesNotMatch(layers[0]!.src, /talk_official|mouth_(speak|oh|grin|kiss|closed)|face_/);
    }
  });

  it("leaves every other pose and mood sheet untouched", () => {
    for (const mouth of [0, 3, 5] as const) {
      assert.match(layersFor({ ...talkingIdle, pose: "talk", mouth })[0]!.src, /talk_official/);
      assert.match(layersFor({ ...talkingIdle, pose: "wave", mouth })[0]!.src, /wave_official/);
      assert.match(layersFor({ ...talkingIdle, emotion: "smug", mouth })[0]!.src, /smug_official/);
      assert.match(layersFor({ ...talkingIdle, emotion: "hype", mouth })[0]!.src, /peace\.png/);
    }
    // Not talking: mouth is ignored, rest sits on 01 / blink frames.
    const rest = layersFor({ ...talkingIdle, talking: false, mouth: 3, blink: 0 });
    assert.equal(rest[0]!.src, idleRestSrc());
  });
});

describe("idle mouth timing", () => {
  it("steps 90-120ms per cut", () => {
    assert.equal(IDLE_MOUTH_STEP_MIN_MS, 90);
    assert.equal(IDLE_MOUTH_STEP_MAX_MS, 120);
    assert.equal(idleMouthStepMs(() => 0), 90);
    assert.equal(idleMouthStepMs(() => 1), 120);
    for (let i = 0; i < 200; i++) {
      const ms = idleMouthStepMs();
      assert.ok(ms >= 90 && ms <= 120, String(ms));
    }
  });

  it("default syllable is 02 → 03 → 02 → 01 (the 01-02-03-02-01 loop)", () => {
    const steps = idleMouthSyllable({ rand: () => 0.5 });
    assert.deepEqual(
      steps.map((s) => s.mouth),
      [2, 3, 2, 1],
    );
    for (const s of steps) assert.ok(s.ms >= 90 && s.ms <= 120);
  });

  it("uses 04 oo and 06 smirk as occasional spice", () => {
    assert.deepEqual(
      idleMouthSyllable({ rand: seq([0.1, 0.5]) }).map((s) => s.mouth),
      [2, 4, 2, 1],
    );
    const smirk = idleMouthSyllable({ rand: seq([0.01, 0.5]) });
    assert.deepEqual(
      smirk.map((s) => s.mouth),
      [6, 1],
    );
    assert.ok(smirk[0]!.ms >= 180 && smirk[0]!.ms <= 240);
    let oo = 0;
    let sm = 0;
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      for (const s of idleMouthSyllable()) {
        if (s.mouth === 4) oo += 1;
        if (s.mouth === 6) sm += 1;
      }
      n += 1;
    }
    assert.ok(oo / n > 0.05 && oo / n < 0.25, `oo ${oo / n}`);
    assert.ok(sm / n > 0.02 && sm / n < 0.15, `smirk ${sm / n}`);
  });

  it("opens to 05 wide only on hype lines", () => {
    for (let i = 0; i < 3000; i++) {
      assert.ok(!idleMouthSyllable({ hype: false }).some((s) => s.mouth === 5));
    }
    assert.deepEqual(
      idleMouthSyllable({ hype: true, rand: seq([0.5, 0.1]) }).map((s) => s.mouth),
      [2, 5, 2, 1],
    );
    let wide = 0;
    for (let i = 0; i < 2000; i++) {
      if (idleMouthSyllable({ hype: true }).some((s) => s.mouth === 5)) wide += 1;
    }
    assert.ok(wide > 400, String(wide));
  });

  it("uses live TTS amplitude only to pick closed / small", () => {
    assert.deepEqual(
      idleMouthSyllable({ ampLive: true, amplitude: 0.01 }).map((s) => s.mouth),
      [1],
    );
    assert.deepEqual(
      idleMouthSyllable({ ampLive: true, amplitude: 0.08 }).map((s) => s.mouth),
      [2, 1],
    );
    assert.deepEqual(
      idleMouthSyllable({ ampLive: true, amplitude: 0.5, rand: () => 0.5 }).map((s) => s.mouth),
      [2, 3, 2, 1],
    );
    // Before any audio is heard, amp 0 does not freeze the mouth shut.
    assert.deepEqual(
      idleMouthSyllable({ ampLive: false, amplitude: 0, rand: () => 0.5 }).map((s) => s.mouth),
      [2, 3, 2, 1],
    );
  });

  it("reads hype from exclamation-heavy text", () => {
    assert.equal(isHypeLine("Let's go!!"), true);
    assert.equal(isHypeLine("Wait! You did that!"), true);
    assert.equal(isHypeLine("NO WAY! Really"), true);
    assert.equal(isHypeLine("Hey!"), false);
    assert.equal(isHypeLine("Facing you. Front and center~"), false);
    assert.equal(isHypeLine(""), false);
    assert.equal(isHypeLine(undefined), false);
  });

  it("names every step", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6].map(idleMouthStepName),
      ["rest", "01-closed", "02-small", "03-open", "04-oo", "05-wide", "06-smirk"],
    );
  });
});

describe("puppet wiring", () => {
  const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
  it("drives the mouth on the rest image, decodes first, and pauses blink", () => {
    assert.match(puppet, /canIdleMouth\(/);
    assert.match(puppet, /idleMouthSyllable\(/);
    assert.match(puppet, /mouthReady/);
    assert.match(puppet, /new Set\(\[\.\.\.idleBlinkFrameUrls\(\), \.\.\.idleMouthFrameUrls\(\)\]\)/);
    assert.match(puppet, /mouthRef\.current > 0/);
    // Decoded frames stay referenced so the first cut never waits on a refetch.
    assert.match(puppet, /decodedFrames\.current\.push\(img\)/);
    assert.doesNotMatch(puppet, /talk_official/);
    assert.doesNotMatch(puppet, /will-change|willChange|translateZ/);
  });
});
