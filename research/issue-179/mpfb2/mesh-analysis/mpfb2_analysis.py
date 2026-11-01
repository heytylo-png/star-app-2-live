#!/usr/bin/env python3
"""MPFB2 mesh analysis (read-only). Implements METHOD_FROZEN.md. stdlib + numpy only.
Usage: python3 mpfb2_analysis.py <mpfb2_root> <outdir>"""
import json, sys, os, math, itertools, collections, csv
import numpy as np
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/research/reflib_v1/mpfb2'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
D = ROOT + '/src/mpfb/data'
R = {}   # results

# ---------- M1 parse
V = []; VT = []; counts = collections.Counter(); faces = []; fgroup = []; grp_segments = collections.Counter(); cur = None
with open(D + '/3dobjs/base.obj') as fh:
    for ln in fh:
        if not ln.strip() or ln[0] == '#': continue
        p = ln.split()
        t = p[0]; counts[t] += 1
        if t == 'v': V.append([float(x) for x in p[1:4]])
        elif t == 'vt': VT.append([float(x) for x in p[1:3]])
        elif t in ('g', 'o'):
            cur = p[1]; grp_segments[cur] += 1
        elif t == 'f':
            refs = [r.split('/') for r in p[1:]]
            faces.append(([int(r[0]) - 1 for r in refs], [int(r[1]) - 1 if len(r) > 1 and r[1] else -1 for r in refs]))
            fgroup.append(cur)
V = np.array(V); VT = np.array(VT); nv = len(V)
ar = collections.Counter(len(f[0]) for f in faces)
R['M1'] = dict(v=nv, vt=len(VT), f=len(faces), line_counts=dict(counts), face_arity={str(k): v for k, v in sorted(ar.items())},
               n_groups_distinct=len(grp_segments), n_group_segments=sum(grp_segments.values()),
               repeated_groups={k: v for k, v in grp_segments.items() if v > 1})
groups = collections.OrderedDict()  # name -> set of vertex idx
gfaces = collections.Counter()
for (vi, _), g in zip(faces, fgroup):
    groups.setdefault(g, set()).update(vi); gfaces[g] += 1
R['M1']['groups'] = {g: dict(faces=gfaces[g], verts=len(s), min_idx=min(s), max_idx=max(s)) for g, s in groups.items()}
body = groups['body']
# group-name families
fam = collections.Counter()
for g in groups: fam[g.split('-')[0] if g.startswith(('joint', 'helper')) else g] += 1
R['M1']['group_families'] = dict(fam)
allref = set().union(*groups.values())
# overlap between groups' vertex sets
ov = {}
names = list(groups)
for a in names:
    for b in names:
        if a < b and groups[a] & groups[b]:
            ov[a + '|' + b] = len(groups[a] & groups[b])
R['M1']['group_vertex_overlaps'] = ov
grp_of = collections.defaultdict(list)
for g, s in groups.items():
    for i in s: grp_of[i].append(g)
def fam_of(i):
    gs = grp_of.get(i)
    if not gs: return 'UNREFERENCED'
    return '+'.join(sorted(set('joint-*' if g.startswith('joint-') else g for g in gs)))

# ---------- M2 weights
def load_w(path): return json.load(open(path))['weights']
def load_rig(path):
    d = json.load(open(path)); return d.get('bones', d)
PAIRS = [('default', 'standard/weights.default.json', 'standard/rig.default.json'),
         ('game_engine', 'standard/weights.game_engine.json', 'standard/rig.game_engine.json'),
         ('rigify_human_toes', 'rigify/weights.human_toes.json', 'rigify/rig.human_toes.json')]
