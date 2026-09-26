# TyLo four-hole soft-blink pack (Star Rai)

Wire source: `artifacts/star-rai-blink-frames/tylo-holes-v2/`

No runtime wire in this pack. Starai wires separately. Do **not** wire the old `tylo-holes/` three-frame pack, L/R ovals, or `eyes/`.

Source plates (TyLo Photos, ~1281×1546 white-bg):
- `../source/790.jpg` — open-brow
- `../source/788.jpg` — open
- `../source/791.jpg` — half
- `../source/789.jpg` — closed

Body: `public/rai/idle.png` (1008×1792) — never unloaded / no full-sheet swap.

## DEST_RECT

On `public/rai/idle.png` (1008×1792):

`(x, y, w, h) = (424, 193, 196, 57)`

Paste each opaque **196×57** patch at `(424, 193)`. Same rect every frame.

## Cycle

`790-open-brow → 788-open → 791-half → 789-closed → reverse`

About **2 frames each** at runtime (forward, then reverse through half and open back to open-brow).

## Method

white-knockout → alpha registered to painted sockets (no whole-plate downscale stamp).

1. Flood-fill white-knockout from plate borders → RGBA at full plate res (keeps sclera + iris highlights). Soft peach wash far from features dropped. Refs: `source-alpha/` (not shipped in this folder).
2. Register eye-pair → idle iris centers (translate + uniform scale). Open/brow: own iris distance → idle (105.8px). Half/closed: reuse open (788) scale. **No whole-plate stamp.**
3. Crop to SAME DEST_RECT; clean pale downscale fringe around dark strokes.
4. Bake opaque RGB from idle dest crop: skin-underpaint painted eye almonds (kills idle ghost iris), alpha-composite drawn eyes/lids/brows, restore idle bangs on top.
5. Outside DEST: idle delta 0. Body stays `idle.png`.

## Files

- `790-open-brow.png`, `788-open.png`, `791-half.png`, `789-closed.png` (opaque 196×57)
- `dest_rect_overlay.png`, `proof_strip.png`, `proof_dest_band.png`, `proof_blink.gif`

## QA — outside_dest_delta_max

- 790-open-brow: 0 (bang_err=0, changed≈52.4%, amber_px=901)
- 788-open: 0 (bang_err=0, changed≈45.2%, amber_px=427)
- 791-half: 0 (bang_err=0, changed≈50.4%, amber_px=84)
- 789-closed: 0 (bang_err=0, changed≈49.0%, amber_px=59)

Body stays idle.png. Named poses do not blink; cancel mid-blink on pose/talk/tint; prefers-reduced-motion disables blink.
