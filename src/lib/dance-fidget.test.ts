import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DANCE_HOLD_MAX_MS,
  DANCE_HOLD_MIN_MS,
  DANCE_SHEETS,
  advanceDanceSheet,
  danceHoldMs,
  dancePlayerFromMedia,
  dancePlayerFromSpotify,
  dancePlayerPhase,
  danceSheetFile,
  danceShouldSnapIdle,
  lifeTrackPlaying,
  namedPoseWins,
  poseOnLifeStop,
  stageImageDriver,
  type DanceSheet,
} from "./dance-fidget.ts";
import { LIVE_POSE_FILES } from "./rai.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Life dance fidgets", () => {
  it("cycles the existing sheets and hard-cuts on a 500-800ms hold", () => {
    assert.deepEqual(DANCE_SHEETS, ["wave", "peace", "hearts", "laugh", "smug"]);
    assert.equal(danceSheetFile("wave"), LIVE_POSE_FILES.wave);
    assert.equal(danceSheetFile("peace"), "rai/peace.png");
    assert.equal(danceSheetFile("hearts"), "rai/heart_official.png");
    assert.equal(danceSheetFile("laugh"), "rai/laugh_official.png");
    assert.equal(danceSheetFile("smug"), LIVE_POSE_FILES.smug);
    assert.equal(DANCE_HOLD_MIN_MS, 500);
    assert.equal(DANCE_HOLD_MAX_MS, 800);
    assert.equal(danceHoldMs(0), 500);
    assert.equal(danceHoldMs(0.5), 650);
    assert.equal(danceHoldMs(0.999999), 800);
    assert.equal(danceHoldMs(Number.NaN), 500);
    for (let i = 0; i < 20; i++) {
      const ms = danceHoldMs(i / 20);
      assert.ok(ms >= 500 && ms <= 800, String(ms));
    }

    let sheet: DanceSheet | null = null;
    const seen: DanceSheet[] = [];
    for (let i = 0; i < DANCE_SHEETS.length; i++) {
      sheet = advanceDanceSheet(sheet);
      seen.push(sheet);
      assert.notEqual(sheet, seen[i - 1]);
    }
    assert.deepEqual(seen, ["wave", "peace", "hearts", "laugh", "smug"]);
    assert.equal(advanceDanceSheet("smug"), "wave");
  });

  it("dances only while Life has a track actually playing", () => {
    const base = {
      namedPose: null,
      idleSnap: false,
      deskIsLifeLook: true,
      sheet: "wave" as const,
      bubble: false,
    };
    const audible = dancePlayerFromSpotify({ reported: true, paused: false });
    assert.equal(lifeTrackPlaying({ on: true, now_playing: "Super Shy" }, audible), true);
    assert.equal(lifeTrackPlaying({ on: true, now_playing: "Super Shy" }), false);
    assert.equal(lifeTrackPlaying({ on: true, now_playing: "  " }, audible), false);
    assert.equal(lifeTrackPlaying({ on: false, now_playing: "Super Shy" }, audible), false);
    assert.equal(lifeTrackPlaying(null, audible), false);

    const playing = stageImageDriver({ ...base, place: "life", trackPlaying: true });
    assert.deepEqual(playing, { kind: "dance", sheet: "wave" });
    const bubble = stageImageDriver({ ...base, place: "life", trackPlaying: true, bubble: true });
    assert.equal(bubble.kind, "dance");
    assert.equal(stageImageDriver({ ...base, place: "chart", trackPlaying: true }).kind, "puppet");
    assert.equal(stageImageDriver({ ...base, place: "chat", trackPlaying: true }).kind, "puppet");
    assert.equal(stageImageDriver({ ...base, place: "chat", trackPlaying: false }).kind, "puppet");
    assert.equal(stageImageDriver({ ...base, place: "call", trackPlaying: true }).kind, "puppet");
  });

  it("stays idle unless playback has actually started", () => {
    const seeded = { on: true, now_playing: "Super Shy" };
    const quiet = {
      place: "life" as const,
      namedPose: null,
      idleSnap: false,
      deskIsLifeLook: true,
      sheet: "wave" as const,
    };
    const cases = [
      ["fresh", dancePlayerFromSpotify({ reported: false, paused: false })],
      ["no player", dancePlayerFromSpotify(null)],
      ["paused", dancePlayerFromSpotify({ reported: true, paused: true })],
      ["buffering", dancePlayerFromSpotify({ reported: true, paused: false, buffering: true })],
      ["ended", dancePlayerFromSpotify({ reported: true, paused: true, ended: true })],
      ["errored", dancePlayerFromSpotify({ reported: true, paused: false, error: true })],
      ["media paused", dancePlayerFromMedia({ paused: true, ended: false, error: false, readyState: 4 })],
      ["media buffering", dancePlayerFromMedia({ paused: false, ended: false, error: false, readyState: 1 })],
      ["media ended", dancePlayerFromMedia({ paused: false, ended: true, error: false, readyState: 4 })],
      ["media errored", dancePlayerFromMedia({ paused: false, ended: false, error: true, readyState: 0 })],
      ["media missing", dancePlayerFromMedia(null)],
    ] as const;
    for (const [label, player] of cases) {
      assert.notEqual(dancePlayerPhase(player), "playing", label);
      assert.equal(lifeTrackPlaying(seeded, player), false, label);
      assert.notEqual(stageImageDriver({ ...quiet, trackPlaying: lifeTrackPlaying(seeded, player) }).kind, "dance", label);
    }
    const mediaPlaying = dancePlayerFromMedia({ paused: false, ended: false, error: false, readyState: 4 });
    assert.equal(dancePlayerPhase(mediaPlaying), "playing");
    assert.equal(lifeTrackPlaying(seeded, mediaPlaying), true);
    const spotifyPlaying = dancePlayerFromSpotify({ reported: true, paused: false });
    assert.equal(dancePlayerPhase(spotifyPlaying), "playing");
    assert.equal(stageImageDriver({ ...quiet, trackPlaying: lifeTrackPlaying(seeded, spotifyPlaying) }).kind, "dance");
  });

  it("lets a named pose win, then resumes the dance if the track is still playing", () => {
    assert.equal(namedPoseWins("wave", "wave"), "wave");
    assert.equal(namedPoseWins("wave", "idle"), null);
    assert.equal(namedPoseWins(false, "idle"), null);
    assert.equal(namedPoseWins(null, "smug"), null);
    const named = stageImageDriver({
      place: "life",
      trackPlaying: true,
      namedPose: "laugh",
      idleSnap: false,
      deskIsLifeLook: true,
      sheet: "peace",
      bubble: true,
    });
    assert.deepEqual(named, { kind: "named", pose: "laugh" });
    const again = stageImageDriver({
      place: "life",
      trackPlaying: true,
      namedPose: null,
      idleSnap: false,
      deskIsLifeLook: true,
      sheet: "peace",
    });
    assert.deepEqual(again, { kind: "dance", sheet: "peace" });
  });

  it("snaps stop and leaving Life to official idle, and leaves the desk loop when it is already the Life look", () => {
    assert.equal(poseOnLifeStop("session_stop", "wave"), "idle");
    assert.equal(poseOnLifeStop("track_change", "smug"), "smug");
    assert.equal(danceShouldSnapIdle(true, "life", false), true);
    assert.equal(danceShouldSnapIdle(true, "chart", true), true);
    assert.equal(danceShouldSnapIdle(true, "chat", false), true);
    assert.equal(danceShouldSnapIdle(true, "life", true), false);
    assert.equal(danceShouldSnapIdle(false, "chat", false), false);

    const stopped = stageImageDriver({
      place: "life",
      trackPlaying: false,
      namedPose: null,
      idleSnap: true,
      deskIsLifeLook: true,
      sheet: "smug",
    });
    assert.equal(stopped.kind, "idle");
    const desk = stageImageDriver({
      place: "life",
      trackPlaying: false,
      namedPose: null,
      idleSnap: false,
      deskIsLifeLook: true,
      sheet: "wave",
    });
    assert.equal(desk.kind, "desk");
    const failed = stageImageDriver({
      place: "life",
      trackPlaying: false,
      namedPose: null,
      idleSnap: false,
      deskIsLifeLook: false,
      sheet: "wave",
    });
    assert.equal(failed.kind, "idle");
    assert.equal(
      stageImageDriver({
        place: "chat",
        trackPlaying: false,
        namedPose: null,
        idleSnap: false,
        deskIsLifeLook: false,
        sheet: "wave",
      }).kind,
      "puppet",
    );
  });

  it("wires one hard-cut image and does not add sheets, sleep.mp4, or kiss", () => {
    const logic = readFileSync(join(root, "src/lib/dance-fidget.ts"), "utf8");
    const app = readFileSync(join(root, "src/components/rai-app.tsx"), "utf8");
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    const stage = readFileSync(join(root, "src/components/presence-stage.tsx"), "utf8");
    const css = readFileSync(join(root, "src/styles.css"), "utf8");
    assert.match(app, /stageImageDriver\(/);
    assert.match(app, /danceHoldMs\(/);
    assert.match(app, /advanceDanceSheet\(/);
    assert.match(app, /lifeTrackPlaying\(/);
    assert.match(app, /dancePlayerFromSpotify\(/);
    assert.match(app, /playbackReported/);
    assert.match(app, /poseOnLifeStop\(/);
    assert.match(app, /danceShouldSnapIdle\(/);
    assert.match(puppet, /data-dance-fidget/);
    assert.match(puppet, /transition: "none"/);
    assert.match(css, /\.rai-rig\[data-dance\] > :not\(\[data-dance-fidget\]\)/);
    assert.match(stage, /danceSheet/);
    assert.doesNotMatch(`${logic}\n${puppet}`, /sleep\.mp4/);
    assert.doesNotMatch(logic, /\bkiss\b/);
    assert.match(app, /data-call-ended/);
    assert.match(app, /data-stale-build-notice/);
    assert.match(puppet, /welcome-wave/);
    const kinds = ["dance", "named", "desk", "idle", "puppet"] as const;
    for (const kind of kinds) {
      const hit = stageImageDriver({
        place: kind === "dance" || kind === "named" || kind === "desk" || kind === "idle" ? "life" : "chat",
        trackPlaying: kind === "dance" || kind === "named",
        namedPose: kind === "named" ? "peace" : null,
        idleSnap: kind === "idle",
        deskIsLifeLook: kind !== "idle",
        sheet: "laugh",
      });
      assert.equal(hit.kind, kind);
      assert.equal(Object.keys(hit).length <= 2, true);
    }
  });
});