W = {}; M2 = {}; infl_csv = []
for name, wp, rp in PAIRS:
    w = load_w(D + '/rigs/' + wp); rig = load_rig(D + '/rigs/' + rp); W[name] = w
    sums = np.zeros(nv); n_all = np.zeros(nv, int); n6 = np.zeros(nv, int); n3 = np.zeros(nv, int); seen = np.zeros(nv, bool)
    idxs = []; dup = 0; oor = 0; entries = 0; zero_entries = 0; bones_empty = 0
    for b, lst in w.items():
        if not lst: bones_empty += 1
        s = set()
        for i, x in lst:
            entries += 1
            if i in s: dup += 1
            s.add(i)
            if i < 0 or i >= nv: oor += 1; continue
            idxs.append(i); sums[i] += x; n_all[i] += 1; seen[i] = True
            if x > 1e-6: n6[i] += 1
            if x > 1e-3: n3[i] += 1
            if x == 0: zero_entries += 1
    wv = seen
    ws = sums[wv]
    unw = np.where(~wv)[0]
    inflinfo = {}
    for lab, arr in (('all_entries', n_all), ('w>1e-6', n6), ('w>1e-3', n3)):
        inflinfo[lab] = dict(max=int(arr[wv].max()), mean_over_weighted=round(float(arr[wv].mean()), 4), mean_over_all_nv=round(float(arr.sum() / nv), 4),
                             histogram={int(k): int(v) for k, v in zip(*np.unique(arr[wv], return_counts=True))})
    wb = collections.Counter(fam_of(int(i)) for i in np.where(wv)[0])
    ub = collections.Counter(fam_of(int(i)) for i in unw)
    M2[name] = dict(bones_in_weights=len(w), bones_empty=bones_empty, entries=entries, max_index=int(max(idxs)), min_index=int(min(idxs)),
                    unique_indices_weighted=int(wv.sum()), out_of_range=oor, duplicate_bone_idx_pairs=dup, zero_weight_entries=zero_entries,
                    unweighted_vertices=int(len(unw)), weighted_by_obj_group=dict(wb), unweighted_by_obj_group=dict(ub),
                    unweighted_index_range=[int(unw.min()), int(unw.max())] if len(unw) else None,
                    wsum=dict(min=round(float(ws.min()), 6), max=round(float(ws.max()), 6), mean=round(float(ws.mean()), 6),
                              within_1em3_of_1=int((abs(ws - 1) <= 1e-3).sum()), gt_1_001=int((ws > 1.001).sum()), lt_0_999=int((ws < 0.999).sum()), zero=int((ws == 0).sum())),
                    influences=inflinfo,
                    bones_in_rig=len(rig), weight_bones_not_in_rig=sorted(set(w) - set(rig)), rig_bones_not_in_weights=sorted(set(rig) - set(w)))
    R_ = M2[name]
    for b, lst in w.items(): infl_csv.append((name, b, len(lst), round(sum(x for _, x in lst), 4)))
R['M2'] = M2
with open(OUT + '/bone_vertex_counts.csv', 'w', newline='') as fh:
    c = csv.writer(fh); c.writerow(['weightfile', 'bone', 'n_entries', 'sum_of_weights']); c.writerows(infl_csv)

# ---------- M3 topology
def topo(face_list):
    ed = collections.Counter(); ded = collections.Counter(); nb = collections.defaultdict(set); par = {}
    def find(x):
        while par.setdefault(x, x) != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    for vi in face_list:
        k = len(vi)
        for a in range(k):
            p, q = vi[a], vi[(a + 1) % k]
            ed[(min(p, q), max(p, q))] += 1; ded[(p, q)] += 1; nb[p].add(q); nb[q].add(p)
            rp, rq = find(p), find(q)
            if rp != rq: par[rp] = rq
    ref = set(nb)
    for vi in face_list:
        for i in vi: find(i)
    comps = collections.Counter(find(i) for i in ref)
    ec = collections.Counter(ed.values())
    val = collections.Counter(len(nb[i]) for i in ref)
    return dict(referenced_vertices=len(ref), unique_edges=len(ed), edge_face_count={str(k): v for k, v in sorted(ec.items())},
                boundary_edges=ec.get(1, 0), nonmanifold_edges=sum(v for k, v in ec.items() if k >= 3),
                inconsistent_winding_edges=sum(1 for v in ded.values() if v > 1),
                components=len(comps), component_sizes_top=sorted(comps.values(), reverse=True)[:12],
                valence_hist={str(k): v for k, v in sorted(val.items())},
                poles=dict(v3=val.get(3, 0), v5=val.get(5, 0), v6plus=sum(v for k, v in val.items() if k >= 6), v4=val.get(4, 0), v_le2=sum(v for k, v in val.items() if k <= 2))), nb
