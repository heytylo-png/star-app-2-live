#!/usr/bin/env python3
"""Generate the markdown reports (tables from the measurement JSON; prose is hand-written below)."""
import json,os,hashlib
N='/workspace/blendbro/out/bv9_correction_study_v1/'
M=json.load(open(N+'data/measure_run1.json')); M['B1']=json.load(open(N+'data/measure_b1_run1.json'))['B1']
V=json.load(open(N+'data/verdicts_raw.json')); MAP=json.load(open(N+'data/baseline_mapping.json'))
INT=json.load(open(N+'data/candidate_integrity.json')); PEN=json.load(open(N+'data/penetration_A.json')); PEN0=json.load(open(N+'data/penetration_baseline.json'))
SW=json.load(open(N+'data/A_exploratory_sweep.json')); CX=json.load(open(N+'data/C_exploratory_knee_widen.json')); CS=json.load(open(N+'data/C_support_rule_result.json'))
BUILD={k:json.load(open(N+f'data/candidate_{k}_build.json')) for k in ['A','B','B1']}
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
CAND={'A':N+'candidates/bv9_candidate_A_arm_hand.blend','B':N+'candidates/bv9_candidate_B_foot.blend','B1':N+'candidates/bv9_candidate_B1_foot_ytrans.blend','C':N+'candidates/bv9_candidate_C_legs.blend'}
H={k:sha(p) for k,p in CAND.items()}
VW=['front','side','back']; MD=[('modeF','Mode F'),('modeL','Mode L')]
def f(x,n=2): return '—' if x is None else f'{x:.{n}f}'
def table_main(k,cond='P',views=VW):
    L=['| view | cam | mean | p50 | p95 | p99 | max (mm) | % ≤1 mm | IoU |','|---|---|---|---|---|---|---|---|---|']
    for v in views:
        for m,mn in MD:
            b=M['baseline'][cond][v][m]; s=M[k][cond][v][m]
            c=lambda key,n=2:f'{b[key]:.{n}f} → {s[key]:.{n}f}'
            L.append(f"| {v} | {mn} | {c('mean')} | {c('p50')} | {c('p95')} | {c('p99')} | {c('max')} | {100*b['frac_le_1.0mm']:.1f} → {100*s['frac_le_1.0mm']:.1f} | {b['iou']:.3f} → {s['iou']:.3f} |")
    return '\n'.join(L)
def table_bands(k,views,mode='modeF'):
    L=['| view | band (z mm) | sym mean (mm) | % ≤1 mm | signed outline offset L / R (mm) |','|---|---|---|---|---|']
    for v in views:
        for bn in M['baseline']['P'][v][mode]['bands']:
            b=M['baseline']['P'][v][mode]['bands'][bn]; s=M[k]['P'][v][mode]['bands'][bn]
            if b['sym_mean'] is None: continue
            L.append(f"| {v} | {bn} | {b['sym_mean']:.2f} → {s['sym_mean']:.2f} | {100*b['frac_le_1']:.0f} → {100*s['frac_le_1']:.0f} | {f(b['off_left'])}/{f(b['off_right'])} → {f(s['off_left'])}/{f(s['off_right'])} |")
    return '\n'.join(L)
def table_zone(k,v,zn,label):
    L=[f'| {label} | cam | n | mean | p50 | p95 | max | % ≤1 mm |','|---|---|---|---|---|---|---|---|']
    for m,mn in MD:
        b=M['baseline']['P'][v][m]['zones'][zn]['all']; s=M[k]['P'][v][m]['zones'][zn]['all']
        L.append(f"| {v} | {mn} | {b['n']} → {s['n']} | {b['mean']:.2f} → {s['mean']:.2f} | {b['p50']:.2f} → {s['p50']:.2f} | {b['p95']:.2f} → {s['p95']:.2f} | {b['max']:.2f} → {s['max']:.2f} | {100*b['frac_le_1']:.0f} → {100*s['frac_le_1']:.0f} |")
    return '\n'.join(L)
