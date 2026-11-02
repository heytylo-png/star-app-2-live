#!/usr/bin/env python3
"""Baseline (bv9) discrepancy MAPPING for candidates A/B/C. Uses the unchanged validation measurement code; no candidate geometry involved.
Writes data/baseline_mapping.json."""
import sys,os,json; sys.path.insert(0,os.path.dirname(__file__))
import numpy as np, cv2, cs_common as C
S=C.S
V,T,M=C.load_geom(C.NEW+'work/bv9_geom_rerun.npz'); C.set_geom(V,T,M)
cams=C.cams_fixed(); OUT={}
def runs(m,minw=3):
    xs=np.nonzero(m)[0]
    if len(xs)==0: return []
    a=xs[np.r_[True,np.diff(xs)>1]]; b=xs[np.r_[np.diff(xs)>1,True]]
    return [(int(p),int(q)) for p,q in zip(a,b) if q-p>=minw]
def zrow(v,cam,rm,mm,z):
    s,tx,ty=cam['s'],cam['tx'],cam['ty']; y=int(round(ty-s*z))
    f=lambda R:[(round((a-tx)/s,2),round((b+1-tx)/s,2)) for a,b in R]
    return f(runs(rm[y])),f(runs(mm[y]))
# ---- A: arm / torso edges by z (u axis in mm; front u=-X, back u=+X) -----
A={}
for v in ['front','back']:
    A[v]={}
    for mode in ['modeF','modeL']:
        cam=cams[v][mode]; rm=C.refmask(v); mm=S.render(v,cam['s'],cam['tx'],cam['ty'],1); rows=[]
        for z in range(20,95,5):
            r,m=zrow(v,cam,rm,mm,z); rows.append(dict(z=z,ref_runs=r,model_runs=m))
        A[v][mode]=rows
OUT['A_edge_runs']=A
# arm width / centreline (3-run rows only, i.e. arm | torso | arm both separated): outer/inner edges of each arm, ref vs model
def arm_table(v,mode):
    t=[]
    for row in A[v][mode]:
        r,m=row['ref_runs'],row['model_runs']
        if len(r)==3 and len(m)==3:
            t.append(dict(z=row['z'],arm_outer_off=[round(m[0][0]-r[0][0],2),round(r[2][1]-m[2][1],2)],   # model outward minus ref (u<0 side, u>0 side): +ve = model further out
                          arm_inner_off=[round(m[0][1]-r[0][1],2),round(r[2][0]-m[2][0],2)],               # +ve = model inner edge further from body? (u<0: model inner edge more +u => closer to torso => positive means model arm inner edge nearer torso)
                          torso_halfwidth_ref=round((r[1][1]-r[1][0])/2,2),torso_halfwidth_model=round((m[1][1]-m[1][0])/2,2),
                          gap_ref=[round(r[1][0]-r[0][1],2),round(r[2][0]-r[1][1],2)],gap_model=[round(m[1][0]-m[0][1],2),round(m[2][0]-m[1][1],2)]))
    return t
OUT['A_arm_table']={v:{mo:arm_table(v,mo) for mo in ['modeF','modeL']} for v in ['front','back']}
# ---- A: hand zone: lowest z of hand material in each view (model) vs reference outline beyond thigh --------
hand_ref={}
for v in ['front','back']:
    cam=cams[v]['modeF']; rm=C.refmask(v); mm=S.render(v,cam['s'],cam['tx'],cam['ty'],1); s,tx,ty=cam['s'],cam['tx'],cam['ty']
    res={}
    for sideName,sg in [('image-left',-1),('image-right',1)]:
        for nm,msk in [('ref',rm),('model',mm)]:
            zs=[]
            for z in np.arange(15,45,0.5):
                y=int(round(ty-s*z)); rr=runs(msk[y],2)
                if not rr: continue
                leg_edge=None
                ext=(rr[0][0] if sg<0 else rr[-1][1]+1)
                zs.append((float(z),(ext-tx)/s))
            res[f'{nm}_{sideName}_outer_u_by_z']=[(round(a,1),round(b,2)) for a,b in zs[::4]]
    hand_ref[v]=res
OUT['A_outer_u_by_z_15_45']=hand_ref
# ---- B: sole lines (side view) ------------------------------------------
cam=cams['side']['modeF']; rm=C.refmask('side'); mm=S.render('side',cam['s'],cam['tx'],cam['ty'],1); s,tx,ty=cam['s'],cam['tx'],cam['ty']
def lower_env(msk):
    H,W=msk.shape; out=[]
    for x in range(W):
        ys=np.nonzero(msk[:,x])[0]
        ys=ys[ys>int(ty-s*(-55))]   # below z=-55
        if len(ys): out.append((x,ys.max()))
    return np.array(out)
