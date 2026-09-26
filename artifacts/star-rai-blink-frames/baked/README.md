# Baked full-frame idle blink pack (Star Rai)

Eyes-only rebake on the live `public/rai/idle.png` canvas (1008×1792).

Body pixels are locked. Hair, skirt, shoes, torso, bow, and hands match `idle.png`. Only the eyes change across the cycle. These are full baked sheets — no hole overlay, no DEST_RECT stamp, no tylo-holes paste, and no L/R oval composite at runtime.

`IDLE_BLINK_ENABLED` is **false**. Rest stays on `public/rai/idle.png` until `proof_standing_full.gif` (standing full body, not an eye crop) PASSes. The sheets are locked and not mounted.

## Files
- `idle_blink_01_open.png` — byte copy of `public/rai/idle.png` (open glare)
- `idle_blink_02_closing.png` — lids starting down
- `idle_blink_03_half.png` — mid lids
- `idle_blink_04_closed.png` — lids closed

The same four files are byte-copied into `public/rai/`.

## Eye box
Outside this box, max abs RGB delta versus `idle.png` is 0 on every frame:

`(x, y, w, h) = (420, 185, 210, 70)`

Lid paint is taken from the TyLo v2 eye-band art and composited only inside the idle eye sockets. The sockets sit inside that box. Nothing outside it is rewritten.

## Cycle
`01 → 02 → 03 → 04 → 03 → 02 → 01`

02 closing is in the close and in the open. Do not skip it. The app swaps these full frames with a hard cut when the flag is on. Do not add a hole overlay or DEST_RECT. While the flag is off, none of these sheets mount; rest is `idle.png`.

## Proof
- `proof_standing_full.gif` — standing full-body cycle `01 → 02 → 03 → 04 → 03 → 02 → 01` (1008×1792). Review holds so 02 reads. One shared palette, no dither: outside the eye box, max abs RGB delta versus frame 01 is 0.
- `proof_standing_strip.png` — standing full body, idle | 01 | 02 | 03 | 04, plus a diff row versus `idle.png`. Red is any changed pixel. Hair, skirt, and shoes stay black on the diff row.
- `proof_strip.png` — idle | 01 | 02 | 03 | 04 face crops
- `proof_eyes.png` — eye-box crop of 01–04
- `proof_blink.gif` — earlier standing cycle at 120ms per step

`idle_blink_01_open.png` is a byte copy of `public/rai/idle.png` in both `baked/` and `public/rai/`. A GIF palette is not those PNG bytes; compare the sheets, or the gif frames to each other, for the drift lock.

Rebuild sheets: `python3 scripts/rebake-eyes-only-blink.py`
Refresh the standing proof from the locked sheets (does not re-encode 02–04): `python3 scripts/rebake-eyes-only-blink.py --proof-only`
