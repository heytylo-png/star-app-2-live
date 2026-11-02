#!/usr/bin/env python3
"""Measure baseline + candidates with the UNCHANGED validation measurement code (via cs_common). usage: c09_measure.py <tag> ; writes data/measure_<tag>.json
Camera conditions: P = baseline cameras fixed, R = calibration procedure re-run on the candidate; each in Mode F and Mode L."""
import sys,os,json,time; sys.path.insert(0,os.path.dirname(__file__))
import numpy as np, cv2, cs_common as C
S=C.S; N=C.NEW; tag=sys.argv[1]
GEOMS={'baseline':N+'work/bv9_geom_rerun.npz','A':N+'work/geom_A_arm_hand.npz','B':N+'work/geom_B_foot.npz'}
for extra in sys.argv[2:]:
    k,p=extra.split('='); GEOMS[k]=p
ZONES={'gap_z25_80':(25,80),'hand_z15_45':(15,45),'foot_zlt-60':(-88,-60),'ankle_z-75_-55':(-75,-55),'nonfoot_z-60_100':(-60,100),'legs_z-75_18':(-75,18)}
def lower_env(msk,cam):
    s,tx,ty=cam['s'],cam['tx'],cam['ty']; H,W=msk.shape; out=[]
    y0=int(ty-s*(-55))
    for x in range(W):
        ys=np.nonzero(msk[:,x])[0]; ys=ys[ys>y0]
        if len(ys): out.append((-(x+0.5-tx)/s,(ty-(ys.max()+1))/s))   # (Y mm, z mm)  side: u=-Y -> Y=-(x-tx)/s
    return np.array(out)
def sole_dev(cam,mm,rm):
    er=lower_env(rm,cam); em=lower_env(mm,cam); Ys=np.arange(-8.0,22.01,0.5); d=[]
    for Y in Ys:
        a=er[np.abs(er[:,0]-Y)<0.12]; b=em[np.abs(em[:,0]-Y)<0.12]
        if len(a) and len(b): d.append(abs(a[:,1].mean()-b[:,1].mean()))
    return dict(n=len(d),mean_abs_dz=float(np.mean(d)) if d else None,max_abs_dz=float(np.max(d)) if d else None,
                model_Y_range=[float(em[:,0].min()),float(em[:,0].max())],ref_Y_range=[float(er[:,0].min()),float(er[:,0].max())])
def outer_edge(v,cam,rm,mm):
    rows=S.rowprofile(v,rm,mm,cam); sel=[r for r in rows if 40<=r['z']<=80 and 'off_left_mm' in r]
    return dict(mean_abs=float(np.mean([abs(r['off_left_mm']) for r in sel]+[abs(r['off_right_mm']) for r in sel])),mean_signed_out=float(np.mean([r['off_left_mm'] for r in sel]+[r['off_right_mm'] for r in sel])))
def run(name,path):
    V,T,M=C.load_geom(path); R={'min_z_mm':float(V[:,2].min()),'max_z_mm':float(V[:,2].max()),'zcrown_mm':float(V[np.unique(T[M==0])][:,2].max())}
    t=time.time()
    for condition,cams in [('P',C.cams_fixed()),('R',None)]:
        C.set_geom(V,T,M)
        if cams is None: cams=C.cams_recal()
        R[condition]={}
        for v in C.VIEWS:
            R[condition][v]={}
            for mode in ['modeF','modeL']:
                cam=cams[v][mode]; st,arr=C.stats_block(v,cam)
                st['cam']={k:float(x) for k,x in cam.items() if isinstance(x,(int,float))}
                st['zones']={zn:{'all':C.zone_stats(arr,*zr),'left':C.zone_stats(arr,*zr,which='left'),'right':C.zone_stats(arr,*zr,which='right')} for zn,zr in ZONES.items()}
                rm=C.refmask(v); mm=S.render(v,cam['s'],cam['tx'],cam['ty'],1)
                st['arm_outer_edge_z40_80']=outer_edge(v,cam,rm,S.render(v,cam['s'],cam['tx'],cam['ty'],4))
                if v=='side': st['sole_envelope']=sole_dev(cam,mm,rm)
                R[condition][v][mode]=st
    R['seconds']=time.time()-t
    return R
ONLY=os.environ.get('ONLY'); 
if ONLY: GEOMS={k:v for k,v in GEOMS.items() if k in ONLY.split(',')}
OUT={k:run(k,p) for k,p in GEOMS.items()}
json.dump(OUT,open(N+f'data/measure_{tag}.json','w'),indent=1)
print('MEASURE_DONE',tag,{k:round(v['seconds'],1) for k,v in OUT.items()})
