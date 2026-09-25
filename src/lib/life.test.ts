import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { composeAct } from "./brain.ts";
import { composeGrokSystem, formatMemoryFacts, extractSlotsFromUserText, applySlotPatch } from "./memory-slots.ts";
import { LIFE_V1_SOURCE, RAI_SYSTEM } from "./generated/star-rai-artifacts.ts";
import {
  LIFE_TINT_POSES,
  PLAYLIST_MAX,
  PLAYLIST_MIN,
  actForLifeTurn,
  applyLifePatch,
  extractLifePatch,
  formatLifeFactsBlock,
  formatLifeMemoryLines,
  herDailyMoodPatch,
  isListeningAsk,
  isLifeStop,
  isSuggestAsk,
  resolveHerDailyMood,
  parseArtistTitle,
  parseTrackTitle,
  playlistForPrompt,
  resolveLifeTurn,
  type LifeSlots,
} from "./life.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Life v1 artifact", () => {
  it("matches artifacts/star-life-one-pager.txt exactly", () => {
    const disk = readFileSync(join(root, "artifacts/star-life-one-pager.txt"), "utf8");
    assert.equal(LIFE_V1_SOURCE, disk);
    assert.match(LIFE_V1_SOURCE, /STAR RAI — LIFE v1/);
    assert.match(LIFE_V1_SOURCE, /session_on/);
    assert.match(LIFE_V1_SOURCE, /daily_playlist/);
    assert.match(LIFE_V1_SOURCE, /Never block Chat on a music login/);
    assert.match(LIFE_V1_SOURCE, /VITE_SPOTIFY_CLIENT_ID/);
    assert.match(LIFE_V1_SOURCE, /Premium required for Web Playback/);
    assert.match(LIFE_V1_SOURCE, /Steal Chart/);
    assert.match(LIFE_V1_SOURCE, /HERS for the local day/);
    assert.match(LIFE_V1_SOURCE, /Play suggestion/);
    assert.match(LIFE_V1_SOURCE, /favorite lists/);
  });

  it("does not change the voice card output contract", () => {
    assert.match(RAI_SYSTEM, /\{"line":/);
    assert.match(RAI_SYSTEM, /LORE USE/);
    assert.match(LIFE_V1_SOURCE, /\{"line","emotion","pose"\}/);
  });
});

describe("track parse", () => {
  it("names a track from listening language and paste shapes", () => {
    assert.equal(parseTrackTitle("I'm listening to Super Shy."), "Super Shy");
    assert.equal(parseTrackTitle(' "ETA" '), "ETA");
    assert.equal(parseArtistTitle("NewJeans - Super Shy"), "NewJeans - Super Shy");
    assert.equal(parseTrackTitle("NewJeans - Super Shy"), "NewJeans - Super Shy");
    assert.equal(parseTrackTitle("now playing Cool With You"), "Cool With You");
    assert.equal(parseTrackTitle("put on How Sweet"), "How Sweet");
  });

  it("does not invent a title from greetings, poses, or Chart asks", () => {
    assert.equal(parseTrackTitle("Hey. Just got here."), undefined);
    assert.equal(parseTrackTitle("wave"), undefined);
    assert.equal(parseTrackTitle("kiss"), undefined);
    assert.equal(parseTrackTitle("what's your sign"), undefined);
    assert.equal(parseTrackTitle("write your diary"), undefined);
    assert.equal(parseTrackTitle("I'm tired."), undefined);
  });

  it("forced affordance accepts a pasted title", () => {
    assert.equal(parseTrackTitle("Super Shy", { forced: true }), "Super Shy");
  });
});

