import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

function readToken(name: string): number {
  const match = css.match(new RegExp(`${name}:\\s*([0-9.]+)`));
  assert.ok(match, `missing ${name} in styles.css`);
  return Number(match[1]);
}

describe("PNG puppet long shot", () => {
  it("keeps crown-zoom in long-shot range (not PR #19 bust / PR #17 mid-shot)", () => {
    const shot = readToken("--rai-long-shot");
    const phone = readToken("--rai-long-shot-phone");
    const tall = readToken("--rai-long-shot-tall");
    // Full-body: scale the contained sheet a little, never into mid-shot (1.36+) or bust (1.64+).
    for (const n of [shot, phone, tall]) {
      assert.ok(n >= 1, `long-shot scale ${n} would shrink below the sheet`);
      assert.ok(n <= 1.28, `long-shot scale ${n} is a mid-shot/bust`);
    }
    assert.ok(phone >= shot, "phone can be slightly tighter than desktop");
    assert.ok(tall <= shot, "tall desktops pull back further");
    assert.doesNotMatch(css, /scale\(1\.(5|6|7|8|9)/);
  });

  it("zooms from the crown so ahoge is not cropped", () => {
    assert.match(css, /transform-origin:\s*50%\s*0%/);
    assert.match(css, /object-position:\s*50%\s*0%/);
    assert.doesNotMatch(css, /\.rai-layer[\s\S]*?top:\s*1\.85rem/);
    assert.doesNotMatch(css, /\.rai-layer[\s\S]*?top:\s*2\.15rem/);
  });

  it("keeps Helix beige and does not restore a white plate", () => {
    assert.match(css, /--color-bg:\s*#efece6/);
    assert.match(css, /--color-stage:\s*#efece6/);
    assert.doesNotMatch(css, /mix-blend-mode:\s*multiply/);
    assert.doesNotMatch(css, /#ffffff_0%/);
    assert.doesNotMatch(css, /\.rai-stage-wash/);
  });
});
