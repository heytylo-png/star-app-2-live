#!/usr/bin/env python3
"""Apply the PRE-REGISTERED rules (CORRECTION_STUDY_PREREGISTRATION_FROZEN.md, AMENDMENT_B1_FROZEN.md) to the measurements. Writes data/verdicts.json."""
import json,numpy as np
N='/workspace/blendbro/out/bv9_correction_study_v1/'
M1=json.load(open(N+'data/measure_run1.json')); M2=json.load(open(N+'data/measure_run2.json'))
B1a=json.load(open(N+'data/measure_b1_run1.json')); B1b=json.load(open(N+'data/measure_b1_run2.json'))
M1['B1']=B1a['B1']; M2['B1']=B1b['B1']
def flat(d,p=''):
    o={}
    if isinstance(d,dict):
        for k,v in d.items():
            if k=='seconds': continue
            o.update(flat(v,p+'/'+k))
    elif isinstance(d,list):
        for i,v in enumerate(d): o.update(flat(v,p+f'[{i}]'))
    elif isinstance(d,(int,float)): o[p]=d
    return o
f1,f2=flat(M1),flat(M2); assert set(f1)==set(f2); repro=max(abs(f1[k]-f2[k]) for k in f1)
INT=json.load(open(N+'data/candidate_integrity.json')); PEN=json.load(open(N+'data/penetration_A.json'))
VIEWS=['front','side','back']; MODES=['modeF','modeL']
base=M1['baseline']
INTENDED_BANDS={'A':['hips/crotch','waist/ribs'],'B':['feet','ankles/shins'],'B1':['feet','ankles/shins']}
def common_reg(k,mode):
    flags=[]
    for v in VIEWS:
        s=M1[k]['P'][v][mode]; b=base['P'][v][mode]
        if s['mean']-b['mean']>0.25: flags.append(f'{v}: mean +{s["mean"]-b["mean"]:.2f} mm (>0.25)')
        if s['p95']-b['p95']>0.5: flags.append(f'{v}: p95 +{s["p95"]-b["p95"]:.2f} mm (>0.5)')
        if s['max']-b['max']>1.0: flags.append(f'{v}: max +{s["max"]-b["max"]:.2f} mm (>1.0)')
        if b['frac_le_1.0mm']-s['frac_le_1.0mm']>0.03: flags.append(f'{v}: %<=1mm {100*s["frac_le_1.0mm"]:.1f} vs {100*b["frac_le_1.0mm"]:.1f} (drop>3 pts)')
        for bn,bs in s['bands'].items():
            if bn in INTENDED_BANDS[k]: continue
            bb=b['bands'][bn]
            if bs['sym_mean'] is None or bb['sym_mean'] is None: continue
            if bs['sym_mean']-bb['sym_mean']>0.5: flags.append(f'{v} band {bn}: sym mean {bb["sym_mean"]:.2f}->{bs["sym_mean"]:.2f} (>+0.5)')
            if bb['frac_le_1'] is not None and bs['frac_le_1'] is not None and bb['frac_le_1']-bs['frac_le_1']>0.10: flags.append(f'{v} band {bn}: %<=1mm {100*bb["frac_le_1"]:.0f}->{100*bs["frac_le_1"]:.0f} (drop>10 pts)')
    return flags
