#!/usr/bin/env python3
"""POST-FREEZE small checks (read-only): MEAN arity, extra_bones membership, VERTEX/MEAN head refs by OBJ group (default rig)."""
import json, sys, collections
OUT = sys.argv[2]; ROOT = sys.argv[1]; D = ROOT + '/src/mpfb/data'
exec(open(OUT + '/_common.py').read())
def fam(i): return grp_of[i][0] if i in grp_of else '?'
res = {}
for rn, p in (('default', 'standard/rig.default.json'), ('game_engine', 'standard/rig.game_engine.json'), ('rigify_human_toes', 'rigify/rig.human_toes.json')):
    d = json.load(open(D + '/rigs/' + p)); rig = d.get('bones', d)
    ar = collections.Counter(); hv = collections.Counter(); hm = collections.Counter()
    for b, x in rig.items():
        for e in ('head', 'tail'):
            sp = x[e]
            if sp['strategy'] == 'MEAN': ar[(e, len(sp['vertex_indices']))] += 1
        sp = x['head']
        if sp['strategy'] == 'VERTEX': hv[fam(sp['vertex_index'])] += 1
        if sp['strategy'] == 'MEAN': hm['+'.join(sorted(set(fam(i) for i in sp['vertex_indices'])))] += 1
    res[rn] = dict(mean_arity={f'{e}:{n}': c for (e, n), c in ar.items()}, head_vertex_by_group=dict(hv), head_mean_by_group=dict(hm), extra_bones=d.get('extra_bones'))
wb = set(W['rigify_human_toes']); rb = set(json.load(open(D + '/rigs/rigify/rig.human_toes.json'))['bones'])
ex = set(res['rigify_human_toes']['extra_bones'] or [])
res['rigify_weight_bones_not_in_bones'] = dict(total=len(wb - rb), in_extra_bones=sorted((wb - rb) & ex), neither=sorted(wb - rb - ex))
# rigify frame check (VERTEX joints only, no helper-cube bias): median(default_position - OBJ-derived rig-frame position)
import numpy as np
fr = {}
for rn, p in (('default', 'standard/rig.default.json'), ('rigify_human_toes', 'rigify/rig.human_toes.json')):
    d = json.load(open(D + '/rigs/' + p)); rig = d.get('bones', d); off = []
    for b, x in rig.items():
        for e in ('head', 'tail'):
            sp = x[e]
            if sp['strategy'] == 'VERTEX' and 'default_position' in sp:
                v = V[sp['vertex_index']]; h = np.array([v[0], -v[2], v[1]]) * 0.1
                off.append(np.array(sp['default_position']) - h - np.array(sp.get('offset', [0, 0, 0])))
    off = np.array(off)
    fr[rn] = dict(n=len(off), median_xyz_m=np.median(off, 0).round(4).tolist(), p5_xyz=np.percentile(off, 5, 0).round(4).tolist(), p95_xyz=np.percentile(off, 95, 0).round(4).tolist())
res['frame_offset_VERTEX_joints'] = fr
json.dump(res, open(OUT + '/extra_check_results.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != 'rigify_human_toes' or True}, indent=0)[:3500])
