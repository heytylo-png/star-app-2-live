# Interim status (2026-11-10 17:33 CST)

The first two parallel runs were stopped by a machine restart after these joints. Their logs are in `outputs/interrupted_run1/`; the two runs agree line for line.

- **Rest check:** all joints clear (min 0.15 mm). **Control:** knee_right at 90° → s* = 0.2451, PASS.
- **neck: LIMITED.** 62/135 keys; demanded up to 36.8°; at the worst key (3.042 s) allowed 13.1°, short 23.6°.
- **spine hip→lower_waist, lower_waist→waist: FOLLOWS.**
- **spine waist→mid_chest: LIMITED.** 13 keys; short 0.68° at most.
- **spine mid_chest→upper_chest: FOLLOWS, but demand is 0°.** The retarget drives both bones from Tripo `Spine02`, so this joint is not exercised.

Re-running with per-joint checkpoints. Final results replace this file.