all_faces = [f[0] for f in faces]
body_faces = [f[0] for f, g in zip(faces, fgroup) if g == 'body']
T_all, _ = topo(all_faces); T_body, nb_body = topo(body_faces)
R['M3'] = dict(whole=T_all, body=T_body)
R['M3']['unreferenced_vertices_whole'] = nv - len(allref)
per = {}
fl_by_g = collections.defaultdict(list)
for f, g in zip(faces, fgroup): fl_by_g[g].append(f[0])
for g, fl in fl_by_g.items():
    t, _ = topo(fl); per[g] = dict(faces=len(fl), verts=t['referenced_vertices'], components=t['components'], boundary_edges=t['boundary_edges'], nonmanifold=t['nonmanifold_edges'], arity=dict(collections.Counter(len(x) for x in fl)))
R['M3']['per_group'] = per
# UV
uvfaces = sum(1 for f in faces if all(t >= 0 for t in f[1]))
pairs = set(); 
for vi, ti in faces:
    for a, b in zip(vi, ti): pairs.add((a, b))
bv = sorted(i for i in body)
body_pairs = set((a, b) for vi, ti in (f for f, g in zip(faces, fgroup) if g == 'body') for a, b in zip(vi, ti))
R['M3']['uv'] = dict(vt_count=len(VT), faces_with_uv=uvfaces, faces=len(faces), unique_v_vt_pairs=len(pairs), v_referenced=len(allref),
                     uv_split_extra=len(pairs) - len(allref), body_unique_pairs=len(body_pairs), body_verts=len(body),
                     uv_range=[VT.min(0).round(4).tolist(), VT.max(0).round(4).tolist()],
                     uv_outside_0_1=int(((VT < 0) | (VT > 1)).any(1).sum()))
# bounding boxes (OBJ units)
def bb(idx):
    a = V[sorted(idx)]; return dict(min=a.min(0).round(4).tolist(), max=a.max(0).round(4).tolist())
R['M3']['bbox_obj_units'] = dict(body=bb(body), whole=bb(allref), index_range_body=[min(body), max(body)])
# Symmetry
bi = np.array(sorted(body)); P = V[bi]; M = P * np.array([-1, 1, 1])
dmin = np.empty(len(P)); arg = np.empty(len(P), int)
for s in range(0, len(P), 1024):
    d = ((M[s:s + 1024, None, :] - P[None, :, :]) ** 2).sum(2)
    arg[s:s + 1024] = d.argmin(1); dmin[s:s + 1024] = np.sqrt(d.min(1))
tol = {str(t): int((dmin <= t).sum()) for t in (1e-4, 1e-3, 1e-2, 1e-1)}
self_pair = int((bi[arg] == bi).sum())
R['M3']['symmetry_x_body'] = dict(n=len(P), within=tol, max_residual=round(float(dmin.max()), 5), median_residual=round(float(np.median(dmin)), 6),
                                  mean_residual=round(float(dmin.mean()), 6), centre_line_abs_x_le_1em4=int((abs(P[:, 0]) <= 1e-4).sum()),
                                  nearest_is_self=self_pair, bbox_x=[round(float(P[:, 0].min()), 4), round(float(P[:, 0].max()), 4)],
                                  x_mean_of_body=round(float(P[:, 0].mean()), 6))
# is the mirror map an involution (index pairing)?
mp = dict(zip(bi.tolist(), bi[arg].tolist()))
R['M3']['symmetry_x_body']['mirror_map_involution_count'] = sum(1 for a, b in mp.items() if mp[b] == a)
R['M3']['symmetry_x_body']['n_unique_targets'] = len(set(mp.values()))
worst = np.argsort(-dmin)[:10]
R['M3']['symmetry_x_body']['worst10'] = [dict(idx=int(bi[i]), resid=round(float(dmin[i]), 5)) for i in worst]
# per-vertex mirror residual by 1-based group symmetry for L/R joint groups (joint-l-* vs joint-r-*)
jl = [g for g in groups if g.startswith('joint-l-')]; jr_missing = [g for g in jl if 'joint-r-' + g[8:] not in groups]
R['M3']['lr_joint_groups'] = dict(l=len(jl), r=len([g for g in groups if g.startswith('joint-r-')]), l_without_r_counterpart=jr_missing)
jres = []
for g in jl:
    h = 'joint-r-' + g[8:]
    if h in groups:
        a = V[sorted(groups[g])].mean(0); b = V[sorted(groups[h])].mean(0) * np.array([-1, 1, 1])
        jres.append(float(np.linalg.norm(a - b)))
