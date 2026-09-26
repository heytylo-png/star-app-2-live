# Baked full-frame idle blink pack (Star Rai)

Eyes-only rebake on the live `public/rai/idle.png` canvas (1008×1792).

Body pixels are locked. Hair, skirt, shoes, torso, bow, and hands match `idle.png`. Only the eyes change across the cycle. These are full baked sheets — no hole overlay, no DEST_RECT stamp, no tylo-holes paste, and no L/R oval composite at runtime.

`IDLE_BLINK_ENABLED` stays false. Starai holds the re-enable wire until CoS PASS on the standing clip.

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

Re-enable is held. Do not flip `IDLE_BLINK_ENABLED` in this pack.

## Proof
- `proof_strip.png` — idle | 01 | 02 | 03 | 04 face crops
- `proof_eyes.png` — eye-box crop of 01–04
- `proof_blink.gif` — standing cycle `01 → 02 → 03 → 04 → 03 → 02 → 01` (shared palette, no dither, so the body does not shimmer)

Rebuild: `python3 scripts/rebake-eyes-only-blink.py`
