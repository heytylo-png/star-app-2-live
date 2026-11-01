#!/usr/bin/env python3
"""POST-FREEZE supplement (added after first-run observations; not in METHOD_FROZEN.md). Read-only. stdlib+numpy.
Questions it answers, each motivated by a first-run observation:
 S1 body-only weight stats (CAD claim stats include helper geometry)         
 S2 rigify weight sums >1 : effect of excluding 'mhmask-*' pseudo-bones; which groups are the 16 unweighted verts
 S3 residual distribution of OBJ-reconstructed joints vs rig default_position (outliers: Root; ~cm offsets)
 S4 which vertex/group gives the 'lowest point of the mesh'; ankle height above sole in a single consistent frame
 S5 joint-ground cube position vs Root default_position"""
import json, sys, collections, math
import numpy as np
ROOT = sys.argv[1]; OUT = sys.argv[2]; D = ROOT + '/src/mpfb/data'
exec(open(OUT + '/_common.py').read())
R = {}
# S1
bodyset = body
for n in ('default', 'game_engine', 'rigify_human_toes'):
    w = W[n]; cnt = collections.Counter(); sm = collections.defaultdict(float)
    for b, l in w.items():
        for i, x in l:
            cnt[i] += 1; sm[i] += x
    ids = [i for i in cnt if i in bodyset]; oth = [i for i in cnt if i not in bodyset]
    a = np.array([cnt[i] for i in ids])
    R['S1_' + n] = dict(body_verts_weighted=len(ids), body_max_infl=int(a.max()), body_mean_infl=round(float(a.mean()), 4),
                        helper_joint_verts_weighted=len(oth), helper_mean_infl=round(float(np.mean([cnt[i] for i in oth])), 4), helper_max_infl=int(max(cnt[i] for i in oth)),
                        body_hist={int(k): int(v) for k, v in zip(*np.unique(a, return_counts=True))})
# S2
w = W['rigify_human_toes']; sm = collections.defaultdict(float); smx = collections.defaultdict(float); masks = [b for b in w if b.startswith('mhmask')]
for b, l in w.items():
    for i, x in l:
        sm[i] += x
        if not b.startswith('mhmask'): smx[i] += x
sx = np.array(list(smx.values()))
R['S2'] = dict(mask_bones=masks, sum_excl_masks=dict(min=round(float(sx.min()), 4), max=round(float(sx.max()), 4), mean=round(float(sx.mean()), 5), n_gt_1_001=int((sx > 1.001).sum()), n_lt_0_999=int((sx < .999).sum()), n=len(sx)))
unw = [i for i in range(nv) if i not in sm]
R['S2']['unweighted_groups'] = sorted(set(g for i in unw for g in grp_of[i]))
# S3
H = np.stack([src[:, 0], -src[:, 2], src[:, 1]], 1) * 0.1
dd = dst - H; r = np.linalg.norm(dd, axis=1)
isroot = np.array([k[1] == 'Root' and k[2] == 'head' for k in kinds])
R['S3'] = dict(n=len(r), percentiles_m={str(p): round(float(np.percentile(r, p)), 5) for p in (10, 25, 50, 75, 90, 95, 99)},
               median_signed_offset_xyz_m=np.median(dd, 0).round(5).tolist(), mean_signed_offset_xyz_m=dd.mean(0).round(5).tolist(), n_gt_1cm=int((r > 0.01).sum()), n_gt_5cm=int((r > 0.05).sum()))
m = ~isroot
r2 = r[m]; R['S3']['excluding_Root_head'] = dict(rmse=round(float(np.sqrt((r2 ** 2).mean())), 5), median=round(float(np.median(r2)), 5), max=round(float(r2.max()), 5))
# refit scale free excl. Root, robust (drop worst 10%)
def fit(A, Dd):
    Ac = A - A.mean(0); Dc = Dd - Dd.mean(0); s = (Ac * Dc).sum() / (Ac * Ac).sum(); t = Dd.mean(0) - s * A.mean(0); return s, t
A = H / 0.1; keep = m.copy()
for _ in range(3):
    s, t = fit(A[keep], dst[keep]); res = np.linalg.norm(s * A + t - dst, axis=1); thr = np.percentile(res[m], 90); keep = m & (res <= thr)
R['S3']['robust_refit'] = dict(scale=round(float(s), 6), translation=t.round(5).tolist(), rmse_kept=round(float(np.sqrt((res[keep] ** 2).mean())), 5), median_all_but_root=round(float(np.median(res[m])), 5))
# per-strategy and per-axis for CUBE tails vs heads
by = collections.defaultdict(list)
for k, rr in zip(kinds, r): by[(k[3], k[2])].append(float(rr))
R['S3']['by_strategy_end_median_m'] = {f'{a}:{b}': round(float(np.median(v)), 5) for (a, b), v in by.items()}
# which bones: top 5 non-root
order = [i for i in np.argsort(-r) if not isroot[i]][:6]
R['S3']['top_nonroot'] = [dict(rig=kinds[i][0], bone=kinds[i][1], end=kinds[i][2], strat=kinds[i][3], resid_m=round(float(r[i]), 4), signed_xyz=dd[i].round(4).tolist()) for i in order]
# S4
allv = sorted(allref); zmin_i = min(allv, key=lambda i: V[i][1]); bmin_i = min(sorted(body), key=lambda i: V[i][1])
R['S4'] = dict(lowest_vertex_all=dict(idx=int(zmin_i), groups=grp_of[zmin_i], y_dm=float(V[zmin_i][1])),
               lowest_vertex_body=dict(idx=int(bmin_i), groups=grp_of[bmin_i], y_dm=float(V[bmin_i][1])))
perg = {g: round(float(V[sorted(s)][:, 1].min() * 0.1), 4) for g, s in groups.items() if not g.startswith('joint-')}
R['S4']['min_z_m_per_nonjoint_group'] = perg
ank_obj = V[sorted(groups['joint-l-ankle'])].mean(0)[1] * 0.1
R['S4']['ankle_obj_frame_z_m'] = round(float(ank_obj), 5)
R['S4']['ankle_above_body_min_cm_obj_frame'] = round(float((ank_obj - V[bmin_i][1] * 0.1) * 100), 2)
R['S4']['ankle_above_all_min_cm_obj_frame'] = round(float((ank_obj - V[zmin_i][1] * 0.1) * 100), 2)
R['S4']['ankle_above_body_min_cm_rig_ankle_z'] = round(float((-0.7486119866371155 - V[bmin_i][1] * 0.1) * 100), 2)
# tights/skirt: lowest vertices of helper-tights vs body
# S5
jg = V[sorted(groups['joint-ground'])]; R['S5'] = dict(joint_ground_centroid_obj=jg.mean(0).round(4).tolist(), joint_ground_centroid_rig_frame_m=(np.array([jg.mean(0)[0], -jg.mean(0)[2], jg.mean(0)[1]]) * 0.1).round(5).tolist(),
        root_default_head=[0, 0, 0], game_root_tail_verts=[19152, 19155], game_root_tail_groups=[grp_of[19152], grp_of[19155]])
json.dump(R, open(OUT + '/supplement_results.json', 'w'), indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
print('done')
