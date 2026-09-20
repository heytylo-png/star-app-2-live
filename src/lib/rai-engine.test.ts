import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isPausedIdentityFlag, parseRaiEngine } from "./rai-engine.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("parseRaiEngine", () => {
  it("defaults to the PNG puppet", () => {
    assert.equal(parseRaiEngine(""), "png-puppet");
    assert.equal(parseRaiEngine("?chart=1"), "png-puppet");
    assert.equal(parseRaiEngine("?engine=png"), "png-puppet");
  });

  it("opts into the sample cutout only via spine/engine flags", () => {
    assert.equal(parseRaiEngine("?spine=1"), "spine");
    assert.equal(parseRaiEngine("?spine=true"), "spine");
    assert.equal(parseRaiEngine("?engine=spine"), "spine");
    assert.equal(parseRaiEngine("?engine=cutout"), "spine");
    assert.equal(parseRaiEngine("?cutout=1"), "spine");
  });

  it("opts into the Rai stub separately so missing layers can fall back", () => {
    assert.equal(parseRaiEngine("?spine=rai"), "spine-rai");
    assert.equal(parseRaiEngine("?engine=rai"), "spine-rai");
  });

  it("does not treat 3D Lab flags as a presence engine", () => {
    assert.equal(parseRaiEngine("?lab=1"), "png-puppet");
    assert.equal(parseRaiEngine("?3d=1"), "png-puppet");
    assert.equal(parseRaiEngine("?mesh=1"), "png-puppet");
    assert.equal(isPausedIdentityFlag("?lab=1"), true);
    assert.equal(isPausedIdentityFlag("?spine=1"), false);
  });
});

describe("track 2 docs and default bundle", () => {
  it("keeps Spine as primary and does not vendor Esoteric or Pixi", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(deps)) {
      assert.equal(/spine|pixi|dragonbones|rive-app/i.test(name), false, name);
    }
    const decision = readFileSync(join(root, "SPINE.md"), "utf8");
    assert.match(decision, /Primary: Spine/);
    assert.match(decision, /Essential/);
    assert.match(decision, /DragonBones/);
    assert.match(decision, /\?spine=1/);
    const animation = readFileSync(join(root, "ANIMATION.md"), "utf8");
    assert.match(animation, /Track 2/);
    assert.match(animation, /Track 3/);
    assert.match(animation, /public\/rive\/README/);
  });
});