def regs(k): 
    o=[]
    for m,mn in MD:
        r=V['candidates'][k]['regression'][m]
        o.append(f'- **{mn} (fixed baseline camera):** '+('none' if not r else '; '.join(r)))
    return '\n'.join(o)
def camdrift(k):
    L=['| view | cam | baseline scale s | candidate scale s (re-fit) | Δs % |','|---|---|---|---|---|']
    for v in VW:
        for m,mn in MD:
            b=M['baseline']['R'][v][m]['cam']['s']; s=M[k]['R'][v][m]['cam']['s']; L.append(f'| {v} | {mn} | {b:.4f} | {s:.4f} | {100*(s/b-1):+.2f} |')
    return '\n'.join(L)
REPRO=V['reproducibility_max_abs_diff_run1_vs_run2']
HDR=lambda t:f"# {t}\n\nStudy: bv9 controlled correction study v1 (task t126u; research only, NOT approval to modify or replace bv9). Date 2026-11-02 (America/Chicago). Units: model mm (1 Blender unit = 1 m; figure 244.8 mm tall; real-world scale NOT VERIFIED). Frozen pre-registration: `CORRECTION_STUDY_PREREGISTRATION_FROZEN.md`.\n\nMethod = the validation's frozen method + Amendment A1, implemented by the validation scripts imported UNCHANGED (`s05_measure.py`, `refseg.py`); primary camera = baseline (bv9) cameras held fixed (geometry-only differences), secondary = calibration re-run on the candidate. Every number is `before (bv9) → after (candidate)`. Both measurement runs agree to {REPRO:g} (max abs difference over all reported numbers).\n"
os.makedirs(N+'reports',exist_ok=True)
# ------------------------------------------------------------------ A
a=V['candidates']['A']; pa=PEN; p0=PEN0
A=HDR('Candidate A — arm / hand placement (`bv9_candidate_A_arm_hand.blend`)')+f"""
## 1. Verdict: **FAIL** (pre-registered rule: new mesh intersections) — and, independent of that, **NOT VERIFIABLE** as an improvement (camera-dependent)
- Intended metric (gap zone z 25…80 mm, front and back, sym mean): improves **only under the landmark camera (Mode L)**; **worsens under the best-fit camera (Mode F)**. Pre-registered thresholds: I_F = {a['I_F']}, I_L = {a['I_L']}; regression flags R_F = {a['R_F']}, R_L = {a['R_L']}.
- New non-adjacent triangle-pair intersections (BVH, rest mesh): **{INT['A']['bvh']['new_pairs']}** (all lower-arm ↔ pelvis/hip, z 40.8…48.1 mm). Baseline minimum forearm→hip clearance was {p0['right']['min_signed_mm']:.2f} mm (right) / {p0['left']['min_signed_mm']:.2f} mm (left); the 3.5 mm shift penetrates by up to {-pa['left']['min_signed_mm']:.2f} mm (left, {pa['left']['n_inside']} vertices inside) / {-pa['right']['min_signed_mm']:.2f} mm (right, {pa['right']['n_inside']} inside). The pre-registered rule makes any new intersection a FAIL.
- **Calibration caveat (important):** when the validation's calibration procedure is re-run on the candidate (secondary condition, §4.2), Mode F re-fits the scale **+5.6 % (front) / +6.0 % (back, at the ±6 % bound)** and A then *improves* front (mean 1.32 → 1.00 mm, 61 → 73 % ≤ 1 mm) and back (1.13 → 1.04 mm, 57 → 71 %). That is the same direction as fixed Mode L (the re-fit lands on the Mode-L scale), so A's apparent gain exists whenever the figure is scaled up ≈5–6 %, and is a regression when the baseline best-fit scale is kept. The references do not tell which scale is real.
- Without the intersection rule the result would be NOT VERIFIABLE: improvement under one calibration, regression under the other. A 3.5 mm inward shift of the whole arm is **not supported as a correction by the official references**.

## 2. What was changed (candidate copy only)
Mesh-only edit of a copy of bv9; no bone, weight, topology, material, texture or modifier change (verified: `data/candidate_integrity.json`). Per side, existing arm vertex-group weights w = clip(upper_arm+lower_arm+hand, 0, 1) × taper(z) (1 for z ≤ 70 mm → 0 at z ≥ 90 mm, smoothstep, to protect the armpit); x translated **3.5 mm toward the midline**. {BUILD['A']['n_moved']:,} vertices moved (max displacement {BUILD['A']['max_disp_mm']:.2f} mm). Moved vertices by dominant group: {INT['A']['moved_verts_by_dominant_group']} — the 63 `waist`-dominant vertices are torso vertices at the armpit that carry a partial arm weight; no vertex with zero arm weight moved. The 17 shape-key blocks received the same delta so their relative offsets are unchanged (all key values are 0). Torso and hip geometry were not edited. Rest-pose skeleton is unchanged, so the arm mesh no longer lines up with the arm bone axis by ≈3.5 mm (a rig consequence NOT assessed here).

## 3. Cause analysis (measured on bv9, before any edit)
The front/back "gap wedge" between arm and hip is, at z 50…70 mm (back view, Mode F), **6.1–9.2 mm wide in the model against 0.2–3.1 mm in the reference** (rows where arm and torso are separable in both masks, `data/baseline_mapping.json`; front view similar: 6.0–8.3 vs 0.9–1.2 mm at z 50 and 75). Excess gap ≈ 4–6 mm per side at z 40…80 in both cameras. **Who owns the excess depends on the camera:**
- **Mode F (best-fit scale):** arm outer edges agree within 0.0–0.7 mm (back, z 40–80) and the arm inner edge is 0.3–1.6 mm off (z 45–80; 2.8–3.3 mm at z 40 where the hand begins); the **torso/waist is 4.4–5.6 mm per side narrower than the reference at z 50–70** (e.g. back z 55: reference half-width 24.2, model 18.7 mm). → body geometry, not arm placement.
- **Mode L (landmark scale, height-consistent):** torso half-width within 2.5 mm (mostly ≤1.4 mm; largest: back z 45 model wider by 2.4, front z 70 model narrower by 2.5), but the model arms sit **2.2–3.7 mm (outer edge) / 3.4–4.5 mm (inner edge) farther out**. → arm placement.
- The two cameras differ by ≈5 % in scale (front F 5.694 vs L 6.001 px/mm; back 5.737 vs 5.967), the F fit for front/back is ≈5 % below the side-view fit (5.980), i.e. the three references are not scale-consistent under the best-fit camera. Which camera is right cannot be established from the references (no scale data) → **the attribution (arm vs torso) is NOT VERIFIABLE**; what is measured is the ≈5 mm excess gap itself.
- Hands: front reference hands end higher (z ≈ 28) and sit against the thigh; back reference hands extend lower (≤ z 18). Front and back references disagree on the hand, so hand placement/length is NOT VERIFIABLE.
- Reference-segmentation spot check (raw grey values along rows z 30…70, front and back): gap pixels between arm and hip are at background grey (≈174–175) and 1–2 mm wide (6–10 px) in the rows where the mask shows a gap, i.e. the reference gap is real there; where the mask shows no gap the arm touches the body or the gap is below ≈1 mm (segmentation resolution 0.17 mm/px). This is a spot check of selected rows, not a full audit of the segmentation.

## 4. Measurement (before → after, same method)
### 4.1 Fixed baseline cameras (primary)
{table_main('A','P')}

### 4.2 Calibration procedure re-run on the candidate (secondary; includes calibration drift)
{table_main('A','R')}

Scale the re-fit chose for the candidate (Mode F hits/approaches the ±6 % bound because the narrower figure is "rescaled up"; improvements under re-fit Mode F are therefore calibration drift, not geometry):
{camdrift('A')}

### 4.3 Intended region — gap zone z 25…80 mm
{table_zone('A','front','gap_z25_80','front gap zone')}

{table_zone('A','back','gap_z25_80','back gap zone')}

Arm outer-edge row offset (z 40…80, mean |model − reference|, Mode F fixed camera): front {M['baseline']['P']['front']['modeF']['arm_outer_edge_z40_80']['mean_abs']:.2f} → {M['A']['P']['front']['modeF']['arm_outer_edge_z40_80']['mean_abs']:.2f} mm, back {M['baseline']['P']['back']['modeF']['arm_outer_edge_z40_80']['mean_abs']:.2f} → {M['A']['P']['back']['modeF']['arm_outer_edge_z40_80']['mean_abs']:.2f} mm; (Mode L) front {M['baseline']['P']['front']['modeL']['arm_outer_edge_z40_80']['mean_abs']:.2f} → {M['A']['P']['front']['modeL']['arm_outer_edge_z40_80']['mean_abs']:.2f}, back {M['baseline']['P']['back']['modeL']['arm_outer_edge_z40_80']['mean_abs']:.2f} → {M['A']['P']['back']['modeL']['arm_outer_edge_z40_80']['mean_abs']:.2f} mm.

Hand zone z 15…45: {table_zone('A','front','hand_z15_45','front hand zone')}

{table_zone('A','back','hand_z15_45','back hand zone')}

### 4.4 Bands (fixed Mode F camera) — front and back
{table_bands('A',['front','back'],'modeF')}

Bands (fixed Mode L camera):
{table_bands('A',['front','back'],'modeL')}

### 4.5 Side view
Unchanged by construction (the edit is a pure x-translation): side-view numbers are identical before/after in every camera condition (see §4.1).

## 5. Regression analysis (pre-registered thresholds)
{regs('A')}
- Intersections: {INT['A']['bvh']['new_pairs']} new pairs; vertex bbox of new pairs z 40.8…48.1 mm, |x| ≤ 26.5 mm (`data/candidate_integrity.json`, `data/penetration_A.json`).
- Other silhouette regions: only front/back arm-torso rows changed; leg, foot and head contours are untouched (identical numbers in those bands).

## 6. Exploratory sweep (in memory only; no files; NOT candidates) — shift Δ vs fixed-camera mean error (front / back) and gap-zone mean
| Δ inward (mm) | Mode F front | Mode F back | Mode L front | Mode L back | Mode L gap-zone front/back |
|---|---|---|---|---|---|
"""+'\n'.join(f"| {d} | {SW[d]['front']['modeF']['mean']:.3f} | {SW[d]['back']['modeF']['mean']:.3f} | {SW[d]['front']['modeL']['mean']:.3f} | {SW[d]['back']['modeL']['mean']:.3f} | {SW[d]['front']['modeL']['gap_mean']:.2f}/{SW[d]['back']['modeL']['gap_mean']:.2f} |" for d in SW)+f"""

Under Mode L the optimum is Δ ≈ 2.5–3.5 mm; under Mode F the best value is Δ ≈ 0–1 mm. Baseline forearm-to-hip clearance (2.47 mm left) bounds penetration-free shifts to Δ ≲ 2.4 mm.

## 7. Uncertainties and limits
- Camera: orthographic, scale/offset unknown; Mode F vs Mode L give opposite verdicts (above). Perspective in the references cannot be excluded.
- The reference views disagree with each other (hand length; ≈5 % scale difference under Mode F).
- Hidden geometry (armpit, inner arm, depth between views) NOT VERIFIABLE; no geometry was invented.
- Rig effect of moving the arm mesh without moving the bones was not evaluated (no posing/sim performed).
- 1 mm agreement is **not** claimed anywhere: best case (Mode L, front) mean 1.01 mm, 72 % ≤ 1 mm.

## 8. Files
Local candidate: `{CAND['A']}` sha256 `{H['A']}`; edit parameters `data/candidate_A_build.json`; measurements `data/measure_run1.json` (key `A`), `data/measure_run2.json`; overlays (contour-only) `overlays_publishable/candA_*`.
"""
open(N+'reports/REPORT_candidate_A.md','w').write(A)
# ------------------------------------------------------------------ B
b=V['candidates']['B']; b1=V['candidates']['B1']
sole=lambda k,m:(M['baseline']['P']['side'][m]['sole_envelope']['mean_abs_dz'],M[k]['P']['side'][m]['sole_envelope']['mean_abs_dz'],M['baseline']['P']['side'][m]['sole_envelope']['max_abs_dz'],M[k]['P']['side'][m]['sole_envelope']['max_abs_dz'])
envrows=MAP['B_lower_envelope_by_Y']
B=HDR('Candidate B — foot alignment (`bv9_candidate_B_foot.blend`; plus post-hoc amendment B1 `bv9_candidate_B1_foot_ytrans.blend`)')+f"""
## 1. Verdicts
- **B (pre-registered): FAIL.** The flat-sole correction measurably moves the sole line toward the reference (side sole-envelope mean |Δz| {sole('B','modeF')[0]:.2f} → {sole('B','modeF')[1]:.2f} mm) but the foot zone (side, z < −60 mm) improves only {b['intended']['modeF']['side_foot_zone_mean_decrease_mm']:.2f} mm (Mode F) / {b['intended']['modeL']['side_foot_zone_mean_decrease_mm']:.2f} mm (Mode L) against the pre-registered ≥ 1.0 mm threshold (I_F = {b['I_F']}, I_L = {b['I_L']}), and the toe tip lands ≈8.4 mm in front of the reference (model Y_max 31.6 vs reference 23.1–23.3 mm); under Mode L the %-of-outline-within-1 mm drops (front 61.3 → 57.2 %, side 67.5 → 64.2 %).
- **B1 (post-hoc amendment, designed after seeing B): FAIL.** Sole line now agrees (mean |Δz| {sole('B1','modeF')[0]:.2f} → {sole('B1','modeF')[1]:.2f} mm, max {sole('B1','modeF')[2]:.1f} → {sole('B1','modeF')[3]:.1f} mm) and the toe tip is at the reference position, but the whole-foot zone barely improves (Mode F {b1['intended']['modeF']['side_foot_zone_mean_decrease_mm']:.2f} mm) and the **side ankle zone (z −75…−55) worsens from 0.85 to 3.25 mm (Mode F)** — the weight-blended ankle is sheared by the foot translation/rotation (regression flags R_F = {b1['R_F']}, R_L = {b1['R_L']}).
- Net finding: **the pitch hypothesis is supported for the sole line, but a rigid foot alignment is not sufficient** — the remaining foot-zone error (≈2.8 mm mean) is foot *volume/shape* (heel, instep, ankle height), which rotation/translation of the existing mesh cannot fix. Pitch and sole-line are measured; the "volume" interpretation is an inference from the overlays.

## 2. What was changed (copies only; foot bones, weights, topology untouched)
- **B**: per side w = clip(foot_s weight); rotate about the world-X axis through the ankle pivot (±10.0, 0.0, −62.0) mm (the locked v10 `foot_*` bone head, read only) by **+{BUILD['B']['phi_deg']} ° (toe up)** = mean of the measured bv9 sole pitches (right −28.44 °, left −27.83 °); then translate z by {BUILD['B']['dz_mm']:.3f} mm (weighted) so the lowest vertex is z = {BUILD['B']['min_z_after']:.3f} mm (floor landmark). {BUILD['B']['n_moved']:,} vertices moved (max {BUILD['B']['max_disp_mm']:.2f} mm): foot-dominant {INT['B']['moved_verts_by_dominant_group'].get('foot_right',0)+INT['B']['moved_verts_by_dominant_group'].get('foot_left',0):,}, shin-dominant (ankle blend) {INT['B']['moved_verts_by_dominant_group'].get('shin_right',0)+INT['B']['moved_verts_by_dominant_group'].get('shin_left',0)}; no vertex with zero foot weight moved.
- **B1** (`AMENDMENT_B1_FROZEN.md`, written after B was measured): B plus a Y translation of {BUILD['B1']['dy_mm']:.3f} mm (weighted by foot weights) so the toe tip (max Y of foot-weighted vertices) sits at the reference toe tip Y = 23.09 mm (mean of the Mode F / L reference extents 23.27 / 22.91).
- New BVH intersections: B {INT['B']['bvh']['new_pairs']}, B1 {INT['B1']['bvh']['new_pairs']}. Lowest vertex z: B {M['B']['min_z_mm']:.3f}, B1 {M['B1']['min_z_mm']:.3f} mm.
- The flattened foot lowers the foot by 9.7 mm relative to the unchanged shin (the baseline "tiptoe" raises the heel; keeping the sole on the floor with an unchanged ankle requires this drop), stretching the lower-shin weight blend; this is why the ankle band regresses. The v10 foot bone itself is pitched 45° (head (10,0,−62) → tail (10,26,−88) mm) — a foot flattened in the mesh no longer follows the bone axis (rig consequence NOT assessed; bones were not changed).

## 3. Orientation vs geometry vs camera (measured on bv9)
- bv9 sole-envelope pitch: right −28.4 °, left −27.8 ° (toe low, heel raised: envelope z at Y=−8 mm is −73.6 mm; at Y=16 mm −88.1 mm). Reference sole is flat (z −84.9…−87.4 mm over Y −10…22).
- Foot length: model 3D length along the sole ≈ (22.5 − (−8.2)) / cos 28.1 ° = 34.8 mm vs reference foot Y extent 34.3 mm (−11.0…23.3) → **length matches within ≈0.5 mm; the sole-line mismatch is orientation**, not foot length (measured/derived from the envelopes).
- Camera: reference toe/heel Y extents agree between Mode F and Mode L within 0.4 mm (−11.01/23.27 vs −11.07/22.91), the reference sole row is a landmark in both → the sole mismatch (up to 12 mm at the heel) is **not** a camera effect.
- Side sole envelope, z (mm) by Y — reference vs bv9 (Mode F):
| Y (mm) | reference z | bv9 z |
|---|---|---|
"""+'\n'.join(f"| {r['Y']:.0f} | {f(r['ref_z'],1)} | {f(r['model_z'],1)} |" for r in envrows if r['ref_z'] is not None and int(r['Y'])%4==0)+f"""

## 4. Measurement (before → after)
### 4.1 B — fixed baseline cameras (primary)
{table_main('B','P')}

### 4.2 B1 — fixed baseline cameras (primary)
{table_main('B1','P')}

### 4.3 Calibration procedure re-run (secondary) — B1 (B in the JSON)
{table_main('B1','R')}

### 4.4 Intended region — side foot zone z < −60 mm, ankle zone z −75…−55, non-foot z ≥ −60
B: {table_zone('B','side','foot_zlt-60','side foot zone')}

B1: {table_zone('B1','side','foot_zlt-60','side foot zone')}

Ankle zone (z −75…−55) B / B1:
{table_zone('B','side','ankle_z-75_-55','side ankle zone')}

{table_zone('B1','side','ankle_z-75_-55','side ankle zone')}

Non-foot zone (z ≥ −60): B {M['B']['P']['side']['modeF']['zones']['nonfoot_z-60_100']['all']['mean']:.3f} (before {M['baseline']['P']['side']['modeF']['zones']['nonfoot_z-60_100']['all']['mean']:.3f}); B1 {M['B1']['P']['side']['modeF']['zones']['nonfoot_z-60_100']['all']['mean']:.3f} — unchanged (Mode F).

Sole-envelope deviation to reference (side, Y −8…22 mm, mean |Δz| / max |Δz| mm):
| cam | bv9 | B | B1 |
|---|---|---|---|
| Mode F | {sole('B','modeF')[0]:.2f} / {sole('B','modeF')[2]:.1f} | {sole('B','modeF')[1]:.2f} / {sole('B','modeF')[3]:.1f} | {sole('B1','modeF')[1]:.2f} / {sole('B1','modeF')[3]:.1f} |
| Mode L | {sole('B','modeL')[0]:.2f} / {sole('B','modeL')[2]:.1f} | {sole('B','modeL')[1]:.2f} / {sole('B','modeL')[3]:.1f} | {sole('B1','modeL')[1]:.2f} / {sole('B1','modeL')[3]:.1f} |

Front/back foot zone (z < −60) sym mean, Mode F: front {M['baseline']['P']['front']['modeF']['zones']['foot_zlt-60']['all']['mean']:.2f} → B {M['B']['P']['front']['modeF']['zones']['foot_zlt-60']['all']['mean']:.2f} → B1 {M['B1']['P']['front']['modeF']['zones']['foot_zlt-60']['all']['mean']:.2f}; back {M['baseline']['P']['back']['modeF']['zones']['foot_zlt-60']['all']['mean']:.2f} → B {M['B']['P']['back']['modeF']['zones']['foot_zlt-60']['all']['mean']:.2f} → B1 {M['B1']['P']['back']['modeF']['zones']['foot_zlt-60']['all']['mean']:.2f}.

### 4.5 Bands, side view, fixed Mode F camera — B1 (B in JSON)
{table_bands('B1',['side'],'modeF')}

## 5. Regression analysis
**B**
{regs('B')}

**B1**
{regs('B1')}

Front/back views: overall mean changes ≤ +0.06 mm (B) / +0.06 mm (B1) in Mode F (front 1.322 → 1.375 / 1.375; back 1.125 → 1.133 / 1.133); leg bands unchanged.

## 6. Uncertainties and limits
- The reference foot is an AI-style wireframe render, perspective/camera NOT VERIFIED; the sole line is a landmark in both calibrations.
- Heel/instep volume mismatch is inferred from overlays (the model foot is a thin band; the reference foot is a thick wedge); no sculpt/volume test was run.
- Foot weights are linear-blend; a different pivot or weight-aware deformation could move the shear elsewhere. Not explored (one variable at a time).
- B1 was designed after B's result and uses reference landmarks (toe tip) from the same reference; it is post-hoc and not a pre-registered result.

## 7. Files
B `{CAND['B']}` sha256 `{H['B']}`; B1 `{CAND['B1']}` sha256 `{H['B1']}`; parameters `data/candidate_B_build.json`, `data/candidate_B1_build.json`; measurements `data/measure_run1.json` (key `B`), `data/measure_b1_run1.json` (key `B1`) and their run-2 repeats; overlays `overlays_publishable/candB_*`, `candB1_*`.
"""
open(N+'reports/REPORT_candidate_B.md','w').write(B)
# ------------------------------------------------------------------ C
rows=[]
for bn in ['ankles/shins','knees','thighs']:
    c=CS[bn]; rows.append(f"| {bn} | {c['front']['sign']} (min {c['front']['min_abs_mm']:.2f}, max {c['front']['max_abs_mm']:.2f}; weakest: {c['front']['weakest_variant']}) | {c['back']['sign']} (min {c['back']['min_abs_mm']:.2f}, max {c['back']['max_abs_mm']:.2f}; weakest: {c['back']['weakest_variant']}) | {c['side_view_signed_range_mm'][0]:.2f}…{c['side_view_signed_range_mm'][1]:.2f} | {'YES' if c['SUPPORTED_by_preregistered_rule'] else 'NO'} |")
