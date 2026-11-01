"""Task 4a/5: weight-file structure + per-bone / per-vertex influence statistics for the 3 weight files."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from common import *
NB = 13380
verts, faces, fgroup, groups, order = parse_obj()
NV = len(verts)
out = {}
for rig, path in WEIGHTS.items():
    wj = load_json(path); ws = wj["weights"]
    rigb = bones_of(load_json(RIGS[rig]))
    mask_groups = [b for b in ws if b.startswith("mhmask")]          # non-bone mask vertex groups (rigify file only)
    mask_info = {b: dict(n_vertices=len(ws[b]), w_min=min((x for _, x in ws[b]), default=None), w_max=max((x for _, x in ws[b]), default=None)) for b in mask_groups}
    bone_names = [b for b in ws if b not in mask_groups]               # everything below is DEFORM-bone weights only
    nB = len(bone_names)
    # sparse -> arrays
    vi = []; bi = []; w = []
    for k, b in enumerate(bone_names):
        for i, x in ws[b]:
            vi.append(i); bi.append(k); w.append(x)
    vi = np.array(vi); bi = np.array(bi); w = np.array(w)
    sums = np.bincount(vi, weights=w, minlength=NV)
    cnt = np.bincount(vi, minlength=NV)
    cnt_gt = lambda th: np.bincount(vi[w > th], minlength=NV)
    dup = len(vi) - len(set(zip(vi.tolist(), bi.tolist())))
    body = np.arange(NB)
    def hist(c):
        h = collections.Counter(c.tolist()); return {int(k): int(v) for k, v in sorted(h.items())}
    info = dict(
        meta={k: wj[k] for k in ("name", "license", "version", "copyright", "description")},
        n_bones_in_weight_file=nB, mask_groups_excluded=mask_info, n_entries=int(len(vi)), duplicate_vertex_bone_pairs=int(dup),
        weight_min=float(w.min()), weight_max=float(w.max()), weight_mean=float(w.mean()),
        n_entries_below_0p001=int((w < 1e-3).sum()), n_entries_below_0p01=int((w < 1e-2).sum()), n_entries_nonpositive=int((w <= 0).sum()),
        n_entries_above_1=int((w > 1 + 1e-6).sum()),
        vertices_with_weights=int((cnt > 0).sum()), vertices_without_any_weight=[int(i) for i in np.where(cnt == 0)[0]][:50],
        n_vertices_without_any_weight=int((cnt == 0).sum()),
        body_vertices_without_weight=int((cnt[:NB] == 0).sum()),
        weight_sum_per_vertex=dict(min=float(sums[cnt > 0].min()), max=float(sums[cnt > 0].max()), mean=float(sums[cnt > 0].mean()),
                                   n_within_0p001_of_1=int((np.abs(sums[cnt > 0] - 1) < 1e-3).sum()), n_vertices=int((cnt > 0).sum()),
                                   n_below_0p999=int((sums[cnt > 0] < 0.999).sum()), n_above_1p001=int((sums[cnt > 0] > 1.001).sum())),
        influences_all_vertices=dict(mean=float(cnt[cnt > 0].mean()), max=int(cnt.max()), hist=hist(cnt[cnt > 0])),
        influences_body_vertices=dict(mean=float(cnt[:NB].mean()), max=int(cnt[:NB].max()), hist=hist(cnt[:NB])),
        influences_gt_0p01_body=dict(mean=float(cnt_gt(0.01)[:NB].mean()), max=int(cnt_gt(0.01)[:NB].max()), hist=hist(cnt_gt(0.01)[:NB])),
        pct_body_vertices_single_influence=float((cnt[:NB] == 1).mean() * 100),
        pct_body_vertices_le4_influences=float((cnt[:NB] <= 4).mean() * 100),
        # per mesh part
        by_part={},
        bones_in_weights_not_in_rig_json=sorted(set(bone_names) - set(rigb)),
        rig_bones_without_weights=sorted(set(rigb) - set(ws)),
        vertex_index_range=[int(vi.min()), int(vi.max())],
    )
    parts = {"body": np.arange(NB), "helper-tongue": groups["helper-tongue"], "helper-tights": groups["helper-tights"],
             "helper-skirt": groups["helper-skirt"], "helper-hair": groups["helper-hair"],
             "eyes_teeth_lashes_genital": np.unique(np.concatenate([groups[k] for k in groups if k.startswith("helper-") and k.split("-")[1] in ("l", "r", "upper", "lower", "genital")])),
             "joint_cubes": np.unique(np.concatenate([groups[k] for k in groups if k.startswith("joint-")]))}
    for pn, ix in parts.items():
        info["by_part"][pn] = dict(n=int(len(ix)), unweighted=int((cnt[ix] == 0).sum()), mean_infl=float(cnt[ix].mean()), max_infl=int(cnt[ix].max()),
                                   weight_sum_min=float(sums[ix].min()), weight_sum_max=float(sums[ix].max()))
    out[rig] = info
    # per-bone CSV
    rows = []
    for k, b in enumerate(bone_names):
        m = bi == k; wv = w[m]; vv = vi[m]
        if not len(wv):
            rows.append([b, 0, 0, '', '', '', 0, 0, 0, b in rigb]); continue
        rows.append([b, int(m.sum()), int((vv < NB).sum()), round(float(wv.min()), 5), round(float(wv.max()), 5), round(float(wv.mean()), 5),
                     round(float(wv.sum()), 4), int((wv >= 0.99).sum()), int((wv < 0.05).sum()), b in rigb])
    write_csv(f"weights_per_bone_{rig}.csv", ["bone", "n_vertices", "n_body_vertices", "w_min", "w_max", "w_mean", "w_sum", "n_w_ge_0.99", "n_w_lt_0.05", "in_rig_json"], rows)
    # per-vertex influence histogram CSV
    write_csv(f"weights_influence_hist_{rig}.csv", ["n_influences", "n_body_vertices", "n_all_vertices"],
              [[k, hist(cnt[:NB]).get(k, 0), hist(cnt[cnt > 0]).get(k, 0)] for k in range(0, int(cnt.max()) + 1)])
write_json("weights_summary.json", out)
for r, i in out.items():
    print(r, {k: i[k] for k in ("n_bones_in_weight_file", "n_entries", "weight_min", "weight_max", "n_vertices_without_any_weight", "body_vertices_without_weight", "weight_sum_per_vertex", "pct_body_vertices_single_influence", "pct_body_vertices_le4_influences", "bones_in_weights_not_in_rig_json", "rig_bones_without_weights")})
    print('   body infl', {k: v for k, v in i['influences_body_vertices'].items() if k != 'hist'}, i['influences_body_vertices']['hist'])
    print('   by_part', i['by_part'])