def zone(k,c,v,mode,zn): return M1[k][c][v][mode]['zones'][zn]['all']
W=np.load(N+'work/bv9_base_weights.npz'); names=[str(x) for x in W['names']]
OUT={'reproducibility_max_abs_diff_run1_vs_run2':repro,'candidates':{}}
for k in ['A','B','B1']:
    d={'intended':{},'regression':{}}
    for mode in MODES:
        reg=common_reg(k,mode); I=None
        if k=='A':
            dg={v:zone('baseline','P',v,mode,'gap_z25_80')['mean']-zone(k,'P',v,mode,'gap_z25_80')['mean'] for v in ['front','back']}
            I=all(x>=0.30 for x in dg.values()); d['intended'][mode]=dict(gap_zone_mean_decrease_mm=dg,improves=I,gap_zone_frac_le_1={v:[zone('baseline','P',v,mode,'gap_z25_80')['frac_le_1'],zone(k,'P',v,mode,'gap_z25_80')['frac_le_1']] for v in ['front','back']})
            if mode=='modeF':
                for v in ['front','back']:
                    a=M1[k]['P'][v][mode]['arm_outer_edge_z40_80']['mean_abs']; b=base['P'][v][mode]['arm_outer_edge_z40_80']['mean_abs']
                    if a-b>0.5: reg.append(f'{v}: arm outer-edge mean|offset| z40-80 {b:.2f}->{a:.2f} mm (>+0.5)')
            s=M1[k]['P']['side'][mode]['mean']-base['P']['side'][mode]['mean']
            if s>0.10: reg.append(f'side mean +{s:.2f} (>0.10)')
            for v in ['front','back']:
                a=zone(k,'P',v,mode,'hand_z15_45')['mean']; b=zone('baseline','P',v,mode,'hand_z15_45')['mean']
                if a-b>0.5: reg.append(f'{v}: hand zone z15-45 sym mean {b:.2f}->{a:.2f} (>+0.5)')
        else:
            fz=zone('baseline','P','side',mode,'foot_zlt-60')['mean']-zone(k,'P','side',mode,'foot_zlt-60')['mean']
            sd=base['P']['side'][mode]['sole_envelope']['mean_abs_dz']-M1[k]['P']['side'][mode]['sole_envelope']['mean_abs_dz']
            I=(fz>=1.0 and sd>=2.0); d['intended'][mode]=dict(side_foot_zone_mean_decrease_mm=fz,sole_envelope_mean_abs_dz_decrease_mm=sd,sole_env_before_after=[base['P']['side'][mode]['sole_envelope']['mean_abs_dz'],M1[k]['P']['side'][mode]['sole_envelope']['mean_abs_dz']],improves=I,
                  foot_zone_before_after=[zone('baseline','P','side',mode,'foot_zlt-60')['mean'],zone(k,'P','side',mode,'foot_zlt-60')['mean']])
            for v in ['front','back']:
                a=zone(k,'P',v,mode,'foot_zlt-60')['mean']; b=zone('baseline','P',v,mode,'foot_zlt-60')['mean']
                if a-b>0.5: reg.append(f'{v}: foot zone z<-60 sym mean {b:.2f}->{a:.2f} (>+0.5)')
            a=zone(k,'P','side',mode,'ankle_z-75_-55')['mean']; b=zone('baseline','P','side',mode,'ankle_z-75_-55')['mean']
            if a-b>0.5: reg.append(f'side ankle zone z-75..-55 sym mean {b:.2f}->{a:.2f} (>+0.5)')
            a=zone(k,'P','side',mode,'nonfoot_z-60_100')['mean']; b=zone('baseline','P','side',mode,'nonfoot_z-60_100')['mean']
            if a-b>0.25: reg.append(f'side non-foot zone sym mean {b:.2f}->{a:.2f} (>+0.25)')
        d['regression'][mode]=reg; d['intended'][mode]['regression_flag']=bool(reg)
    mz=M1[k]['min_z_mm']; bvh=INT[k if k in INT else 'B']['bvh']['new_pairs'] if k in INT else None
    d['min_z_mm']=mz; d['min_z_ok']=(-88.1<=mz<=-87.9)
    d['new_bvh_pairs']=bvh
    d['recal_modeF_agrees_sign']=None
    d['I_F']=d['intended']['modeF']['improves']; d['I_L']=d['intended']['modeL']['improves']; d['R_F']=bool(d['regression']['modeF']); d['R_L']=bool(d['regression']['modeL'])
    OUT['candidates'][k]=d
json.dump(OUT,open(N+'data/verdicts_raw.json','w'),indent=1)
print(json.dumps({k:{x:d[x] for x in ['I_F','I_L','R_F','R_L','new_bvh_pairs','min_z_mm']} for k,d in OUT['candidates'].items()},indent=1)); print('repro',repro)
for k,d in OUT['candidates'].items():
    print('==',k); print(' intended',json.dumps(d['intended'],indent=None)[:900])
    for m in MODES: print(' reg',m,d['regression'][m])
