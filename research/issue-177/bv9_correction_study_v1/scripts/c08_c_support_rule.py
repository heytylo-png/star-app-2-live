#!/usr/bin/env python3
"""Apply the PRE-REGISTERED candidate-C support rule to data/baseline_mapping.json (no new measurement)."""
import json,os
NEW='/workspace/blendbro/out/bv9_correction_study_v1/'
O=json.load(open(NEW+'data/baseline_mapping.json'))['C_leg_offsets_variants']
res={}
for band in ['ankles/shins','knees','thighs']:
    info={}; ok=True
    for v in ['front','back']:
        vals=[]; 
        for var,b in O[v].items():
            for side in ['left','right']: vals.append((var,side,b[band][side]))
        neg=all(x<0 for _,_,x in vals); pos=all(x>0 for _,_,x in vals)
        mn=min(abs(x) for _,_,x in vals); worst=min(vals,key=lambda t:abs(t[2]))
        info[v]=dict(same_sign_all_variants=bool(neg or pos),sign='narrower' if neg else ('wider' if pos else 'mixed'),min_abs_mm=round(mn,3),weakest_variant=f'{worst[0]} / {worst[1]}',max_abs_mm=round(max(abs(x) for _,_,x in vals),3))
        ok&=bool((neg or pos) and mn>=0.5)
    info['side_view_signed_range_mm']=[round(min(b[band][s] for b in O['side'].values() for s in ['left','right']),2),round(max(b[band][s] for b in O['side'].values() for s in ['left','right']),2)]
    info['SUPPORTED_by_preregistered_rule']=ok
    res[band]=info
json.dump(res,open(NEW+'data/C_support_rule_result.json','w'),indent=1)
for k,v in res.items(): print(k,json.dumps(v))