envr=lower_env(rm); envm=lower_env(mm)
def conv(env): return np.c_[(env[:,0]+0.5-tx)/s*(-1),(ty-(env[:,1]+1))/s]   # (-u)=model +Y direction? side u=-Y => Y=-(x-tx)/s ; z
er=conv(envr); em=conv(envm)
OUT['B_ref_foot']=dict(Y_min=float(er[:,0].min()),Y_max=float(er[:,0].max()),z_min=float(er[:,1].min()),z_at_Ymax=float(er[er[:,0].argmax(),1]),z_at_Ymin=float(er[er[:,0].argmin(),1]))
OUT['B_model_foot']=dict(Y_min=float(em[:,0].min()),Y_max=float(em[:,0].max()),z_min=float(em[:,1].min()),z_at_Ymax=float(em[em[:,0].argmax(),1]),z_at_Ymin=float(em[em[:,0].argmin(),1]))
# envelope z at sampled Y (mm)
ys_=np.arange(-12,24.1,2.0); 
def at(e,Y):
    k=np.argmin(np.abs(e[:,0]-Y)); return float(e[k,1]) if abs(e[k,0]-Y)<0.4 else None
OUT['B_lower_envelope_by_Y']=[dict(Y=float(Y),ref_z=at(er,Y),model_z=at(em,Y)) for Y in ys_]
# model sole pitch from the 3D mesh: foot-group vertices (weight>0.5) lower envelope in (Y,z)
W=np.load(C.NEW+'work/bv9_base_weights.npz'); names=list(W['names']); Wm=W['W']
pit={}
for sd in ['right','left']:
    g=Wm[:,names.index('foot_'+sd)]>0.5; P=V[g]
    # lowest z per 1mm Y bin
    bins=np.floor(P[:,1]).astype(int); lo=[]
    for b in np.unique(bins):
        k=np.nonzero(bins==b)[0]; i=k[np.argmin(P[k,2])]; lo.append((P[i,1],P[i,2]))
    lo=np.array(lo)
    # sole line fit: points within 2.5 mm of the envelope bottom, Y between heel and ball
    for (ya,yb) in [(-6,22.5)]:
        sel=(lo[:,0]>=ya)&(lo[:,0]<=yb); pf=np.polyfit(lo[sel,0],lo[sel,1],1)
    pit[sd]=dict(n=int(g.sum()),Y_range=[float(P[:,1].min()),float(P[:,1].max())],z_min=float(P[:,2].min()),z_max=float(P[:,2].max()),
                 sole_envelope_slope=float(pf[0]),sole_pitch_deg=float(np.degrees(np.arctan(pf[0]))),envelope=lo[::3].round(2).tolist())
OUT['B_model_sole_3d']=pit
bn=dict(zip(W['bone_names'],W['bone_ht'])); OUT['B_bones_mm']={k:np.array(bn[k]).round(2).tolist() for k in ['foot_right','ankle_right','shin_right','foot_left','ankle_left','knee_right','upper_arm_right','upper_arm_left','hand_right','lower_arm_right']}
# ---- C: leg outline offsets under camera / segmentation variants ---------
def leg_offsets(v,cam,rm):
    mmk=S.render(v,cam['s'],cam['tx'],cam['ty'],4); rows=S.rowprofile(v,rm,mmk,cam)
    out={}
    for nm,z0,z1 in [('ankles/shins',-75,-40),('knees',-40,-15),('thighs',-15,18)]:
        rr=[r for r in rows if z0<=r['z']<z1 and 'off_left_mm' in r]
        out[nm]=dict(left=float(np.mean([r['off_left_mm'] for r in rr])),right=float(np.mean([r['off_right_mm'] for r in rr])))
    return out
Cv={}
for v in C.VIEWS:
    Cv[v]={}; rm=C.refmask(v)
    for mode in ['modeF','modeL']:
        cam=cams[v][mode]
        Cv[v][mode+' (baseline cam)']=leg_offsets(v,cam,rm)
    F=cams[v]['modeF']
    for lab,fn in [('F scale -2%',lambda c:dict(c,s=c['s']*0.98)),('F scale -1%',lambda c:dict(c,s=c['s']*0.99)),('F scale +1%',lambda c:dict(c,s=c['s']*1.01)),('F scale +2%',lambda c:dict(c,s=c['s']*1.02)),
                   ('F x -1px',lambda c:dict(c,tx=c['tx']-1)),('F x +1px',lambda c:dict(c,tx=c['tx']+1))]:
        Cv[v][lab]=leg_offsets(v,fn(F),rm)
    for thr in [3.0,6.0]:
        Cv[v][f'F ref-seg tex {thr}']=leg_offsets(v,F,S.ref_mask(v,tex=thr)[0])
OUT['C_leg_offsets_variants']=Cv
json.dump(OUT,open(C.NEW+'data/baseline_mapping.json','w'),indent=1)
print('MAPPING_DONE')
