# Preliminary: Tripo rig proportions vs the locked v10 rig (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only. PRELIMINARY.** The v10 values are the ones the user has **stated** in conversation, not read from the v10 armature file, which is not on GitHub. The locked v10 rig was not read or modified.

## Result (MEASURED on Tripo; v10 as stated)

Tripo scaled so its shoulder-to-ankle height equals v10's 162 mm (227.62 mm per Tripo unit). Lengths are 3D joint-to-joint, so A-pose vs straight-down arms does not matter.

| | v10 (stated) | Tripo (scaled) | Difference |
|---|---|---|---|
| Upper arm (shoulder→elbow) | 30.0 mm | 30.1 mm | +0.3 % |
| Forearm (elbow→wrist) | 30.0 mm | 31.3 mm | +4.5 % |
| Shank (knee→ankle) | 55.0 mm | 56.2 mm | +2.2 % |
| Shoulder→knee (height) | 107.0 mm | 106.3 mm | −0.7 % |
| Shoulder width (shoulder joints) | 41.05 mm | 34.0 mm | **−17.3 %** |
| Total height | ~210–216 mm | 223.0 mm | about +3 to +6 % |

- **Limbs and legs match within 5 %.** The Tripo body's limb proportions are close to v10.
- **Shoulders are the real difference:** Tripo's shoulder joints are 17 % closer together. v10's arms were deliberately moved out about 1 mm each for print clearance, which explains about 2 mm of the 7 mm gap.
- **Head:** v10 head starts 16 mm above the shoulders; Tripo's neck joint is 11.3 mm and its head joint 20.0 mm above. Joint definitions differ, so this is not comparable without the v10 file.
- **Height:** Tripo is a few percent taller at equal shoulder-to-ankle height, so the difference is in the head and feet. That can't be split further without the v10 file.

## Limits

- v10 numbers are from conversation, not the file. **Not verified.**
- Joint names and definitions are matched by meaning (Upperarm = shoulder, Forearm = elbow, Hand = wrist, Calf = knee, Foot = ankle); v10's own definitions are unknown.
- Hips, spine, neck, hands, feet and the 31-bone hierarchy are not compared.
- Positions only; no weights, rotations or bone rolls.

## Files

- `scripts/v10_proportions_prelim.py`, `outputs/v10_proportions_prelim.json`
- Input (not committed): `starmodelrigpose.glb`, SHA-256 `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7`
- Reproduce: `python3 -I scripts/v10_proportions_prelim.py starmodelrigpose.glb <glbio dir> out.json` (`glbio.py` @ `19d405f`)

## Next (user decides)

Add the v10 armature JSON to GitHub (or upload it) for a full bone-by-bone comparison: all 31 bones, hierarchy, hips, spine, neck and feet.
