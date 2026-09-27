# Star Rai idle: offline RGBA cut

`public/rai/idle.png` and the baked blink frames `idle_blink_01..04` ship as true RGBA,
so the runtime studio-white punch (`src/lib/punch-white.ts`) is skipped for them
(`PRE_CUT_ALPHA_FILES` / `spriteNeedsWhitePunch` in `src/lib/rai.ts`).

Reproduce: `python3 scripts/cut-alpha.py`

- `rgb-src/`: the RGB-on-white sources (01 is the old RGB `idle.png`, byte for byte). Never edited.
- `idle_alpha.png`: the one alpha mask, applied identically to all five frames.
- `pockets.png`: review map. Blue = white connected to the sheet edge (what the runtime already removed).
  Red = enclosed white pockets removed here (ahoge loop, leg gap, arm/body gaps, hand gap,
  shoe-edge slivers, gaps between the outer hair strands).
- `proof/`: before (live punch-white) vs after over the stage beige, dark, mid-grey and a magenta check.

Rules: the white test is the runtime's own (min channel >= 238, chroma <= 18). It is not loosened.
Enclosed white that is part of her (shirt, collar, eye whites, skirt stripes, highlights) stays at alpha 255.
Edge pixels are un-mixed from the white matte: `a = (255 - L) / (255 - L_fg)`, `c = (O - (1 - a) * 255) / a`.
The floor shadow under the shoes becomes a translucent dark shadow.

If the lids are ever repainted (`scripts/paint-blink-lids.py`), rebuild the RGB sources in `rgb-src/`
from that output first, then rerun `cut-alpha.py`.
