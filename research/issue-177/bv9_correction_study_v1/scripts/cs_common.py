#!/usr/bin/env python3
"""Common measurement layer for the correction study. IMPORTS the frozen validation scripts UNCHANGED
(s05_measure.py + refseg.py from bv9_reference_validation_v1, hashed in data/baseline_verification.json) and re-points their
module-level geometry globals (V,T,MAT,UAX,ZCROWN) to a candidate mesh. Nothing in the validation scripts is edited."""
import sys, os, json
VAL='/workspace/blendbro/out/bv9_reference_validation_v1/'
NEW='/workspace/blendbro/out/bv9_correction_study_v1/'
sys.path.insert(0, VAL+'scripts')
import numpy as np, cv2
import s05_measure as S           # unchanged validation module (loads baseline geometry at import)
BASE=json.load(open(VAL+'data/silhouette_measurements.json'))   # baseline cameras + numbers (validation, commit f81fa464)
VIEWS=['front','side','back']
def load_geom(npz):
    G=np.load(npz); return G['verts'].astype(np.float64)*1000.0, G['tris'], G['mat']
def set_geom(V,T,MAT):
    S.V=V; S.T=T; S.MAT=MAT; S.UAX={'front':-V[:,0],'back':V[:,0],'side':-V[:,1]}
    S.ZCROWN=float(V[np.unique(T[MAT==0])][:,2].max())
_MASK={}
def refmask(v):
    if v not in _MASK: _MASK[v]=S.ref_mask(v)[0]
    return _MASK[v]
def cams_fixed():
    """Primary: baseline (bv9) cameras held FIXED, so any change is geometry only."""
    return {v:{'modeF':BASE[v]['modeF_cam'],'modeL':BASE[v]['modeL_cam']} for v in VIEWS}
def cams_recal():
    """Secondary: the validation calibration PROCEDURE (S.modeL, S.fit) re-run on the candidate geometry."""
    sd={}
    for v in ['side','back']:
        ys,xs=np.nonzero(refmask(v)); sd[v]=(ys.max()+1.0-ys.min())/(S.ZCROWN-S.ZSOLE)
    sd['front']=(sd['side']+sd['back'])/2
    out={}
    for v in VIEWS:
        Lc=S.modeL(v,refmask(v),sd); Fc=S.fit(v,refmask(v),Lc); out[v]={'modeL':Lc,'modeF':Fc}
    return out
def stats_block(v,cam,rm=None):
    """Full statistics for one view/camera using the unchanged S.measure/S.rowprofile/S.band_stats."""
    rm=refmask(v) if rm is None else rm
    full=S.measure(v,rm,cam,full=True); P=full['_pts']
    d=np.concatenate([P['d_r2m'],P['d_m2r']]); z=np.concatenate([P['zr'],P['zm']])
    side=np.concatenate([P['xr'],P['xm']])<cam['tx']   # True = image-left half
    rows=S.rowprofile(v,rm,full['_mm'],cam); bands=S.band_stats(v,full,rows)
    o=full['sym'].copy(); o['iou']=full['iou']; o['n']=int(len(d))
    for t in (0.5,1.0,2.0): o[f'frac_le_{t}mm']=float((d<=t).mean())
    o['bands']={b['band']:dict(sym_mean=b['sym_mean'],sym_p95=b['sym_p95'],sym_max=b['sym_max'],abs_off=b['outline_abs_mean_mm'],off_left=b['outline_signed_mean_left'],off_right=b['outline_signed_mean_right'],
                 frac_le_1=float((d[(z>=b['z0'])&(z<b['z1'])]<=1.0).mean()) if ((z>=b['z0'])&(z<b['z1'])).any() else None) for b in bands}
    o['rows']=rows
    fo=S.measure(v,rm,cam,full=False,outer=True); o['outer_sym']=fo['sym']
    return o,dict(z=z,d=d,left=side,P=P)
def zone_stats(arr,z0,z1,which=None):
    z=arr['z']; d=arr['d']; m=(z>=z0)&(z<z1)
    if which=='left': m&=arr['left']
    if which=='right': m&=~arr['left']
    if m.sum()==0: return None
    x=d[m]; return dict(n=int(m.sum()),mean=float(x.mean()),p50=float(np.percentile(x,50)),p95=float(np.percentile(x,95)),max=float(x.max()),frac_le_1=float((x<=1).mean()))
def measure_candidate(V,T,MAT,cams):
    """cams: {view:{'modeF':cam,'modeL':cam}} -> {view:{mode:stats}} ; arrays kept separately"""
    set_geom(V,T,MAT); R={}; A={}
    for v in VIEWS:
        R[v]={}; A[v]={}
        for mode in ['modeF','modeL']:
            R[v][mode],A[v][mode]=stats_block(v,cams[v][mode])
    return R,A