var=MAP['C_leg_offsets_variants']
def vt(v):
    L=['| variant | ankles/shins L/R | knees L/R | thighs L/R |','|---|---|---|---|']
    for k,x in var[v].items(): L.append(f"| {k} | "+' | '.join(f"{x[b]['left']:.2f} / {x[b]['right']:.2f}" for b in ['ankles/shins','knees','thighs'])+' |')
    return '\n'.join(L)
Cr=HDR('Candidate C — leg silhouette (`bv9_candidate_C_legs.blend`; NO CHANGE APPLIED)')+f"""
## 1. Verdict: **NOT VERIFIABLE — no candidate change made**
No leg band meets the pre-registered "supported beyond camera uncertainty" rule (same sign in all 10 camera/segmentation variants, both views, both sides, smallest magnitude ≥ 0.5 mm in both views). Per the pre-registration `bv9_candidate_C_legs.blend` is a **byte-identical copy of bv9** (sha256 `{H['C']}` = bv9 `d72cedc1…9689`); it is labelled "no change" and must not be mistaken for a corrected model. The passing side-view knee/thigh bands are untouched by construction.

## 2. Zone map (bv9, signed outline offset model − reference; negative = model narrower, per side; ankles/shins z −75…−40, knees −40…−15, thighs −15…18 mm)
All variants share one sign (model narrower than reference) in front and back, but the magnitude is camera-dependent by a factor of 3–10:
| band | front (all 20 variant-sides) | back (all 20 variant-sides) | side view signed range (mm) | supported by rule |
|---|---|---|---|---|
"""+'\n'.join(rows)+f"""

Front, per camera/segmentation variant (left / right mm):
{vt('front')}

Back:
{vt('back')}

Side (the bands that PASS in the validation; depth, not width):
{vt('side')}

## 3. Camera uncertainty vs geometry
- **Direction is robust, size is not.** The model is narrower than the reference in every variant of both views (never wider), so a real narrowness of the legs relative to the references is likely (inference). The size ranges 0.2–2.2 mm (front) and 0.4–3.1 mm (back) per side, spanning Mode L (small) to Mode F with −2 % scale (large): scale ±2 % alone moves a band by ≈0.4–0.5 mm per side.
- Weakest links against the rule: front ankles 0.24 mm and thighs 0.20 mm (Mode L), back knees 0.39 mm (Mode L); only front knees (≥0.70 mm) and back ankles (≥0.71 mm) clear 0.5 mm in one view each, in different bands.
- References are mutually inconsistent (validation: back/front width ratio 0.92–1.08 on legs and torso; reference left/right asymmetry up to 1.2 mm), so a front-derived width change cannot be confirmed by the back at the 0.5 mm level.
- The front/back reference scales differ by ≈5 % between Mode F and Mode L (see candidate A), larger than the effect being corrected.

## 4. Exploratory, in-memory only (NOT a candidate, no file): conservative knee widening
Knee band (z −40…−15) x-scale about each leg axis giving +0.7 mm per side (the smallest robust front magnitude; leg half-width {CX['knee +0.7 mm/side']['half_width_mm']:.2f} mm), smoothstep 5 mm margins; fixed baseline cameras.
| view | cam | mean before → after | p95 | % ≤1 mm | knee-band mean abs outline offset (mm) |
|---|---|---|---|---|---|
"""+'\n'.join(f"| {v} | {mn} | {CX['baseline'][v][m]['mean']:.3f} → {CX['knee +0.7 mm/side'][v][m]['mean']:.3f} | {CX['baseline'][v][m]['p95']:.2f} → {CX['knee +0.7 mm/side'][v][m]['p95']:.2f} | {100*CX['baseline'][v][m]['frac_le_1']:.1f} → {100*CX['knee +0.7 mm/side'][v][m]['frac_le_1']:.1f} | {CX['baseline'][v][m]['knee_band']['abs_off']:.2f} → {CX['knee +0.7 mm/side'][v][m]['knee_band']['abs_off']:.2f} |" for v in ['front','back','side'] for m,mn in MD)+"""

Reading: the knee-band offset shrinks in front (both cameras) and in back under Mode F, but grows slightly in back under Mode L (0.57 → 0.63 mm), and overall mean/p95/% ≤1 mm barely move (≤ 0.05 mm mean). Side view is identical (x-only edit) so the side-view PASS bands are preserved. This does not satisfy the pre-registered rule and is **not** claimed as an improvement.

## 5. Uncertainties
Same camera/provenance limits as the validation; no scale data; no three-quarter views. A leg-width change cannot be justified before the camera/scale question is resolved.
"""
open(N+'reports/REPORT_candidate_C.md','w').write(Cr)
print('reports written')
