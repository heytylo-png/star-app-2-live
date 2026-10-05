> **RETIRED 2026-10-05:** idle↔smug is Helix 956 intro + `smug_hold` + 962 rest forward (`PoseBridge`). Hip clip travel and Helix 06→01 reverse exit are off (`hipClipSupported() === false`).

# Hip clip cut (idle <-> smug travel, 2026-10-04)

Source: `hip-bridge-917.mp4` (9.04 s, 24 fps, 720x1280 h264 + aac + mjpeg cover on studio white). Audio and cover are not shipped (the mp4 itself is not shipped).

1. Frame differencing: frames 0-29 are the static arms-down idle, the arm starts to move at **frame 30 (1.25 s)**, a new picture lands every third tick (8 pictures/s), the hand arrives on the hip at **frame 75 (3.125 s)** and settles at **frame 78 (3.25 s)**; static hold to frame 149 (the clip's own exit, 150-198, is not used: the exit is the same travel played backward).
2. Frames 29, 30, 33, ... 78 (18 distinct pictures) were cut to RGBA with the same bridge/sweep matte engine as the pre-cut pose sheets (enclosed studio-white pockets as seeds, edge matte, no repainting, halo 1323 -> 7 px on average over the set), then cropped to the common box x118..531, y0..1263 (413x1263, `HIP_CLIP_CROP`) and saved as lossy WebP (q80, alpha q70): `public/rai/hip/hip_bridge_00.webp` ... `_17.webp` (~915 KB total, one set for both directions).
3. Nothing was repainted, regenerated or rescaled: the pictures sit in the 720x1280 sheet space (same box and `object-fit: contain` as every sheet), so no position or scale offset is applied.

Known: `public/rai/smug_official.png` is an arms-down smirk sheet (kept on disk, not the hold).
Hold (option B): `public/rai/smug_hold.png` — keyed Helix `06-hand-on-hip.png` (hip + smirk). Live exit is now Helix 962 `smug_out_01..05` forward (not 06→01 reverse, not clip reverse).
