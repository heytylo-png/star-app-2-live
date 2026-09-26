# Baked full-frame idle blink pack (Star Rai)

Eyes-only rebake on the live `public/rai/idle.png` canvas (1008×1792).

Body pixels are locked. Hair, skirt, shoes, torso, bow, and hands match `idle.png`. Only the eyes change across the cycle. These are full baked sheets — no hole overlay, no DEST_RECT stamp, no tylo-holes paste, and no L/R oval composite.

`IDLE_BLINK_ENABLED` is false. Rest paints `public/rai/idle.png` only. Do not turn the flag on in this pack. TyLo FAIL: two PNGs up at once (a ghost body). The standing clip below is the art gate: one body, lids only, no ghost. Re-enable only when TyLo says pass. CoS alone is not enough.

**Pass 4 (current): the lids are painted directly on `idle.png`.** No pixels from the 807 reference video are copied, warped, resampled, or composited — that method is banned. 807 was only looked at to judge lid position (7s = half, 8s = shut) and lash curve/tilt. Each eye's old opening is traced as a smooth spline and rasterised at 16× supersampling, then box-filtered down, so every edge is antialiased (no column/row mask edges). Skin under the new lid is a screened-Poisson fill that is continuous with idle's own surrounding skin and relaxes to idle's local skin tone, with a light grain matched to idle's cheek. 02 and 03 paint skin above a smooth new lid-edge curve and paint idle's dark upper lash as one tapered stroke on that curve; the iris and sclera below the curve are idle's own pixels. 04 turns the whole opening into skin (no sclera, no iris, no old lid) and paints one tapered crescent lash per eye low in the opening. Hair strands that used to run into the old lash are tapered to a point over the new skin.

## Files
- `idle_blink_01_open.png` — byte copy of `public/rai/idle.png` (open glare). This is the hold.
- `idle_blink_02_closing.png` — light drop. Painted upper lid covers about a quarter of the iris; iris still readable.
- `idle_blink_03_half.png` — half close (807 7s used as position reference only). Painted lid edge crosses the iris at about half its height; lower iris and sclera are idle's.
- `idle_blink_04_closed.png` — shut (807 8s used as curve reference only). Whole opening painted as skin, one painted lash per eye. Sclera 0, iris 0.

The same four files are byte-copied into `public/rai/`. They are not the rest body while blink is parked.

The 807 stills in `artifacts/star-rai-blink-frames/source/` are reference only; the pass 4 painter does not read them.

## Eye box
Outside this box, max abs RGB delta versus `idle.png` is 0 on every frame:

`(x, y, w, h) = (420, 185, 210, 70)`

Nothing outside the eye box is rewritten.

## Cycle
`02 → 03 → 04 → 03 → 02` in **300ms** total (60ms a cut), then **hold 01**.

02 is in the close and in the open. Do not skip 02. Hard cuts on one `<img>` only. No stack. No dual PNG. Never opacity-blend two full sheets.

## Proof
- `proof_standing_full.gif` — standing full-body cycle. 01 holds, then `02 → 03 → 04 → 03 → 02` at 60ms (300ms), then hold 01 (1008×1792). Each frame is exactly one full sheet, hard-replaced onto a fresh canvas (disposal restores to background before the next frame, no transparency, no crossfade, no second body). One shared palette, no dither: outside the eye box, max abs RGB delta versus frame 01 is 0.
- `proof_eyes_strip.png` — 3× eye-box crop of 01, 02, 03, 04 side by side.
- `proof_standing_strip.png` — standing full body, idle | 01 | 02 | 03 | 04, plus a diff row versus `idle.png`. Each panel is one sheet. Red is any changed pixel. Hair, skirt, and shoes stay black on the diff row.
- `proof_strip.png` — idle | 01 | 02 | 03 | 04 face crops
- `proof_eyes.png` — eye-box crop of 01–04
- `proof_blink.gif` — earlier standing cycle at the same cuts

`idle_blink_01_open.png` is a byte copy of `public/rai/idle.png` in both `baked/` and `public/rai/`. A GIF palette is not those PNG bytes; compare the sheets, or the gif frames to each other, for the drift lock.

## Art gate

Runtime must hard-swap a single `<img>` / texture (no stack, no dual PNG). This proof is the art gate before re-enable. Blink stays parked until TyLo says pass. CoS alone is not enough. Do not flip the flag on from this pack.

Rebuild sheets: `python3 scripts/paint-blink-lids.py` (pass 4 painter; needs numpy, pillow, scipy). `scripts/rebake-eyes-only-blink.py` is the retired 807-paste method — do not use it.
