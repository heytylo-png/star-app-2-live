# Star Rai idle: offline RGBA cut

`public/rai/idle.png` and the baked blink frames `idle_blink_01..04` ship as true RGBA,
so the runtime studio-white punch (`src/lib/punch-white.ts`) is skipped for them
(`PRE_CUT_ALPHA_FILES` / `spriteNeedsWhitePunch` in `src/lib/rai.ts`).

Reproduce: `python3 scripts/cut-alpha.py`. When its output changes, bump `PRE_CUT_ALPHA_VERSION` in
`src/lib/rai.ts` (the five URLs carry `?v=<version>` so the service worker's cache-first copy is bypassed).

- `rgb-src/`: the RGB-on-white sources (01 is the old RGB `idle.png`, byte for byte). Never edited.
- `idle_alpha.png`: the one alpha mask, applied identically to all five frames.
- `pockets.png`: review map. Blue = white connected to the sheet edge (what the runtime already removed).
  Red = enclosed white pockets removed here (ahoge loop, leg gap, arm/body gaps, hand gap,
  shoe-edge slivers, gaps between the outer hair strands).
- `proof/`: before vs after over the stage beige, dark, mid-grey and a magenta check. BEFORE is the true live
  result: main's RGB idle.png (sha 2ce3f39…) run through the runtime `punchStudioWhite` itself (in node).

Rules: the white test is the runtime's own (min channel >= 238, chroma <= 18). It is not loosened.
Enclosed white that is part of her (shirt, collar, eye whites, skirt stripes, highlights) stays at alpha 255.
Edge pixels are un-mixed from the white matte: `a = (255 - L) / (255 - L_fg)`, `c = (O - (1 - a) * 255) / a`.
The antialias ramp only advances outward from the background, one pixel ring per step, so it cannot
leak sideways into a thin strand (that leak left see-through dots along the ahoge). Mid-grey tails of
the ramp next to a still-light edge pixel are un-mixed too (hair zone and shoe/floor edge only).
Below ~40% coverage the un-mix is noisy, so faint edge pixels take the nearest solid colour instead.
The floor shadow under the shoes becomes a smooth translucent dark shadow, un-mixed against the cut-off
white (luma 240) so its alpha rises from 0 where the background ends (no seam where the leg gap meets it).
A partly transparent pixel whose 4-neighbours are all opaque and that touches no transparent pixel is a
blend of two foreground colours and is set opaque (2 found: (650,354) hair/collar, (693,665) arm/shirt).

If the lids are ever repainted (`scripts/paint-blink-lids.py`), rebuild the RGB sources in `rgb-src/`
from that output first, then rerun `cut-alpha.py`.