R['M3']['lr_joint_groups']['mirror_centroid_residual_max'] = round(max(jres), 5) if jres else None
R['M3']['lr_joint_groups']['mirror_centroid_residual_mean'] = round(float(np.mean(jres)), 6) if jres else None

# ---------- M4/M5 joints
RIGS = {'default': 'standard/rig.default.json', 'game_engine': 'standard/rig.game_engine.json', 'rigify_human': 'rigify/rig.human.json', 'rigify_human_toes': 'rigify/rig.human_toes.json'}
M4 = {}; used_cubes = {}; vref = collections.defaultdict(set)
rows = []
def recon(spec):
    s = spec['strategy']
    if s == 'CUBE':
        g = spec['cube_name']
        return V[sorted(groups[g])].mean(0) if g in groups else None
    if s == 'VERTEX': return V[spec['vertex_index']]
    if s == 'MEAN': return V[spec['vertex_indices']].mean(0)
    return None
for rn, rp in RIGS.items():
    rig = load_rig(D + '/rigs/' + rp); c = collections.Counter(); cubes = set(); vi_groups = collections.Counter(); miss = set(); vmax = -1
    for b, x in rig.items():
        for e in ('head', 'tail'):
            sp = x.get(e)
            if not sp: continue
            c[(e, sp['strategy'])] += 1
            if sp['strategy'] == 'CUBE':
                cubes.add(sp['cube_name'])
                if sp['cube_name'] not in groups: miss.add(sp['cube_name'])
            if sp['strategy'] == 'VERTEX':
                ids = [sp['vertex_index']]
            elif sp['strategy'] == 'MEAN': ids = sp['vertex_indices']
            else: ids = []
            for i in ids:
                vmax = max(vmax, i); vi_groups[fam_of(i)] += 1
            rows.append((rn, b, e, sp['strategy'], sp.get('cube_name', ''), (json.dumps(sp['vertex_index']) if 'vertex_index' in sp else (json.dumps(sp['vertex_indices']) if 'vertex_indices' in sp else '')), sp.get('default_position')))
    M4[rn] = dict(bones=len(rig), strategies={f'{e}:{s}': n for (e, s), n in sorted(c.items())}, distinct_cube_groups=len(cubes), cube_groups_missing_in_obj=sorted(miss),
                  vertex_refs_by_obj_group=dict(vi_groups), max_vertex_index_referenced=vmax)
    used_cubes[rn] = cubes
cube_info = {}
for g in groups:
    if g.startswith('joint-'):
        s = groups[g]; cube_info[g] = dict(n=len(s), min=min(s), max=max(s), shared_with_body=len(s & body), faces=gfaces[g])
jn = [v['n'] for v in cube_info.values()]
M4['joint_groups_in_obj'] = dict(count=len(cube_info), n_verts_hist={str(k): v for k, v in sorted(collections.Counter(jn).items())},
                                 total_joint_verts=sum(jn), shared_with_body_total=sum(v['shared_with_body'] for v in cube_info.values()),
                                 index_range=[min(v['min'] for v in cube_info.values()), max(v['max'] for v in cube_info.values())],
                                 all_cube_faces_nonquad=[g for g in cube_info if any(len(f) != 4 for f, gg in zip(all_faces, fgroup) if gg == g)][:5])
M4['joint_groups_used_by_any_rig'] = len(set().union(*used_cubes.values()))
M4['joint_groups_unused_by_any_rig'] = sorted(set(cube_info) - set().union(*used_cubes.values()))
R['M4'] = M4
with open(OUT + '/joint_specs.csv', 'w', newline='') as fh:
    c = csv.writer(fh); c.writerow(['rig', 'bone', 'end', 'strategy', 'cube_name', 'vertex_idx']); c.writerows(r_[:6] for r_ in rows)
with open(OUT + '/joint_groups.csv', 'w', newline='') as fh:
    c = csv.writer(fh); c.writerow(['group', 'n_verts', 'min_idx', 'max_idx', 'shared_with_body', 'faces'])
    for g, v in cube_info.items():
        cen = V[sorted(groups[g])].mean(0); c.writerow([g, v['n'], v['min'], v['max'], v['shared_with_body'], v['faces']])

