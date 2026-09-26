# TyLo soft-blink hole pack (scrap 790)

Source plates (user drop; scrap 790 / `01-open-brow`):
- `source-holes/02-open.jpg` (788)
- `source-holes/03-half.jpg` (791)
- `source-holes/04-closed.jpg` (789)

## DEST_RECT on `public/rai/idle.png` (1008×1792)
`(x, y, w, h) = (424, 193, 196, 57)`

Paste each opaque patch at `(424, 193)`:
- `02-open.png` (196×57)
- `03-half.png` (196×57)
- `04-closed.png` (196×57)

## Cycle
`02-open → 03-half → 04-closed → reverse` (788 → 791 → 789 → reverse)

## Method
1. White-knockout the three JPGs.
2. Register eye-pair centers to idle irises.
3. ONE dest rect covering both eye almonds (clamped under bangs).
4. Skin-fill eye sockets only (hair excluded), then composite drawn eyes.
5. Bake opaque dest patches. Outside dest, idle pixels unchanged (delta 0).
6. Body stays `idle.png` — never unload / no full-sheet swap / no white box.

## Proof
- `proof_strip.png` — idle | open | half | closed face crops
- `proof_dest_band.png` — dest-rect band only
- `proof_blink.gif` — step cycle
- `qa_compare.png` — dest rect overlay QA
- `dest_rect_on_idle.png` — rect on idle face

## Hard rules
Named poses don't blink; cancel mid-blink on pose/talk/tint; `prefers-reduced-motion` disables blink.

## Wire source
This folder is the wire source of truth for rest-idle blink. Paste these three opaque patches onto `public/rai/idle.png` at `(424, 193)`. Outside that dest rect, idle pixels stay delta 0. Do not swap a full sheet.

Do not wire the old L/R oval crops (`432,202 80×40` / `508,202 80×40`, or `artifacts/star-rai-blink-frames/eyes/`). Scrap 790 / `01-open-brow`. Runtime wiring is Starai #48 — not this PR.
