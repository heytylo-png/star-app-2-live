#!/usr/bin/env python3
"""Verify candidate integrity vs bv9: topology/weights/materials/modifiers unchanged, which verts moved, new intersections (BVH pair sets)."""
import numpy as np, json
N='/workspace/blendbro/out/bv9_correction_study_v1/'
B=np.load(N+'work/bv9_base_weights.npz'); G0=np.load(N+'work/bv9_geom_rerun.npz')
names=[str(x) for x in B['names']]
OUT={}
b0=np.load(N+'work/bvh_bv9_copy.npz'); P0={tuple(p) for p in b0['pairs'].tolist()}
dom=np.array(names)[B['W'].argmax(1)]; has=(B['W'].sum(1)>0)
def tri_group(t): 
    g=[dom[i] if has[i] else 'none' for i in t]; return g
for c,nm in [('A','A_arm_hand'),('B','B_foot'),('B1','B1_foot_ytrans')]:
    W=np.load(N+f'work/weights_{nm}.npz'); G=np.load(N+f'work/geom_{nm}.npz')
    ins0=json.load(open(N+'data/bv9_inspect_baseline.json')); ins=json.load(open(N+f'data/inspect_s02_{nm}.json'))
    o=ins0['objects']; p=ins['objects']
    def key(o_): return [(x['name'],x.get('mesh',{}).get('verts'),x.get('mesh',{}).get('edges'),x.get('mesh',{}).get('faces'),x.get('mesh',{}).get('loops'),x.get('mesh',{}).get('shape_keys'),x.get('mesh',{}).get('vertex_groups'),x.get('mesh',{}).get('materials'),[m['name']+m['type'] for m in x['modifiers']],x.get('components'),x.get('topology')) for x in o_]
    mv=np.linalg.norm(W['co_mm']-B['co_mm'],axis=1)
    r=dict(edges_identical=bool(np.array_equal(W['edges'],B['edges'])),weights_identical=bool(np.array_equal(W['W'],B['W'])),group_names_identical=bool(list(W['names'])==list(B['names'])),
       counts_components_modifiers_materials_shapekeys_identical=bool(key(o)==key(p)),tris_identical=bool(np.array_equal(G['tris'],G0['tris'])),mat_identical=bool(np.array_equal(G['mat'],G0['mat'])),
       n_moved_gt_1e3mm=int((mv>1e-3).sum()),max_move_mm=float(mv.max()),
       bones_identical=bool(np.array_equal(W['bone_ht'],B['bone_ht'])),bbox_before=[G0['verts'].min(0).tolist(),G0['verts'].max(0).tolist()],bbox_after=[G['verts'].min(0).tolist(),G['verts'].max(0).tolist()])
    # moved vertices by dominant group
    mg={}
    for gname in set(dom[mv>1e-3]): mg[gname]=int(((dom==gname)&(mv>1e-3)).sum())
    r['moved_verts_by_dominant_group']=mg
    r['moved_verts_with_zero_weight_all_groups']=int(((mv>1e-3)&(~has)).sum())
    b1=np.load(N+f'work/bvh_bv9_candidate_{nm}.npz'); P1={tuple(p) for p in b1['pairs'].tolist()}
    new=sorted(P1-P0); gone=sorted(P0-P1); tr=b1['tris']
    cat={}
    for a,b in new:
        k=tuple(sorted({tri_group(tr[a])[0],tri_group(tr[b])[0]})); cat['|'.join(k)]=cat.get('|'.join(k),0)+1
    r['bvh']=dict(baseline_pairs=len(P0),candidate_pairs=len(P1),new_pairs=len(new),removed_pairs=len(gone),new_pairs_by_dominant_groups=dict(sorted(cat.items(),key=lambda kv:-kv[1])[:15]))
    if new:
        vv=np.unique(tr[np.array(new).reshape(-1)].reshape(-1)); co=b1['co'][vv]*1000
        r['bvh']['new_pair_vertex_bbox_mm']=[co.min(0).round(2).tolist(),co.max(0).round(2).tolist()]
    OUT[c]=r
json.dump(OUT,open(N+'data/candidate_integrity.json','w'),indent=1)
print(json.dumps(OUT,indent=1)[:5000])
