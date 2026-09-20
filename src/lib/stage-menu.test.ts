import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STAGE_MENU_ITEMS } from "./stage-menu.ts";

describe("stage menu IA", () => {
  it("has only Settings, Memory, and Call mute/voice", () => {
    assert.deepEqual(
      STAGE_MENU_ITEMS.map((item) => item.id),
      ["settings", "memory", "voice"],
    );
    assert.deepEqual(
      STAGE_MENU_ITEMS.map((item) => item.label),
      ["Settings and API key", "Memory and saved facts", "Call mute and voice"],
    );
  });

  it("does not put Chart or Life in the top dropdown", () => {
    const blob = STAGE_MENU_ITEMS.map((item) => `${item.id} ${item.label}`).join(" ").toLowerCase();
    assert.doesNotMatch(blob, /chart/);
    assert.doesNotMatch(blob, /life/);
  });
});