describe("session + playlist", () => {
  it("starts session_on from a named track and ends cleanly on stop", () => {
    const on = extractLifePatch("I'm listening to Super Shy.");
    assert.equal(on?.on, true);
    assert.equal(on?.now_playing, "Super Shy");
    const merged = applyLifePatch(undefined, on);
    assert.equal(merged?.on, true);
    assert.deepEqual(merged?.daily_playlist, ["Super Shy"]);

    const off = extractLifePatch("stop listening", merged);
    assert.equal(off?.on, false);
    const after = applyLifePatch(merged, off);
    assert.equal(after?.on, false);
    assert.deepEqual(after?.daily_playlist, ["Super Shy"]);
    assert.equal(after?.now_playing, undefined);
  });

  it("accumulates unique titles and caps at 8", () => {
    const titles = [
      "Super Shy",
      "ETA",
      "Cool With You",
      "How Sweet",
      "Hype Boy",
      "Attention",
      "Ditto",
      "OMG",
      "ASAP",
    ];
    let life: LifeSlots | undefined;
    for (const title of titles) {
      life = applyLifePatch(life, extractLifePatch(`I'm listening to ${title}.`, life));
    }
    assert.equal(life?.daily_playlist?.length, PLAYLIST_MAX);
    assert.equal(life?.daily_playlist?.[0], "ETA");
    assert.equal(life?.daily_playlist?.at(-1), "ASAP");
    assert.ok((life?.daily_playlist?.length ?? 0) >= PLAYLIST_MIN);
  });

  it("does not let the user pick her mood tag from chat", () => {
    const a = extractLifePatch("I'm listening to Super Shy. vibe is smug");
    assert.equal(a?.now_playing, "Super Shy");
    assert.equal(a?.mood_tag, undefined);
    const b = extractLifePatch("mood tag is cozy", { on: true, now_playing: "Super Shy" });
    assert.equal(b?.mood_tag, undefined);
  });
});

