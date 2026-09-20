import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESENCE_MODES, usePresenceMode } from "./presence-mode.ts";

describe("presence mode", () => {
  it("ships PNG as the default body; Lab is an opt-in preview", () => {
    assert.deepEqual([...PRESENCE_MODES], ["png", "lab"]);
    assert.equal(usePresenceMode.getState().mode, "png");
  });
});
