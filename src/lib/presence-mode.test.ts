import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESENCE_MODES, usePresenceMode, LAB_WIP_STILLS, labWipPosePin } from "./presence-mode.ts";

describe("presence mode", () => {
  it("ships PNG as the default body; Lab is an opt-in preview", () => {
    assert.deepEqual([...PRESENCE_MODES], ["png", "lab"]);
    assert.equal(usePresenceMode.getState().mode, "png");
  });

  it("pins Lab mood stills from ?wip= and never includes kiss", () => {
    assert.deepEqual([...LAB_WIP_STILLS], ["idle", "talk", "wave", "scold", "pout", "shy"]);
    assert.equal(LAB_WIP_STILLS.includes("kiss" as never), false);
    assert.equal(labWipPosePin(), null);
  });
});
