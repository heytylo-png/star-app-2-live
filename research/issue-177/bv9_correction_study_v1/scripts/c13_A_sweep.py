#!/usr/bin/env python3
"""EXPLORATORY in-memory sweep for candidate A (no files, not candidates): inward arm shift delta (mm), fixed baseline cameras, same measurement code."""
import sys,os,json; sys.path.insert(0,os.path.dirname(__file__))
import numpy as np, cs_common as C, cs_edits as E
S=C.S; N=C.NEW
Wz=np.load(N+'work/bv9_base_weights.npz'); names=[str(x) for x in Wz['names']]; W=Wz['W']
V,T,M=C.load_geom(N+'work/bv9_geom_rerun.npz'); cams=C.cams_fixed(); out={}
for d in [0,1,2,2.5,3.5,5,7]:
    Vn=E.edit_A(V,W,names,delta=float(d)) if d>0 else V.copy(); C.set_geom(Vn,T,M); out[str(d)]={}
    for v in ['front','back','side']:
        out[str(d)][v]={}
        for m in ['modeF','modeL']:
            st,arr=C.stats_block(v,cams[v][m]); g=C.zone_stats(arr,25,80)
            out[str(d)][v][m]=dict(mean=st['mean'],p95=st['p95'],max=st['max'],frac_le_1=st['frac_le_1.0mm'],gap_mean=g['mean'],gap_frac1=g['frac_le_1'])
    print(d,{v:{m:(round(out[str(d)][v][m]['mean'],3),round(out[str(d)][v][m]['gap_mean'],2)) for m in ['modeF','modeL']} for v in ['front','back']},flush=True)
json.dump(out,open(N+'data/A_exploratory_sweep.json','w'),indent=1)
