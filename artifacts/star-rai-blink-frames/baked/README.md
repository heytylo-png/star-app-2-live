# Baked full-frame idle blink pack (Star Rai)

Eyes-only rebake on the live `public/rai/idle.png` canvas (1008×1792).

Body pixels are locked. Hair, skirt, shoes, torso, bow, and hands match `idle.png`. Only the eyes change across the cycle. These are full baked sheets — no hole overlay, no DEST_RECT stamp, no tylo-holes paste, and no L/R oval composite.

`IDLE_BLINK_ENABLED` is false. Rest paints `public/rai/idle.png` only. Do not turn the flag on in this pack. TyLo FAIL: two PNGs up at once (a ghost body). The standing clip below is the art gate: one body, lids only, no ghost. Re-enable only when TyLo says pass. CoS alone is not enough.

## Files
- `idle_blink_01_open.png` — byte copy of `public/rai/idle.png` (open glare)
- `idle_blink_02_closing.png` — lids starting down
- `idle_blink_03_half.png` — mid lids
- `idle_blink_04_closed.png` — lids closed

The same four files are byte-copied into `public/rai/`. They are not the rest body while blink is parked.

## Eye box
Outside this box, max abs RGB delta versus `idle.png` is 0 on every frame:

`(x, y, w, h) = (420, 185, 210, 70)`

Lid paint is taken from the TyLo v2 eye-band art and composited only inside the idle eye sockets. The sockets sit inside that box. Nothing outside it is rewritten.

## Cycle
`01 → 02 → 03 → 04 → 03 → 02 → 01`

02 closing is in the close and in the open. Do not skip 02. Hard cuts only. Never opacity-blend two full sheets.

## Proof
- `proof_standing_full.gif` — standing full-body cycle `01 → 02 → 03 → 04 → 03 → 02 → 01` (1008×1792). Each frame is exactly one full sheet, hard-replaced onto a fresh canvas (disposal restores to background before the next frame, no transparency, no crossfade, no second body). Review holds so 02 reads. One shared palette, no dither: outside the eye box, max abs RGB delta versus frame 01 is 0.
- `proof_standing_strip.png` — standing full body, idle | 01 | 02 | 03 | 04, plus a diff row versus `idle.png`. Each panel is one sheet. Red is any changed pixel. Hair, skirt, and shoes stay black on the diff row.
- `proof_strip.png` — idle | 01 | 02 | 03 | 04 face crops
- `proof_eyes.png` — eye-box crop of 01–04
- `proof_blink.gif` — earlier standing cycle at 120ms per step

`idle_blink_01_open.png` is a byte copy of `public/rai/idle.png` in both `baked/` and `public/rai/`. A GIF palette is not those PNG bytes; compare the sheets, or the gif frames to each other, for the drift lock.

## Art gate

Runtime must hard-swap a single `<img>` / texture (no dual-layer opacity). This proof is the art gate before re-enable. Blink stays parked until TyLo says pass. CoS alone is not enough. Do not flip the flag on from this pack.

Rebuild sheets: `python3 scripts/rebake-eyes-only-blink.py`
Refresh the standing proof from the locked sheets (does not re-encode 02–04): `python3 scripts/rebake-eyes-only-blink.py --proof-only`
