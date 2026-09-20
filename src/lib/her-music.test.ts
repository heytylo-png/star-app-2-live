import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adoptHeardTitle,
  applySuggestionGrokRaw,
  cleanTrackTitle,
  formatSuggestFactsBlock,
  HER_SEED_LISTS,
  mergeHerLists,
  parseSuggestionPayload,
  pickLocalSuggestions,
  seedFavoriteLists,
  shouldRefreshSuggestions,
} from "./her-music.ts";

describe("her favorite lists", () => {
  it("seeds named lists she owns — not a user playlist dump", () => {
    const lists = seedFavoriteLists();
    assert.ok(lists.length >= 2);
    assert.ok(lists.every((row) => row.name && row.tracks.length >= 3));
    assert.ok(lists.some((row) => row.id === "brat-hours"));
    assert.doesNotMatch(lists.map((r) => r.name).join(" "), /My Playlist|Liked Songs/i);
    for (const row of HER_SEED_LISTS) {
      assert.ok(row.tracks.every((t) => !t.startsWith("spotify:")));
    }
  });

  it("merges adopted titles onto her lists and caps them", () => {
    const start = seedFavoriteLists();
    const next = adoptHeardTitle(start, "NewJeans - Attention", "bratty");
    const brat = next.find((row) => row.id === "brat-hours");
    assert.ok(brat?.tracks.includes("NewJeans - Attention"));
    const again = adoptHeardTitle(next, "NewJeans - Super Shy", "bratty");
    const bratAgain = again.find((row) => row.id === "brat-hours");
    assert.equal(
      bratAgain?.tracks.filter((t) => t === "NewJeans - Super Shy").length,
      1,
    );
    assert.deepEqual(
      mergeHerLists(undefined).map((r) => r.id),
      seedFavoriteLists().map((r) => r.id),
    );
  });
});

describe("her suggestions", () => {
  it("picks local titles she already likes and skips the daily list", () => {
    const picks = pickLocalSuggestions({
      today: "2026-09-20",
      mood: "smug",
      avoid: ["NewJeans - Hype Boy"],
    });
    assert.ok(picks.length >= 1 && picks.length <= 3);
    assert.ok(picks.every((row) => row.title && row.source === "local"));
    assert.ok(!picks.some((row) => row.title === "NewJeans - Hype Boy"));
    assert.ok(picks.every((row) => cleanTrackTitle(row.title)));
  });

  it("keeps Grok suggestions when they are titles-only JSON", () => {
    const local = pickLocalSuggestions({ today: "2026-09-20", mood: "soft" });
    const grok = applySuggestionGrokRaw(
      '{"suggestions":[{"title":"IU - eight","note":"Soft. That\'s the point."}]}',
      local,
    );
    assert.equal(grok[0]?.title, "IU - eight");
    assert.equal(grok[0]?.source, "grok");
    const empty = applySuggestionGrokRaw("nope", local);
    assert.deepEqual(empty, local);
    assert.deepEqual(parseSuggestionPayload("not json"), []);
    assert.equal(cleanTrackTitle("spotify:track:abc"), undefined);
  });

  it("refreshes on session or the day's ask — not as a Chat track change", () => {
    assert.equal(shouldRefreshSuggestions({ today: "2026-09-20", sessionOn: true }), true);
    assert.equal(
      shouldRefreshSuggestions({ today: "2026-09-20", sessionOn: false, askedDate: "2026-09-20" }),
      true,
    );
    assert.equal(shouldRefreshSuggestions({ today: "2026-09-20", sessionOn: false }), false);
    const block = formatSuggestFactsBlock({
      today: "2026-09-20",
      life: { on: true, now_playing: "Super Shy", mood_tag: "smug" },
      lists: seedFavoriteLists(),
    });
    assert.match(block, /^LIFE$/m);
    assert.match(block, /ask: suggest/);
    assert.match(block, /Titles only/);
    assert.doesNotMatch(block, /spotify:playlist/);
  });
});