# M5: fit
src = []; dst = []; kinds = []
for rn in ('default', 'game_engine'):
    rig = load_rig(D + '/rigs/' + RIGS[rn])
    for b, x in rig.items():
        for e in ('head', 'tail'):
            sp = x[e]; p = recon(sp)
            if p is None or 'default_position' not in sp: continue
            src.append(p); dst.append(sp['default_position']); kinds.append((rn, b, e, sp['strategy']))
src = np.array(src); dst = np.array(dst)
def fit(perm, sign):
    A = src[:, perm] * np.array(sign)
    # fit dst = s*A + t
    Ac = A - A.mean(0); Dc = dst - dst.mean(0)
    s = (Ac * Dc).sum() / (Ac * Ac).sum()
    t = dst.mean(0) - s * A.mean(0)
    res = np.linalg.norm(s * A + t - dst, axis=1)
    return s, t, res
cands = []
for perm in itertools.permutations(range(3)):
    for sign in itertools.product([1, -1], repeat=3):
        s, t, res = fit(list(perm), sign)
        if s > 0: cands.append((float(np.sqrt((res ** 2).mean())), perm, sign, s, t, res))
cands.sort(key=lambda x: x[0])
best = cands[0]
R['M5'] = dict(n_points=len(src), best=dict(perm=best[1], sign=best[2], scale=round(best[3], 6), translation=best[4].round(6).tolist(), rmse=round(best[0], 8), max_resid=round(float(best[5].max()), 8)),
               second_best=dict(perm=cands[1][1], sign=cands[1][2], rmse=round(cands[1][0], 6)), n_candidates_positive_scale=len(cands))
# specific hypothesis rig=(x,-z,y)*0.1
H = np.stack([src[:, 0], -src[:, 2], src[:, 1]], 1) * 0.1
r = np.linalg.norm(H - dst, axis=1)
R['M5']['hypothesis_x_negz_y_times_0.1'] = dict(rmse=round(float(np.sqrt((r ** 2).mean())), 8), max=round(float(r.max()), 8), n_within_1em4=int((r < 1e-4).sum()), n_within_1em3=int((r < 1e-3).sum()), n=len(r))
by = collections.defaultdict(list)
for k, rr in zip(kinds, r): by[k[3]].append(float(rr))
R['M5']['hypothesis_resid_by_strategy'] = {k: dict(n=len(v), max=round(max(v), 8), mean=round(float(np.mean(v)), 8)) for k, v in by.items()}
bad = [(kinds[i], float(r[i])) for i in np.argsort(-r)[:8]]
R['M5']['worst8'] = [dict(rig=k[0], bone=k[1], end=k[2], strat=k[3], resid=round(v, 6)) for k, v in bad]
def to_rig(p): return np.array([p[0], -p[2], p[1]]) * 0.1
# M6
rigd = load_rig(D + '/rigs/standard/rig.default.json'); rigg = load_rig(D + '/rigs/standard/rig.game_engine.json')
def bone_geom(rig, name):
    b = rig[name]; h = np.array(b['head']['default_position']); t = np.array(b['tail']['default_position'])
    hr = recon(b['head']); tr = recon(b['tail'])
    out = dict(head=h.round(5).tolist(), tail=t.round(5).tolist(), length=round(float(np.linalg.norm(t - h)), 5),
               pitch_deg=round(math.degrees(math.atan2(-(t[2] - h[2]), math.hypot(t[0] - h[0], t[1] - h[1]))), 3))
    if hr is not None and tr is not None:
        hh = to_rig(hr); tt = to_rig(tr)
        out['obj_recon_length'] = round(float(np.linalg.norm(tt - hh)), 5)
        out['obj_recon_pitch_deg'] = round(math.degrees(math.atan2(-(tt[2] - hh[2]), math.hypot(tt[0] - hh[0], tt[1] - hh[1]))), 3)
    return out
M6 = {}
M6['bone_names_foot_like_default'] = [n for n in rigd if 'foot' in n.lower() or 'ball' in n.lower() or 'toe' in n.lower()][:12]
M6['bone_names_foot_like_game'] = [n for n in rigg if 'foot' in n.lower() or 'ball' in n.lower() or 'toe' in n.lower()]
for rn, rig, names in (('default', rigd, ['foot.L', 'toe1-1.L', 'toe2-1.L', 'toe3-1.L']), ('game', rigg, ['foot_l', 'ball_l'])):
    for n in names:
        if n in rig: M6[f'{rn}:{n}'] = bone_geom(rig, n)
