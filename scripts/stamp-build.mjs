#!/usr/bin/env node
/**
 * Stamp a production build with the commit it was built from, the way every
 * gh-pages publish is stamped:
 *   - index.html            <meta name="star-rai-build" content="<sha>"> + ?v=<sha> on the bundles
 *   - manifest.webmanifest  start_url ends in ?v=<sha>
 *   - sw.js                 cache name star-rai-shell-<sha>
 *   - .nojekyll             so Pages serves the files as they are
 * src/lib/app-update.ts reads the meta stamp to notice a new deploy.
 *
 * Usage: node scripts/stamp-build.mjs <short-sha> [dist-dir]
 */
import fs from "node:fs";
import path from "node:path";

const [sha, distArg = "dist"] = process.argv.slice(2);
if (!sha || !/^[0-9a-f]{7,40}$/.test(sha)) {
  console.error("usage: node scripts/stamp-build.mjs <short-sha> [dist-dir]");
  process.exit(1);
}
const dist = path.resolve(distArg);

/** Planned edits: every pattern is checked before any file is written, so a failure leaves dist untouched. */
const edits = [
  ["index.html", /<meta charset="UTF-8" \/>/g, `<meta charset="UTF-8" />\n    <meta name="star-rai-build" content="${sha}" />`, 1],
  ["index.html", /((?:src|href)="\/star-app-2-live\/assets\/index-[^"?]+\.(?:js|css))"/g, `$1?v=${sha}"`, 2],
  ["manifest.webmanifest", /"start_url": "\/star-app-2-live\/"/g, `"start_url": "/star-app-2-live/?v=${sha}"`, 1],
  ["sw.js", /const CACHE = "star-rai-shell-[^"]+";/g, `const CACHE = "star-rai-shell-${sha}";`, 1],
];

const files = new Map();
const read = (file) => {
  if (!files.has(file)) files.set(file, fs.readFileSync(path.join(dist, file), "utf8"));
  return files.get(file);
};

if (/<meta name="star-rai-build"/.test(read("index.html"))) {
  console.error("index.html is already stamped; run `npm run build` again before stamping.");
  process.exit(1);
}

for (const [file, pattern, replacement, expected] of edits) {
  const source = read(file);
  const count = (source.match(pattern) ?? []).length;
  if (count !== expected) {
    console.error(`${file}: expected ${expected} match(es) of ${pattern}, found ${count}. Nothing was written.`);
    process.exit(1);
  }
  files.set(file, source.replace(pattern, replacement));
}

for (const [file, source] of files) fs.writeFileSync(path.join(dist, file), source);
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

console.log(`stamped ${path.relative(process.cwd(), dist) || "."} as ${sha}`);
