#!/usr/bin/env python3
"""EXPLORATORY, in-memory only (no .blend written, NOT a candidate): conservative knee-band widening (+0.7 mm per side = smallest camera-robust front magnitude)
to show what such a change would do under the same measurement. Leg x-scale about each leg axis (x=+-10 mm) with a z window (smoothstep, 5 mm margins) over z -40..-15."""
import sys,os,json; sys.path.insert(0,os.path.dirname(__file__))
import numpy as np, cs_common as C
S=C.S; N=C.NEW
Wz=np.load(N+'work/bv9_base_weights.npz'); names=[str(x) for x in Wz['names']]; W=Wz['W'].astype(np.float64)
V,T,M=C.load_geom(N+'work/bv9_geom_rerun.npz')
def sm(t): t=np.clip(t,0,1); return t*t*(3-2*t)
def widen(V,delta,z0=-40,z1=-15,marg=5.0):
    out=V.copy()
    win=sm((V[:,2]-(z0-marg))/marg)*(1-sm((V[:,2]-z1)/marg))
    for s,xc in [('right',10.0),('left',-10.0)]:
        w=np.clip(W[:,names.index('thigh_'+s)]+W[:,names.index('shin_'+s)],0,1)*win
        sel=w>0
        r=np.abs(V[(w>0.99)&(V[:,2]>z0)&(V[:,2]<z1),0]-xc).max()   # half width of the leg in the band
        k=delta/r; out[:,0]=np.where(sel,out[:,0]+w*(out[:,0]-xc)*k,out[:,0])
    return out,r
res={}
cams=C.cams_fixed()
for label,d in [('baseline',0.0),('knee +0.7 mm/side',0.7)]:
    Vn,r=widen(V,d); res[label]=dict(half_width_mm=float(r)); C.set_geom(Vn,T,M)
    for v in C.VIEWS:
        res[label][v]={}
        for mode in ['modeF','modeL']:
            st,arr=C.stats_block(v,cams[v][mode])
            kn=C.zone_stats(arr,-40,-15); res[label][v][mode]=dict(mean=st['mean'],p95=st['p95'],max=st['max'],frac_le_1=st['frac_le_1.0mm'],knee_band=st['bands']['knees'],knee_zone=kn,thigh_band=st['bands']['thighs'],ankle_band=st['bands']['ankles/shins'])
json.dump(res,open(N+'data/C_exploratory_knee_widen.json','w'),indent=1)
for label in res:
    for v in C.VIEWS:
        print(label,v,{m:(round(res[label][v][m]['mean'],3),round(res[label][v][m]['p95'],2),round(res[label][v][m]['knee_band']['abs_off'],2)) for m in ['modeF','modeL']})