# ankle / ball z
ank = V[sorted(groups['joint-l-ankle'])].mean(0); ball = V[sorted(groups['joint-l-foot-1'])].mean(0)
M6['ankle_z_rig'] = round(rigg['foot_l']['head']['default_position'][2], 5); M6['ball_z_rig'] = round(rigg['ball_l']['head']['default_position'][2], 5)
M6['ankle_z_obj_recon_m'] = round(float(to_rig(ank)[2]), 5); M6['ball_z_obj_recon_m'] = round(float(to_rig(ball)[2]), 5)
M6['ankle_minus_ball_z_cm'] = round((M6['ankle_z_rig'] - M6['ball_z_rig']) * 100, 2)
# sole
bz = to_rig(V[bi].T if False else V[bi].mean(0))  # placeholder not used
Zb = V[bi][:, 1] * 0.1; Zall = V[sorted(allref)][:, 1] * 0.1
gw = W['game_engine']
dom = {}
best_w = np.zeros(nv); best_b = [None] * nv
for b, lst in gw.items():
    for i, x in lst:
        if x > best_w[i]: best_w[i] = x; best_b[i] = b
left_idx = [i for i in range(nv) if best_b[i] in ('foot_l', 'ball_l') and i in body]
M6['sole'] = dict(body_min_z_m=round(float(Zb.min()), 5), all_min_z_m=round(float(Zall.min()), 5), n_left_foot_verts=len(left_idx),
                  left_foot_min_z_m=round(float(V[left_idx][:, 1].min() * 0.1), 5), left_foot_x_range_m=[round(float(V[left_idx][:, 0].min() * 0.1), 4), round(float(V[left_idx][:, 0].max() * 0.1), 4)],
                  joint_ground_z_m=round(float(to_rig(V[sorted(groups['joint-ground'])].mean(0))[2]), 5))
a = M6['ankle_z_rig']
M6['ankle_height_above_cm'] = dict(body_min=round((a - M6['sole']['body_min_z_m']) * 100, 2), all_min=round((a - M6['sole']['all_min_z_m']) * 100, 2),
                                   left_foot_min=round((a - M6['sole']['left_foot_min_z_m']) * 100, 2), joint_ground=round((a - M6['sole']['joint_ground_z_m']) * 100, 2))
# sole slope: lowest z per y-bin (rig frame y = -obj z)
LF = V[left_idx]; yy = -LF[:, 2] * 0.1; zz = LF[:, 1] * 0.1
bins = np.linspace(yy.min(), yy.max(), 13); xs = []; zs = []
for lo, hi in zip(bins[:-1], bins[1:]):
    m = (yy >= lo) & (yy <= hi)
    if m.sum(): k = np.argmin(np.where(m, zz, 9)); xs.append(float(yy[k])); zs.append(float(zz[k]))
sl = np.polyfit(xs, zs, 1)
M6['sole']['lowest_per_ybin'] = [[round(a_, 4), round(b_, 4)] for a_, b_ in zip(xs, zs)]
M6['sole']['slope_deg_fit_all_bins'] = round(math.degrees(math.atan(sl[0])), 2)
# restrict to central bins (exclude heel round-off & toe tip: bins 2..9)
if len(xs) > 8:
    sl2 = np.polyfit(xs[2:10], zs[2:10], 1); M6['sole']['slope_deg_fit_central_bins'] = round(math.degrees(math.atan(sl2[0])), 2)
M6['sole']['front_back_z_range_cm'] = [round((max(zs) - min(zs)) * 100, 2), round((max(xs) - min(xs)) * 100, 2)]
# sole polyline z at heel vs ball
R['M6'] = M6
# weights-based stats for claims
c1 = {n: R['M2'][n]['unique_indices_weighted'] if 'unique_indices_weighted' in R['M2'][n] else None for n in M2}
R['M6_claim_numbers'] = dict(weighted_verts={n: M2[n]['unique_indices_weighted'] for n in M2}, bones={'default': len(rigd), 'game': len(rigg)},
                             max_infl={n: {k: v['max'] for k, v in M2[n]['influences'].items()} for n in M2},
                             mean_infl={n: {k: v['mean_over_weighted'] for k, v in M2[n]['influences'].items()} for n in M2})
json.dump(R, open(OUT + '/results.json', 'w'), indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
print('done')