describe("Life turns", () => {
  it("answers what-are-you-listening-to with one beat when something exists", () => {
    assert.equal(isListeningAsk("what are you listening to"), true);
    const hit = resolveLifeTurn({
      userText: "what are you listening to",
      after: { on: true, now_playing: "Super Shy" },
    });
    assert.equal(hit.kind, "ask_listening");
    assert.equal(hit.localOnly, true);
    assert.match(actForLifeTurn(hit)!.line, /Super Shy/);
    assert.doesNotMatch(actForLifeTurn(hit)!.line, /setlist|concert tour/i);

    const listOnly = resolveLifeTurn({
      userText: "what's playing",
      after: { on: false, daily_playlist: ["Super Shy", "ETA"] },
    });
    assert.equal(listOnly.kind, "ask_listening");
    assert.match(actForLifeTurn(listOnly)!.line, /Not a setlist/);
  });

  it("does not invent a concert when nothing is on", () => {
    const empty = resolveLifeTurn({ userText: "what are you listening to", after: undefined });
    assert.equal(empty.kind, "ask_empty");
    assert.equal(empty.localOnly, true);
    assert.match(actForLifeTurn(empty)!.line, /Nothing's on/);
    assert.match(actForLifeTurn(empty)!.line, /not inventing a concert/i);
  });

  it("comments once per track change and not again on the same track", () => {
    const first = resolveLifeTurn({
      userText: "I'm listening to Super Shy.",
      before: undefined,
      after: { on: true, now_playing: "Super Shy" },
    });
    assert.equal(first.kind, "track_change");
    assert.equal(first.localOnly, false);
    assert.ok(first.factsBlock);
    assert.match(first.factsBlock!, /^LIFE$/m);
    assert.match(first.factsBlock!, /^now_playing: Super Shy$/m);
    assert.match(first.factsBlock!, /One comment on this track change/);
    assert.ok(["talk", "content", "smug"].includes(first.tintPose!));
    assert.notEqual(first.tintPose, "idle");
    assert.notEqual(first.tintPose, "tired");
    assert.notEqual(first.tintPose, "wave");

    const same = resolveLifeTurn({
      userText: "still here",
      before: { on: true, now_playing: "Super Shy", commented_track: "Super Shy" },
      after: { on: true, now_playing: "Super Shy", commented_track: "Super Shy" },
    });
    assert.equal(same.kind, "none");
    assert.equal(same.factsBlock, undefined);

    const next = resolveLifeTurn({
      userText: "I'm listening to ETA.",
      before: { on: true, now_playing: "Super Shy", commented_track: "Super Shy" },
      after: { on: true, now_playing: "ETA", commented_track: "Super Shy" },
    });
    assert.equal(next.kind, "track_change");
    assert.match(next.factsBlock ?? "", /now_playing: ETA/);
  });

  it("does not make music the topic on a morning greeting", () => {
    const morning = resolveLifeTurn({
      userText: "good morning",
      before: {
        on: true,
        now_playing: "Super Shy",
        daily_playlist: ["Super Shy", "ETA", "Cool With You", "How Sweet"],
        commented_track: "Super Shy",
      },
      after: {
        on: true,
        now_playing: "Super Shy",
        daily_playlist: ["Super Shy", "ETA", "Cool With You", "How Sweet"],
        commented_track: "Super Shy",
      },
    });
    assert.equal(morning.kind, "none");
    assert.equal(morning.factsBlock, undefined);
  });

  it("does not steal Chart diary or bio asks", () => {
    const diary = resolveLifeTurn({
      userText: "write your diary",
      after: { on: true, now_playing: "Super Shy" },
    });
    assert.equal(diary.kind, "none");
    const sign = resolveLifeTurn({
      userText: "what's your sign",
      after: { on: true, now_playing: "Super Shy" },
    });
    assert.equal(sign.kind, "none");
  });

  it("suggest ask is local and not a track change", () => {
    assert.equal(isSuggestAsk("suggest a song"), true);
    assert.equal(isSuggestAsk("what should we play"), true);
    assert.equal(isSuggestAsk("what are you listening to"), false);
    const turn = resolveLifeTurn({
      userText: "suggest a song",
      after: { on: true, now_playing: "Super Shy", mood_tag: "smug" },
      suggestion: "NewJeans - ETA",
    });
    assert.equal(turn.kind, "suggest");
    assert.equal(turn.localOnly, true);
    assert.equal(turn.factsBlock, undefined);
    assert.match(actForLifeTurn(turn)!.line, /ETA/);
    assert.doesNotMatch(actForLifeTurn(turn)!.line, /setlist|concert/i);
  });

  it("locks her daily mood once from clock/sky and keeps it", () => {
    const first = resolveHerDailyMood({
      today: "2026-09-20",
      band: "afternoon",
      sky: { moonPhase: "First Quarter" },
    });
    assert.ok(["bratty", "smug", "tired", "soft"].includes(first.mood_tag));
    assert.equal(first.alreadySet, false);
    const again = resolveHerDailyMood({
      today: "2026-09-20",
      current: { on: true, mood_tag: first.mood_tag, mood_date: "2026-09-20" },
      band: "night",
    });
    assert.equal(again.alreadySet, true);
    assert.equal(again.mood_tag, first.mood_tag);
    const nextDay = resolveHerDailyMood({
      today: "2026-09-21",
      current: { on: true, mood_tag: first.mood_tag, mood_date: "2026-09-20" },
      band: "night",
    });
    assert.equal(nextDay.alreadySet, false);
    assert.equal(nextDay.mood_date, "2026-09-21");
    const patch = herDailyMoodPatch({
      life: { on: false, mood_tag: first.mood_tag, mood_date: "2026-09-20" },
      today: "2026-09-20",
      band: "morning",
    });
    assert.equal(patch, undefined);
  });

  it("keeps her mood locally after the session stops", () => {
    const on = applyLifePatch(undefined, {
      on: true,
      now_playing: "Super Shy",
      mood_tag: "soft",
      mood_date: "2026-09-20",
    });
    const after = applyLifePatch(on, { on: false });
    assert.equal(after?.on, false);
    assert.equal(after?.mood_tag, "soft");
    assert.equal(after?.mood_date, "2026-09-20");
    assert.deepEqual(after?.daily_playlist, ["Super Shy"]);
  });

  it("stops the session without a music login", () => {
    assert.equal(isLifeStop("stop listening"), true);
    const stop = resolveLifeTurn({
      userText: "stop listening",
      before: { on: true, now_playing: "Super Shy" },
      after: { on: false, daily_playlist: ["Super Shy"] },
    });
    assert.equal(stop.kind, "session_stop");
    assert.match(actForLifeTurn(stop)!.line, /Music's off/);
  });
});

describe("Grok request composition — session on vs off", () => {
  it("session on: MEMORY FACTS include Life keys; track change appends LIFE", () => {
    const playlist = ["Super Shy", "ETA", "Cool With You", "How Sweet"];
    const facts = formatMemoryFacts({
      name: "Tylo",
      last_topic: "night talking",
      life: { on: true, now_playing: "Super Shy", mood_tag: "smug", daily_playlist: playlist },
    });
    assert.match(facts, /^MEMORY FACTS\n/);
    assert.match(facts, /^session_on: true$/m);
    assert.match(facts, /^now_playing: Super Shy$/m);
    assert.match(facts, /^mood_tag: smug$/m);
    assert.match(facts, /^daily_playlist: Super Shy · ETA · Cool With You · How Sweet$/m);
    assert.doesNotMatch(facts, /Fukuoka|Libra|her_sun|user_rising/);

    const life = formatLifeFactsBlock({ nowPlaying: "Super Shy", moodTag: "smug" });
    const extra = `${facts}\n\n${life}`;
    const system = composeGrokSystem(RAI_SYSTEM, extra);
    assert.ok(system.startsWith(RAI_SYSTEM));
    assert.match(system, /^LIFE\nsession_on: true\nnow_playing: Super Shy\nmood_tag: smug$/m);
    assert.match(system, /One comment on this track change/);
    assert.doesNotMatch(life, /Fukuoka|Libra|ETA|How Sweet/);
    assert.match(life, /Do not recite daily_playlist/);
    assert.equal(playlistForPrompt(["a", "b", "c"]), undefined);
    assert.ok(playlistForPrompt(playlist));
  });

  it("session off: standing Life keys are omitted even if playlist is stored", () => {
    const facts = formatMemoryFacts({
      name: "Tylo",
      life: {
        on: false,
        daily_playlist: ["Super Shy", "ETA", "Cool With You", "How Sweet"],
      },
    });
    assert.match(facts, /^name: Tylo$/m);
    assert.doesNotMatch(facts, /session_on|now_playing|daily_playlist|mood_tag|^LIFE$/m);
    const system = composeGrokSystem(RAI_SYSTEM, facts);
    assert.ok(system.startsWith(RAI_SYSTEM));
    assert.doesNotMatch(system.slice(RAI_SYSTEM.length), /session_on|now_playing|LIFE/);
    assert.deepEqual(formatLifeMemoryLines({ on: false, daily_playlist: ["Super Shy"] }), []);
  });

  it("does not dump playlist into a spoken local line", () => {
    const act = composeAct(
      [{ role: "user", content: "what are you listening to" }],
      "",
      "idle",
      undefined,
      {
        kind: "ask_listening",
        localOnly: true,
        nowPlaying: "Super Shy",
        playlist: ["Super Shy", "ETA", "Cool With You", "How Sweet"],
        tintPose: "talk",
      },
    );
    assert.match(act.line, /Super Shy/);
    assert.doesNotMatch(act.line, /ETA|Cool With You|How Sweet|1\.|2\./);
    assert.equal(act.pose, "talk");
  });

  it("Music Set is talk, content, or smug even when her mood is tired", () => {
    const titles = ["Super Shy", "ETA", "Pink + White", "Good Days", "Snooze", "Getaway"];
    const seen = new Set<string>();
    for (const title of titles) {
      const turn = resolveLifeTurn({
        userText: `I'm listening to ${title}.`,
        before: { on: true },
        after: { on: true, now_playing: title, mood_tag: "tired" },
      });
      assert.equal(turn.kind, "track_change");
      assert.ok(turn.tintPose === "talk" || turn.tintPose === "content" || turn.tintPose === "smug");
      const act = composeAct(
        [{ role: "user", content: `I'm listening to ${title}.` }],
        "",
        "idle",
        undefined,
        turn,
      );
      assert.ok(act.pose === "talk" || act.pose === "content" || act.pose === "smug");
      assert.notEqual(act.pose, "idle");
      assert.notEqual(act.pose, "tired");
      assert.notEqual(act.pose, "shy");
      seen.add(act.pose!);
    }
    assert.ok(seen.size >= 1);
  });

  it("does not let Super Shy steal the track-change sheet", () => {
    const act = composeAct(
      [{ role: "user", content: "I'm listening to Super Shy." }],
      "",
      "idle",
      undefined,
      {
        kind: "track_change",
        localOnly: false,
        nowPlaying: "Super Shy",
        tintPose: "content",
      },
    );
    assert.equal(act.pose, "content");
    assert.notEqual(act.pose, "shy");
    assert.notEqual(act.pose, "idle");
    assert.match(act.line, /Super Shy/);
  });

  it("Chart diary still wins over Life on the same user line", () => {
    const act = composeAct(
      [{ role: "user", content: "write your diary" }],
      "",
      "idle",
      { kind: "diary", localOnly: true, diaryText: "Quiet page for today. Short day. Still here." },
      { kind: "ask_listening", localOnly: true, nowPlaying: "Super Shy", tintPose: "talk" },
    );
    assert.match(act.line, /Quiet page/);
    assert.doesNotMatch(act.line, /Super Shy/);
  });
});

describe("slots ingest", () => {
  it("wires named tracks through extractSlotsFromUserText", () => {
    const patch = extractSlotsFromUserText("I'm listening to Super Shy.");
    assert.equal(patch.life?.on, true);
    assert.equal(patch.life?.now_playing, "Super Shy");
    const kept = applySlotPatch({}, patch);
    const stopped = applySlotPatch(kept, extractSlotsFromUserText("stop listening", {}, kept));
    assert.equal(stopped.life?.on, false);
    assert.deepEqual(stopped.life?.daily_playlist, ["Super Shy"]);
    const facts = formatMemoryFacts(stopped);
    assert.doesNotMatch(facts, /session_on|now_playing|daily_playlist/);
  });
});
