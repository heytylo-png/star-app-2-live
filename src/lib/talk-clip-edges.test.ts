import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRIDGE_HOLD_KEYS,
  SMUG_CLIP_SHEET,
  TALK_CLIP_BOX,
  TALK_HOLD_FILE,
  TALK_IN_CLIP,
  TALK_OUT_CLIP,
  bridgeFilesFor,
  bridgeKeyOfSrc,
} from "./pose-bridge.ts";
import {
  SPRITES,
  canIdleBlink,
  canIdleMouth,
  holdsTalkBeat,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  isTalkPathSheetSrc,
  layersFor,
  lineEndedRestPose,
  namedPoseFromText,
  resolveSpokenPose,
  routeSpokenTalk,
  spokenTurnStartPose,
  talkClipUrls,
} from "./rai.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

type FrameEdge = { i: number; left: number; right: number; bottom: number; bbox: [number, number, number, number] };
type Manifest = {
  box: { x: number; y: number; w: number; h: number };
  strip_px: number;
  clips: Record<string, { sha256: string; frames: number; width: number; height: number; frame_edges: FrameEdge[] }>;
  hold: { file: string; sha256: string; bbox: [number, number, number, number]; outside_band_alpha_max: number; alpha_mean_abs_diff_vs_intro_last: number };
};
/** Decoded alpha of every frame of the shipped talk clips (f807/bridge/t1257/edges/gen_edges.py). */
const manifest = JSON.parse(readFileSync(join(root, "src/lib/talk-clip-edges.json"), "utf8")) as Manifest;
const MIN_MARGIN_PX = 8;
const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");

describe("talk clip band (1257 / 1261, TyLo 2026-10-11)", () => {
  it("draws 1:1 inside the 720x1280 sheet", () => {
    assert.ok(TALK_CLIP_BOX.x >= 0 && TALK_CLIP_BOX.x + TALK_CLIP_BOX.w <= SMUG_CLIP_SHEET.w);
    assert.equal(TALK_CLIP_BOX.y, 0);
    assert.equal(TALK_CLIP_BOX.h, SMUG_CLIP_SHEET.h);
    assert.equal(TALK_CLIP_BOX.w % 2, 0, "AV1 4:2:0 needs an even width");
    assert.deepEqual(manifest.box, { ...TALK_CLIP_BOX });
    const talk = puppet.slice(puppet.indexOf("talkPlayer = SmugClipPlayer.for("));
    assert.match(talk.slice(0, 400), /box: TALK_CLIP_BOX,/);
  });

  for (const clip of [TALK_IN_CLIP, TALK_OUT_CLIP]) {
    it(`${clip.file}: all 145 frames, none with a visible pixel on the band edge`, () => {
      const m = manifest.clips[clip.file];
      assert.ok(m, `manifest has ${clip.file}`);
      const sha = createHash("sha256").update(readFileSync(join(root, "public", clip.file))).digest("hex");
      assert.equal(m.sha256, sha, "manifest was generated from the shipped file");
      assert.equal(clip.frames, 145);
      assert.equal(m.frames, 145);
      assert.equal(m.frame_edges.length, 145);
      for (const f of m.frame_edges) {
        assert.equal(f.left, 0, `frame ${f.i}: alpha on the left band edge`);
        assert.equal(f.right, 0, `frame ${f.i}: alpha on the right band edge`);
        assert.equal(f.bottom, 0, `frame ${f.i}: alpha on the bottom edge`);
        assert.ok(f.bbox[0] - TALK_CLIP_BOX.x >= MIN_MARGIN_PX, `frame ${f.i}: left margin`);
        assert.ok(TALK_CLIP_BOX.x + TALK_CLIP_BOX.w - 1 - f.bbox[2] >= MIN_MARGIN_PX, `frame ${f.i}: right margin`);
      }
    });

    it(`${clip.file}: muted (no sound track in the file)`, () => {
      const bytes = readFileSync(join(root, "public", clip.file));
      assert.equal(bytes.includes(Buffer.from("soun")), false, "no sound handler");
      assert.equal(bytes.includes(Buffer.from("mp4a")), false, "no AAC sample entry");
    });
  }

  it("the hold is 1257's exact last frame (the neutral), not talk_official.png", () => {
    const h = manifest.hold;
    assert.equal(h.file, TALK_HOLD_FILE);
    const sha = createHash("sha256").update(readFileSync(join(root, "public", h.file))).digest("hex");
    assert.equal(h.sha256, sha);
    const last = manifest.clips[TALK_IN_CLIP.file]!.frame_edges[144]!;
    assert.equal(last.i, 144);
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(h.bbox[k]! - last.bbox[k]!) <= 1, `hold bbox ${h.bbox} vs f144 ${last.bbox}`);
    assert.equal(h.alpha_mean_abs_diff_vs_intro_last, 0);
    assert.equal(h.outside_band_alpha_max, 0);
    assert.match(SPRITES.poses.talk, /rai\/talk1257_hold\.webp\?v=t1$/);
    const [tin, tout] = talkClipUrls();
    assert.match(tin!, /rai\/talk1257_in\.avif\?v=t1$/);
    assert.match(tout!, /rai\/talk1261_out\.avif\?v=t1$/);
  });
});

