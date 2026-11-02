#!/usr/bin/env python3
"""Step-4 geometry/surface review (frozen metrics). Model-only checks plus reference-only consistency checks. Read-only."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, cv2
from scipy.spatial import cKDTree
from scipy.ndimage import gaussian_filter1d
import s05_measure as S
OUT=S.OUT; V=S.V; T=S.T; MAT=S.MAT
M=json.load(open(OUT+'data/silhouette_measurements.json'))
R={}
skin=MAT==2
# ---- 1. surface smoothness (dihedral angles) on skin material below z=100
Tk=T[skin]; zc=V[Tk][:,:,2].mean(1); Tk=Tk[zc<100]
n=np.cross(V[Tk[:,1]]-V[Tk[:,0]],V[Tk[:,2]]-V[Tk[:,0]]); a2=np.linalg.norm(n,axis=1); ok=a2>1e-12
n=n[ok]/a2[ok,None]; Tk=Tk[ok]
E=np.sort(np.c_[Tk[:,[0,1]],Tk[:,[1,2]],Tk[:,[2,0]]].reshape(-1,2),axis=1); fid=np.repeat(np.arange(len(Tk)),3)
key=E[:,0].astype(np.int64)*10**7+E[:,1]; o=np.argsort(key); key=key[o]; fid=fid[o]; E=E[o]
same=key[1:]==key[:-1]; idx=np.nonzero(same)[0]
cnt=np.r_[np.diff(np.nonzero(np.r_[True,~same,True])[0])]
pair_a=fid[idx]; pair_b=fid[idx+1]
# edges that appear exactly twice
# (edges with >2 faces would show in a run of 3; skin below z=100 should be manifold except seams)
ang=np.degrees(np.arccos(np.clip((n[pair_a]*n[pair_b]).sum(1),-1,1)))
mid=(V[E[idx,0]]+V[E[idx,1]])/2
# quads are triangulated: diagonal edges between coplanar-ish tris have small angle; keep all
R['smoothness']=dict(n_edges=int(len(ang)),mean_deg=float(ang.mean()),p50=float(np.percentile(ang,50)),p95=float(np.percentile(ang,95)),p99=float(np.percentile(ang,99)),p999=float(np.percentile(ang,99.9)),max=float(ang.max()),
    n_gt30=int((ang>30).sum()),n_gt45=int((ang>45).sum()),n_gt60=int((ang>60).sum()))
sel=ang>30
if sel.sum():
    pts=mid[sel]; ang30=ang[sel]
    # cluster by 3mm grid
    g=np.floor(pts/3.0).astype(int); keyg=g[:,0]*1000000+g[:,1]*1000+g[:,2]; cl={}
    for k,p,a in zip(keyg,pts,ang30):
        c=cl.setdefault(k,[0,0,p]); c[0]+=1; c[1]=max(c[1],a)
    top=sorted(cl.values(),key=lambda c:-c[0])[:12]
    R['smoothness']['top_clusters_gt30deg']=[dict(n=int(c[0]),max_deg=float(c[1]),x_mm=float(c[2][0]),y_mm=float(c[2][1]),z_mm=float(c[2][2])) for c in top]
    zb=np.floor(pts[:,2]/10)*10; R['smoothness']['gt30deg_by_z10']={str(int(z)):int((zb==z).sum()) for z in np.unique(zb)}
# ---- 2. cross sections every 2 mm (all non-hair tris: materials 0? use skin only) below 100
def slice_level(z):
    zv=V[Tk][:,:,2]-z
    cross=(zv.min(1)<0)&(zv.max(1)>=0)
    tri=Tk[cross]; zz=V[tri][:,:,2]-z
    segs=[]
    for t,zr in zip(tri,zz):
        pts=[]
        for i,j in ((0,1),(1,2),(2,0)):
            if (zr[i]<0)!=(zr[j]<0):
                a,b=t[i],t[j]; w=zr[i]/(zr[i]-zr[j]); p=V[a]+(V[b]-V[a])*w; pts.append((min(a,b),max(a,b),p[0],p[1]))
        if len(pts)==2: segs.append(pts)
    # chain by edge keys
    adj={}
    for s in segs:
        k0=(s[0][0],s[0][1]); k1=(s[1][0],s[1][1]); adj.setdefault(k0,[]).append((k1,s[0][2:4],s[1][2:4])); adj.setdefault(k1,[]).append((k0,s[1][2:4],s[0][2:4]))
    P={}
    for s in segs: P[(s[0][0],s[0][1])]=s[0][2:4]; P[(s[1][0],s[1][1])]=s[1][2:4]
    seen=set(); loops=[]
    for k in P:
        if k in seen: continue
        stack=[k]; comp=[]; seen.add(k)
        while stack:
            c=stack.pop(); comp.append(c)
            for nb,_,_ in adj.get(c,[]):
                if nb not in seen: seen.add(nb); stack.append(nb)
        loops.append(comp)
    # ordered area via per-component walk
    area=0.0; per=0.0; nopen=0
    for comp in loops:
        cs=set(comp); start=comp[0]; order=[start]; prev=None; cur=start
        while True:
            nxt=[nb for nb,_,_ in adj[cur] if nb!=prev and nb in cs]
            if not nxt: break
            nb=nxt[0]
            if nb==start or nb in order: break
            order.append(nb); prev,cur=cur,nb
        pts=np.array([P[k] for k in order])
        if len(order)<len(comp)*0.9: nopen+=1
        x,y=pts[:,0],pts[:,1]; ar=0.5*np.sum(x*np.roll(y,-1)-np.roll(x,-1)*y)
        area+=abs(ar); per+=np.sum(np.hypot(np.diff(np.r_[x,x[0]]),np.diff(np.r_[y,y[0]])))
    return len(loops),area,per,nopen
zs=np.arange(-87.0,100.0,2.0); rows=[]
for z in zs:
    nl,ar,pe,no=slice_level(z); rows.append(dict(z=float(z),n_loops=nl,area_mm2=float(ar),perimeter_mm=float(pe),n_loops_walk_incomplete=no))
A=np.array([r['area_mm2'] for r in rows]); L=np.array([r['n_loops'] for r in rows])
d2=np.zeros_like(A); d2[1:-1]=A[:-2]-2*A[1:-1]+A[2:]
stable=np.zeros(len(A),bool); stable[1:-1]=(L[:-2]==L[1:-1])&(L[1:-1]==L[2:])
rob=1.4826*np.median(np.abs(d2[stable]-np.median(d2[stable]))) if stable.sum()>5 else 1.0
flag=[dict(z=rows[i]['z'],d2_area=float(d2[i]),sigma_rob=float(rob),zscore=float(d2[i]/rob)) for i in range(len(A)) if stable[i] and abs(d2[i])>4*rob]
R['cross_sections']=dict(levels=rows,robust_sigma_d2_area=float(rob),flagged_levels_gt4sigma=flag,loop_count_changes=[dict(z=rows[i]['z'],from_loops=int(L[i-1]),to_loops=int(L[i])) for i in range(1,len(L)) if L[i]!=L[i-1]])
# ---- 3. mirror asymmetry (model-only), skin verts z<100
vs=V[np.unique(Tk)]
tree=cKDTree(vs); mir=vs*np.array([-1,1,1]); d,_=tree.query(mir)
zb=[(nm,z0,z1) for nm,z0,z1 in S.BANDS]
R['model_mirror_asymmetry']=dict(n=int(len(vs)),mean_mm=float(d.mean()),p50=float(np.percentile(d,50)),p95=float(np.percentile(d,95)),p99=float(np.percentile(d,99)),max=float(d.max()),
    by_band={nm:dict(mean=float(d[(vs[:,2]>=z0)&(vs[:,2]<z1)].mean()),p95=float(np.percentile(d[(vs[:,2]>=z0)&(vs[:,2]<z1)],95)),max=float(d[(vs[:,2]>=z0)&(vs[:,2]<z1)].max())) for nm,z0,z1 in zb},
    note='mirror about model x=0; nearest-vertex distance (a vertex-spacing floor of ~0.3-0.8 mm is expected even for a perfectly mirrored but non-identically-meshed surface)')
# ---- 4. reference left/right asymmetry vs model (front, back) about the Mode-F model axis tx
asym={}
for v in ['front','back']:
    cam=M[v]['modeF_cam']; s=cam['s']; tx=cam['tx']; rows_=M[v]['modeF']['rows']
    out=[]
    for r in rows_:
        if 'ref_l_px' not in r or r['z']>=100 or r['z']<-80: continue
        hl=(tx-r['ref_l_px'])/s; hr=(r['ref_r_px']-tx)/s; ml=(tx-r['mod_l_px'])/s; mr=(r['mod_r_px']-tx)/s
        out.append(dict(z=r['z'],ref_asym_mm=float(hl-hr),model_asym_mm=float(ml-mr)))
    bands={}
    for nm,z0,z1 in zb:
        q=[o for o in out if z0<=o['z']<z1]
        if q: bands[nm]=dict(ref_asym_mean=float(np.mean([o['ref_asym_mm'] for o in q])),ref_asym_absmax=float(np.max(np.abs([o['ref_asym_mm'] for o in q]))),model_asym_mean=float(np.mean([o['model_asym_mm'] for o in q])),model_asym_absmax=float(np.max(np.abs([o['model_asym_mm'] for o in q]))))
    asym[v]=dict(rows=out,bands=bands,note='half-width left minus right of outermost extents about the Mode-F axis x=tx (arms included); positive = image-left wider')
R['outline_left_right_asymmetry']=asym
# ---- 5. bump/pinch candidates: model-minus-reference outline offset, high-pass (sigma 6 mm)
bump={}
for v in ['front','side','back']:
    rows_=[r for r in M[v]['modeF']['rows'] if 'off_left_mm' in r and -85<=r['z']<100]
    z=np.array([r['z'] for r in rows_]); res=[]
    for key in ['off_left_mm','off_right_mm']:
        o=np.array([r[key] for r in rows_]); hp=o-gaussian_filter1d(o,6.0/2.5,mode='nearest')
        for zi,h,oi in zip(z,hp,o):
            if abs(h)>1.0: res.append(dict(z=float(zi),side=key,offset_mm=float(oi),highpass_mm=float(h)))
    bump[v]=res
R['bump_pinch_candidates_modelminusref_highpass_gt1mm']=bump
# ---- 6. silhouette continuity: kinks on model outer contour (z<100)
kinks={}
for v in ['front','side','back']:
    cam=M[v]['modeF_cam']; s,tx,ty=cam['s'],cam['tx'],cam['ty']
    mm=S.render(v,s,tx,ty,4); mm=S.fill_external(mm)
    cs,_=cv2.findContours(mm,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); c=max(cs,key=len).reshape(-1,2).astype(float)
    xy=np.c_[(c[:,0]+0.5)/4,(c[:,1]+0.5)/4]/s; zmm=(ty-(c[:,1]+0.5)/4)/s
    # arc-length resample 0.5mm
    seg=np.hypot(*np.diff(np.r_[xy,xy[:1]],axis=0).T); cum=np.r_[0,np.cumsum(seg)]; Ltot=cum[-1]
    tt=np.arange(0,Ltot,0.5); X=np.interp(tt,cum,np.r_[xy[:,0],xy[0,0]]); Y=np.interp(tt,cum,np.r_[xy[:,1],xy[0,1]]); Z=np.interp(tt,cum,np.r_[zmm,zmm[0]])
    X=gaussian_filter1d(X,1.0,mode='wrap'); Y=gaussian_filter1d(Y,1.0,mode='wrap')
    k=2  # +-1.0 mm
    v1=np.c_[X-np.roll(X,k),Y-np.roll(Y,k)]; v2=np.c_[np.roll(X,-k)-X,np.roll(Y,-k)-Y]
    ang=np.degrees(np.arctan2(v1[:,0]*v2[:,1]-v1[:,1]*v2[:,0],(v1*v2).sum(1)))
    sel=(np.abs(ang)>25)&(Z<100)
    # cluster by contiguous index
    idx=np.nonzero(sel)[0]; cl=[]
    for i in idx:
        if cl and i-cl[-1][-1]<=3: cl[-1].append(i)
        else: cl.append([i])
    kinks[v]=dict(n_kink_clusters_gt25deg_in_1mm=len(cl),clusters=[dict(z_mm=float(Z[c_].mean()),x_mm=float(X[c_].mean()),max_turn_deg=float(np.abs(ang[c_]).max())) for c_ in sorted(cl,key=lambda c_:-np.abs(ang[c_]).max())[:12]],contour_length_mm=float(Ltot))
R['silhouette_continuity']=kinks
# ---- 7. reference cross-view consistency (reference-only; scale assumption: same px/mm in front/back)
cons={}
FM={v:S.ref_mask(v)[0] for v in ['front','back','side']}
def rows_width(m,sole):
    out={}
    for hpx in range(60,1500,60):
        y=int(sole-hpx)
        if y<0: break
        xs=np.nonzero(m[y])[0]
        if len(xs): out[hpx]=(int(xs[0]),int(xs[-1]+1))
    return out
fs=np.nonzero(FM['front'])[0].max()+1; bs=np.nonzero(FM['back'])[0].max()+1; ss=np.nonzero(FM['side'])[0].max()+1
wf=rows_width(FM['front'],fs); wb=rows_width(FM['back'],bs)
cons['front_vs_back_outer_width_ratio_by_px_above_sole']=[dict(px_above_sole=h,front_w=wf[h][1]-wf[h][0],back_w=wb[h][1]-wb[h][0],ratio_back_over_front=(wb[h][1]-wb[h][0])/(wf[h][1]-wf[h][0])) for h in wf if h in wb]
cons['ref_figure_extents_px']={v:dict(top_row=int(np.nonzero(FM[v])[0].min()),sole_row=int(np.nonzero(FM[v])[0].max()+1),height_px=int(np.nonzero(FM[v])[0].max()+1-np.nonzero(FM[v])[0].min())) for v in FM}
cons['best_fit_scales_px_per_mm']={v:M[v]['modeF_cam']['s'] for v in M}
cons['landmark_scales_px_per_mm']={v:M[v]['modeL_cam']['s'] for v in M}
cons['note']='front reference is clipped at the image top (hair/ahoge) so its height is a lower bound; widths compared at equal px above the sole assume the same px/mm in front and back (NOT VERIFIED).'
R['reference_cross_view_consistency']=cons
json.dump(R,open(OUT+'data/geometry_review.json','w'),indent=1)
print('GEOMETRY_REVIEW_DONE')
print(json.dumps({k:R[k] for k in ['smoothness']},indent=1)[:1500])
