import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeAct } from "./brain.ts";

describe("composeAct pose catalog", () => {
  it("waves on a greeting", () => {
    const act = composeAct([{ role: "user", content: "Hey. Just got here." }]);
    assert.equal(act.pose, "wave");
    assert.equal(act.emotion, "hype");
    assert.ok(!/kiss/i.test(act.line));
  });

  it("scolds a bump", () => {
    const act = composeAct([
      { role: "user", content: "Sorry — I wasn't watching where I was going." },
    ]);
    assert.equal(act.pose, "scold");
    assert.equal(act.emotion, "bratty");
  });

  it("turns away on goodbye", () => {
    const act = composeAct([{ role: "user", content: "Gotta go. Bye." }]);
    assert.equal(act.pose, "turn");
  });

  it("never picks kiss on flirt", () => {
    for (let i = 0; i < 12; i++) {
      const act = composeAct([{ role: "user", content: "You're cute." }]);
      assert.notEqual(act.pose, "kiss");
      assert.ok(act.pose === "wink" || act.pose === "hearts");
    }
  });

  it("honors an explicit named pose", () => {
    const wink = composeAct([{ role: "user", content: "wink" }]);
    assert.equal(wink.pose, "wink");
    const peace = composeAct([{ role: "user", content: "do a peace sign" }]);
    assert.equal(peace.pose, "peace");
  });

  it("thinks on identity questions", () => {
    const act = composeAct([{ role: "user", content: "Who are you supposed to be?" }]);
    assert.equal(act.pose, "think");
    assert.equal(act.emotion, "glance");
  });
});