describe("talk bridge trigger: only where the talk pose is chosen", () => {
  it("a user-named talk command picks the talk key; the pair is idle -> 1257 -> hold -> 1261 -> idle", () => {
    for (const text of ["talk", "talk pose", "do talk", "show talk", "pose talk"]) {
      assert.equal(namedPoseFromText(text), "talk", text);
    }
    assert.equal(namedPoseFromText("can we talk later"), null);
    assert.equal(holdsTalkBeat("talk"), true);
    assert.ok(BRIDGE_HOLD_KEYS.has("talk"));
    assert.equal(bridgeKeyOfSrc(SPRITES.poses.talk), "talk");
    assert.equal(bridgeFilesFor("idle", "talk")!.length, 145);
    assert.equal(bridgeFilesFor("talk", "idle")!.length, 145);
    assert.equal(
      resolveSpokenPose({ namedPose: "talk", modelPose: null, emotion: "bratty", spoken: true, seed: "talk" }),
      "talk",
    );
  });

  it("automatic spoken routes never reach it: model / tint talk lands on idle (idle mouth), as before", () => {
    assert.equal(routeSpokenTalk("talk"), "idle");
    assert.equal(spokenTurnStartPose(), "idle");
    assert.equal(
      resolveSpokenPose({ namedPose: null, modelPose: "talk", emotion: "bratty", spoken: true, seed: "you again?" }),
      "idle",
    );
    for (const pose of ["idle", "smug", "wave", "pout", "wink"] as const) assert.equal(holdsTalkBeat(pose), false, pose);
  });

  it("the talk line holds until the next send (no rest timer)", () => {
    assert.deepEqual(lineEndedRestPose({ pose: "talk", emotion: "bratty" }), { pose: "idle", emotion: "bratty" });
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    assert.match(app, /holdsPoutBeat\(pose, emotion\) \|\|\s*holdsTalkBeat\(pose, emotion\)\s*\) \{[\s\S]{0,200}anchorUnlandedLine\(\);\s*return;/);
  });
});

describe("talk bridge owns the stage (nothing else paints)", () => {
  it("the talk key paints only the neutral hold: no mouth chew, no blink, no talk_official", () => {
    for (const talking of [true, false]) {
      for (const mouth of [0, 2, 5] as const) {
        const layers = layersFor({ pose: "talk", emotion: "bratty", talking, amplitude: 0.8, angle: 0, mouth, blink: 2 });
        assert.equal(layers.length, 1);
        assert.match(layers[0]!.src, /talk1257_hold\.webp/);
      }
    }
    assert.equal(canIdleMouth({ pose: "talk", emotion: "bratty", talking: true }), false);
    assert.equal(canIdleBlink({ pose: "talk", emotion: "bratty", talking: false }), false);
  });

  it("the talk path allowlist rejects idle mouth / blink sheets, talk_official and every other sheet", () => {
    assert.equal(isTalkPathSheetSrc(SPRITES.poses.talk), true);
    for (const [a, b] of [talkClipUrls()]) {
      assert.equal(isTalkPathSheetSrc(`${a}#000`), true);
      assert.equal(isTalkPathSheetSrc(`${b}#144`), true);
    }
    assert.equal(isTalkPathSheetSrc(SPRITES.poses.idle), true, "idle.png only while 1257 f0 decodes");
    for (const src of [...idleMouthFrameUrls(), ...idleBlinkFrameUrls().slice(1)]) {
      if (/idle\.png/.test(src)) continue;
      assert.equal(isTalkPathSheetSrc(src), false, src);
    }
    for (const src of ["/rai/talk_official.png", SPRITES.poses.smug, SPRITES.poses.wave, SPRITES.poses.pout, SPRITES.poses.wink]) {
      assert.equal(isTalkPathSheetSrc(src), false, src);
    }
  });

  it("the puppet gates the idle mouth chew and blink only while the talk beat runs or holds", () => {
    assert.match(
      puppet,
      /const talkStageOn =\s*bridgeClip === "tin" \|\| bridgeClip === "tout" \|\| holdsTalkBeat\(pose\) \|\| bridgeKeyOfPlates\(shownPlates\.current\) === "talk";/,
    );
    assert.match(puppet, /const restingBlink = canIdleBlink\(\{ pose, emotion, talking, reducedMotion \}\) && !talkStageOn;/);
    assert.match(puppet, /const talkingIdle = canIdleMouth\(\{ pose, emotion, talking, reducedMotion \}\) && !talkStageOn;/);
    assert.match(puppet, /if \(holdsTalkBeat\(pose, emotion\)\) \{[\s\S]{0,200}isTalkPathSheetSrc\(layer\.src\)/);
  });

  it("never cuts: no 30 s valve either way; each direction waits for its own clip's frame 0", () => {
    const i = puppet.indexOf('if (pair === "talk") {');
    assert.ok(i > 0);
    assert.ok(i < puppet.indexOf("setBridgeWaitExpired(pair)"), "talk returns before the valve timer");
    assert.match(puppet.slice(i, i + 120), /return \(\) => window\.clearInterval\(retry\);/);
    assert.match(puppet, /wantedKey === "talk" \? clipsState\.tin : clipsState\.tout/);
  });

  it("talk is lazy: its worker starts after pout's clips are in (or 20 s), never at mount", () => {
    assert.ok(puppet.indexOf("talkPlayer = SmugClipPlayer.for(") > puppet.indexOf("const ensureTalk = "));
    const queue = puppet.slice(puppet.indexOf("const order = stagePreloadOrder("));
    const at = queue.indexOf("startTalkClips.current()");
    assert.ok(at > queue.indexOf("startPoutClips.current()"));
    assert.match(queue.slice(at - 300, at), /loadClips\.current\("pout"\)/);
  });
});
