import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { POSE_BRIDGE_PAIRS, WAVE_CLIP_BOX, bridgeClips, parseClipFrame } from "./pose-bridge.ts";
import { BRIDGE_FILE_VERSION, welcomeClipUrls } from "./rai.ts";
import {
  WELCOME_1329_CLIP,
  WELCOME_1330_CLIP,
  WELCOME_CLIPS,
  WELCOME_GAP_MS,
  WELCOME_PENDING_MAX_MS,
  WELCOME_SETTLE_MS,
  WelcomeGate,
  pickWelcomeClip,
  readLastActivity,
  welcomeDebugClip,
  welcomeDue,
  writeLastActivity,
} from "./welcome-wave.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
type FrameEdge = { i: number; left: number; right: number; bottom: number; bbox: [number, number, number, number] };
const manifest = JSON.parse(readFileSync(join(root, "src/lib/welcome-clip-edges.json"), "utf8")) as {
  box: typeof WAVE_CLIP_BOX;
  clips: Record<string, { sha256: string; frames: number; width: number; height: number; frame_edges: FrameEdge[] }>;
};
const idle = { restingIdle: true, talking: false, wantedIdle: true, reducedMotion: false };

describe("welcome-back wave (TyLo 2026-10-13 10:08)", () => {
  it("two separate 121-frame clips, tagged wb1, lazy (not a pose pair, not in the startup clips)", () => {
    assert.equal(WELCOME_1329_CLIP.file, "rai/welcome1329.avif");
    assert.equal(WELCOME_1330_CLIP.file, "rai/welcome1330.avif");
    for (const c of WELCOME_CLIPS) {
      assert.equal(c.frames, 121);
      assert.equal(BRIDGE_FILE_VERSION[c.file], "wb1");
      assert.equal(parseClipFrame(`${c.file}?v=wb1#120`)?.clip, c);
      assert.ok(!bridgeClips().includes(c));
      for (const list of Object.values(POSE_BRIDGE_PAIRS)) assert.ok(!list.some((f) => f.startsWith(c.file)));
    }
    assert.deepEqual(
      welcomeClipUrls().map((u) => u.replace(/^.*\/rai\//, "rai/")),
      ["rai/welcome1329.avif?v=wb1", "rai/welcome1330.avif?v=wb1"],
    );
    const sw = readFileSync(join(root, "public/sw.js"), "utf8");
    assert.doesNotMatch(sw, /welcome13/, "never precached");
  });

  it("each file fits the phone budget (< 1.8 MB) and the band edges stay clear", () => {
    assert.deepEqual(manifest.box, { ...WAVE_CLIP_BOX });
    for (const c of WELCOME_CLIPS) {
      const buf = readFileSync(join(root, "public", c.file));
      assert.ok(statSync(join(root, "public", c.file)).size < 1_800_000);
      const m = manifest.clips[c.file]!;
      assert.equal(m.sha256, createHash("sha256").update(buf).digest("hex"), "manifest from the shipped file");
      assert.equal(m.frames, c.frames);
      assert.equal(m.frame_edges.length, c.frames);
      for (const f of m.frame_edges) {
        assert.equal(f.left, 0, `${c.file} f${f.i} left`);
        assert.equal(f.right, 0, `${c.file} f${f.i} right`);
        assert.equal(f.bottom, 0, `${c.file} f${f.i} bottom`);
        assert.ok(f.bbox[0] >= 8, `${c.file} f${f.i} left margin ${f.bbox[0]}`);
        assert.ok(WAVE_CLIP_BOX.w - 1 - f.bbox[2] >= 8, `${c.file} f${f.i} right margin`);
      }
    }
  });

  it("due only after >= 6 h of no activity; a first visit is not a return", () => {
    const now = 1_800_000_000_000;
    assert.equal(welcomeDue(null, now), false);
    assert.equal(welcomeDue(now - WELCOME_GAP_MS + 1, now), false);
    assert.equal(welcomeDue(now - 5 * 60_000, now), false);
    assert.equal(welcomeDue(now - WELCOME_GAP_MS, now), true);
    assert.equal(welcomeDue(now - 7 * 3_600_000, now), true);
  });

  it("debug param and random pick", () => {
    assert.equal(welcomeDebugClip("?welcome=1329"), WELCOME_1329_CLIP);
    assert.equal(welcomeDebugClip("?v=x&welcome=1330"), WELCOME_1330_CLIP);
    assert.equal(welcomeDebugClip("?welcome=1", () => 0.9), WELCOME_1330_CLIP);
    assert.equal(welcomeDebugClip("?welcome=9"), null);
    assert.equal(welcomeDebugClip(""), null);
    assert.equal(pickWelcomeClip(() => 0.1), WELCOME_1329_CLIP);
    assert.equal(pickWelcomeClip(() => 0.6), WELCOME_1330_CLIP);
  });

  it("activity stamp round-trips through storage", () => {
    const m = new Map<string, string>();
    const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    assert.equal(readLastActivity(st), null);
    writeLastActivity(st, 12345.6);
    assert.equal(readLastActivity(st), 12346);
  });

  it("plays once, only on a rested idle stage; a send defers it; it is dropped when it never settles", () => {
    const g = new WelcomeGate();
    assert.equal(g.tick(idle, 0), null);
    g.arm(WELCOME_1330_CLIP, 0);
    assert.equal(g.tick({ ...idle, restingIdle: false }, 100), null, "mid-bridge / hold");
    assert.equal(g.tick({ ...idle, talking: true }, 200), null);
    assert.equal(g.tick(idle, 300), null);
    g.deferForSend();
    assert.equal(g.tick(idle, 300 + WELCOME_SETTLE_MS - 1), null, "settle clock restarted by the send");
    assert.equal(g.tick({ ...idle, wantedIdle: false }, 400 + WELCOME_SETTLE_MS), null, "reply pose coming");
    assert.equal(g.tick(idle, 2000 + WELCOME_SETTLE_MS), null);
    assert.equal(g.tick(idle, 2000 + 2 * WELCOME_SETTLE_MS), WELCOME_1330_CLIP);
    assert.equal(g.tick(idle, 9999 + 3 * WELCOME_SETTLE_MS), null, "once per return");
    g.arm(WELCOME_1329_CLIP, 0);
    assert.equal(g.tick({ ...idle, restingIdle: false }, WELCOME_PENDING_MAX_MS + 1), null);
    assert.equal(g.pending(), null);
    g.arm(WELCOME_1329_CLIP, 0);
    assert.equal(g.tick({ ...idle, reducedMotion: true }, 10), null);
    assert.equal(g.pending(), null);
  });

  it("the stage wires it: lazy player with the wave band, own canvases, no audio / chat", () => {
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    const p = puppet.slice(puppet.indexOf("welcomePlayerRef.current = SmugClipPlayer.for("));
    assert.match(p.slice(0, 500), /box: WAVE_CLIP_BOX,/);
    assert.match(puppet, /data-rai-clip="wca"/);
    assert.match(puppet, /data-rai-clip="wcb"/);
    const css = readFileSync(join(root, "src/styles.css"), "utf8");
    assert.match(css, /data-rai-bridge-on="wca"\] > \.rai-layer\[data-rai-role="bridge"\]\[data-rai-clip="wca"\]/);
    assert.match(css, /data-rai-bridge-on="wcb"\] > \.rai-layer\[data-rai-role="bridge"\]\[data-rai-clip="wcb"\]/);
    const mod = readFileSync(join(root, "src/lib/welcome-wave.ts"), "utf8");
    assert.doesNotMatch(mod, /speak\(|addMessage|new Audio|createThread/);
  });
});
