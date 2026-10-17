# wbpipe — welcome clip pipeline (welcome-back pool: rai/welcome1329 / 1330 / 1366.avif)
Rebuilt 2026-10-14 after the first box restore, re-validated 2026-10-17 after the second one (branch `tools/wbpipe`
of heytylo-png/star-app-2-live keeps a copy under tools/wbpipe/; no media). Box paths:
- pipeline: /workspace/bridge/wbpipe (this dir). Sources: src/*.mp4 (from TyLo's zips), frames vid/hf<n>/, registered vid/reghf<n>/
- repo clone: /workspace/r67 (lib.REPO); cut engine: /workspace/f807/bridge/engine (sweeplib, cut_alpha_sweep, sheets_1158_1162)
  + /workspace/f807/sweep/sheets.py — snapshot in engine/ here; if f807 is gone copy them back to those paths.
- live probes: /workspace/f807/mouth/wire (probe_welcome.py, probe17.py, run_tylo.sh, analyze_pout.py, seg.py, wave_check.py) — snapshot in live/.
- WB_WORK=<dir> redirects cut/ ship/ enc/ qa.json (scratch / validation runs); default is this dir.

## 0. Gate a new source (stop on FAIL, report the numbers)
python3 gate.py <mp4> <n> [outdir]  -> extracts vid/hf<n>/ (video stream 0 only), writes gate.json / GATE.md / montage / reg_first / reg_last.
Checks: 24/1 fps; true 24 fps (distinct poses >= 85 % of frames, no 3-frame period); camera locked (sole range <= 2 px,
shoe width range <= 3 px: catches zooms); feet in frame; registration s < 1.80 (old 1366 = 1.845); hand never above the
stage top (only hair may be); a hand reaches head height (gesture present); f0 and last frame on idle at the one fixed
registration (face score <= 20, silhouette XOR <= 1.2 x old 1366 ~54k; refs 1366: 12.7 / 16.8, 54.1k / 54.7k).
History: 1596 FAIL (starts mid-wave, hand on hip), 1599 FAIL (+18 % zoom-in, no flip), old 1366 source FAIL true-24fps (3-frame holds).

## Build (n = clip id, any frame count)
1. S0=<s-0.05> S1=<s+0.05> ST=0.001 python3 reg_scan.py <n>  -> reg_scan.json [s, tx, ty]: feet centre -> x 363.5, sole -> y 1258,
   s = best f0 face on idle. Default range 1.70-1.98 step 0.005 reproduces the shipped constants 1.845 / -303.46749999999884 /
   -540.413749999997 for 1329/1330/1366 bit for bit (tx/ty from the raw np.arange value; that float matters for column 363).
2. python3 warp_all.py <n>        -> vid/reghf<n>/ (one uniform bicubic affine for every frame, white fill)
3. WB_TAG=welcome-hf5 python3 run_hf.py <n>   -> cut/welcome<n>_NNN/ (white matte: f807 engine, seed rule of sheets_1158_1162, auto hair zones)
4. python3 process.py <n>         -> ship/welcome<n>_NNN.png: alpha post (specks, pinholes, hair fringe, near-white slivers) ->
   skin + blush band gains (dark_gains.json, fitdark.py) -> face ease from idle over the first 8 frames, to idle over the last 8
   (f113-120 at 121 frames, adapts to the real length) -> edges (x fade 15->22 at both band edges, rows >= 1264 alpha 0)
5. bash enc.sh <n> 26 20          -> enc/welcome<n>.avif (672x1280 colour + alpha AV1, 24 fps, no audio)
6. python3 ship_check.py enc/welcome<n>.avif <n>   (frames = source, 0 audio, edges 0/0/0, < 1.8 MB)
   python3 qa.py <n> ; python3 joins.py enc/welcome<n>.avif ; python3 sharp.py enc/welcome<n>.avif  (face sharpness vs hf3 + crop)
7. ship: copy to /workspace/r67/public/rai/welcome<n>.avif (replace), bump the ?v= tag in src/lib/welcome-wave.ts,
   python3 gen_edges.py 0  (rewrites src/lib/welcome-clip-edges.json from the shipped files; FILES lists the pool),
   tsc / npm test / build, PR + squash merge, then deploy_ghp.sh <sha7> "<msg>" (fast-forward gh-pages, never force).
8. live (phone profile): live/probe_welcome.py <url> <out> debug<n>|gap3h|gap2h59|callpend3h|callopen3h|checkin3h [secs];
   regressions: run_tylo.sh "$U" $D warm_off_tylo_wave warm_on_tylo_wave warm_off_tylo_smug warm90_off_tylo_pout warm_off_talk_hold;
   seg.py $D <specs>; wave_check.py $D/<spec>.

## Validation 2026-10-17 (after the second restore; WB_WORK=/workspace/bridge/wbpipe_val)
- reg_scan: 1329 / 1330 / 1366 -> [1.845, -303.46749999999884, -540.413749999997], identical to the stored hf builds.
- 1366 from src/welcome-flip-1366.mp4 end to end: registered frames, all 121 cuts, all 121 ship PNGs sha-identical to the hf3 build;
  enc.sh output = shipped public/rai/welcome1366.avif byte for byte (sha 7c14e423...). joins/qa = hf3 proof numbers
  (idle->f0 6.94/2.37/1.52/2.47, last->idle 9.98/2.26/1.35/2.89, top frames 41, edges 0/0/0, minx 39).
- gen_edges.py 0 -> byte-identical src/lib/welcome-clip-edges.json.
- 1329 rebuilt with this pipeline vs shipped wb2 (built by the older lost wb pipeline): f0 alpha mean|d| 0.075, alpha>16 241,153 vs
  240,850, face skin 184.2/120.2/94.6 vs 184.4/120.0/94.0, blush 189.7/111.1/83.9 vs 188.8/111.4/84.0; all frames IoU(a>128)
  >= 0.9947. Mid-clip (f60) skin is 3-5 levels lighter than wb2 (wb2 used per-frame tone; this pipeline uses fixed gains, as hf3).
- 145-frame dry run (1596, not shippable: fails the gate) through steps 2-6 with WB_WORK: 145 frames, eases f0-7 / f137-144,
  0 audio, edges 0/0/0, 1,650,816 B at crf 26/20 (true 24 fps costs bytes: raise crf_color to 28-30 if a clip lands over 1.8 MB).

## Per-clip fixes (WB_FIX), hf7
`WB_FIX=fixes/hf1366n.py python3 process.py 1366n` applies `fix(k, S)` after post + dark and before the face ease.
`fixes/hf1366n.py` recolours the silver star earrings to idle's gold (per-frame tracked positions), shifts skin toward idle
in float Lab on the wide skin mask (face zone / body), and optionally applies a shirt L LUT. Params: `fixes/hf1366n.json`
(or `WB_FIX_PARAMS=<json>`; hf7 shipped with `fixes/hf1366n_shirt.json`). Fit with `fixes/fit_hf1366n.py`, shirt LUT test with `fixes/eval_f0.py`.
