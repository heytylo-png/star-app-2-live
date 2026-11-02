#!/usr/bin/env python3
"""Frozen-method measurement of bv9 silhouette vs official #177 full-body references. Read-only on all inputs.
Inputs: work/bv9_geom.npz (exported from a COPY of bv9), the official reference jpgs. See METHOD_AND_CRITERIA_FROZEN.md."""
import sys, json, os, csv
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, cv2
from scipy.optimize import minimize
from refseg import segment
OUT='/workspace/blendbro/out/bv9_reference_validation_v1/'
G=np.load(OUT+'work/bv9_geom.npz'); V=G['verts'].astype(np.float64)*1000.0; T=G['tris']; MAT=G['mat']
H,W=1536,864
ZSOLE=-88.0; ZCUT=100.0
ZCROWN=float(V[np.unique(T[MAT==0])][:,2].max())   # frozen: max z of material 0
UAX={'front':-V[:,0],'back':V[:,0],'side':-V[:,1]}
BANDS=[('feet',-88,-75),('ankles/shins',-75,-40),('knees',-40,-15),('thighs',-15,25),('hips/crotch',25,60),('waist/ribs',60,80),('bust/arms',80,100)]
def render(view,s,tx,ty,up,roi=None):
    u=UAX[view]; z=V[:,2]
    x=tx+s*u; y=ty-s*z
    P=np.round((np.stack([x,y],1)*up-0.5)*16).astype(np.int32)
    img=np.zeros((H*up,W*up),np.uint8)
    for tri in P[T]: cv2.fillConvexPoly(img,tri,1,lineType=cv2.LINE_8,shift=4)  # per-triangle (fillPoly would use even-odd on overlaps)
    return img
def ref_mask(view,tex=4.0):
    m,im,info=segment(view,tex_thr=tex); return m,im
def iou_zone(view,s,tx,ty,refm2):
    mm=render(view,s,tx,ty,2)
    ycut=int(np.ceil((ty-s*ZCUT)*2)); ycut=max(ycut,0)
    a=mm[ycut:]>0; b=refm2[ycut:]>0
    return (a&b).sum()/max((a|b).sum(),1)
def modeL(view,rm,sdict):
    ys,xs=np.nonzero(rm); sole=ys.max()+1.0; top=float(ys.min())
    if view in('side','back'): s=(sole-top)/(ZCROWN-ZSOLE)
    else: s=sdict['front']
    ty=sole+ZSOLE*s
    # horizontal anchor: x-centroid of lower-leg rows z in [-60,-30]
    y0=int(round(ty-s*(-30))); y1=int(round(ty-s*(-60)))
    cx_ref=np.nonzero(rm[y0:y1])[1].mean()+0.5
    mm=render(view,s,W/2.0,ty,1); cx_mod=np.nonzero(mm[y0:y1])[1].mean()+0.5
    return dict(s=float(s),tx=float(W/2.0+cx_ref-cx_mod),ty=float(ty),sole_row=float(sole),top_row=top)
def fit(view,rm,L):
    refm2=cv2.resize(rm,(W*2,H*2),interpolation=cv2.INTER_NEAREST)
    s0=L['s']
    def cost(p):
        s,tx,ty=p
        if abs(s/s0-1)>0.06: return 1.0
        return -iou_zone(view,s,tx,ty,refm2)
    x0=np.array([s0,L['tx'],L['ty']])
    sim=np.array([x0,x0+[s0*0.01,0,0],x0+[0,3,0],x0+[0,0,3]])
    r=minimize(cost,x0,method='Nelder-Mead',options=dict(initial_simplex=sim,xatol=1e-3,fatol=1e-6,maxiter=400))
    return dict(s=float(r.x[0]),tx=float(r.x[1]),ty=float(r.x[2]),iou_zone=float(-r.fun),n_eval=int(r.nfev),hit_scale_bound=bool(abs(r.x[0]/s0-1)>0.0595))
def boundary(m):
    er=cv2.erode(m,np.array([[0,1,0],[1,1,1],[0,1,0]],np.uint8),borderType=cv2.BORDER_CONSTANT,borderValue=0)
    return (m>0)&(er==0)
def fill_external(m):
    cs,_=cv2.findContours(m.astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    o=np.zeros_like(m,dtype=np.uint8); cv2.drawContours(o,cs,-1,1,-1); return o
def measure(view,rm,cam,full=False,outer=False):
    s,tx,ty=cam['s'],cam['tx'],cam['ty']; up=4
    mm=render(view,s,tx,ty,up); r4=cv2.resize(rm,(W*up,H*up),interpolation=cv2.INTER_NEAREST)
    if outer:  # SUPPLEMENT S1 (post-hoc, disclosed): external contours only (enclosed gaps such as arm-torso pockets are filled in both masks)
        mm=fill_external(mm); r4=fill_external(r4)
    bm=boundary(mm); br=boundary(r4)
    ycut=int(np.ceil((ty-s*ZCUT)*up))
    dm=cv2.distanceTransform((~bm).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)  # distance to model contour
    dr=cv2.distanceTransform((~br).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    k=1.0/(up*s)
    def pts(b): 
        ys,xs=np.nonzero(b); sel=ys>=ycut; return ys[sel],xs[sel]
    yr,xr=pts(br); ym,xm=pts(bm)
    d_r2m=dm[yr,xr]*k; d_m2r=dr[ym,xm]*k
    # sign: ref contour point outside model mask => model short ; model contour point outside ref mask => model proud
    short=mm[yr,xr]==0; proud=r4[ym,xm]==0
    def st(d):
        if len(d)==0: return {}
        return dict(n=int(len(d)),mean=float(d.mean()),p50=float(np.percentile(d,50)),p90=float(np.percentile(d,90)),p95=float(np.percentile(d,95)),p99=float(np.percentile(d,99)),max=float(d.max()))
    sym=np.concatenate([d_r2m,d_m2r])
    a=(mm[ycut:]>0); b=(r4[ycut:]>0)
    res=dict(cam=cam,ycut_px=ycut/up,R2M=st(d_r2m),M2R=st(d_m2r),sym=st(sym),iou=float((a&b).sum()/max((a|b).sum(),1)),
             symdiff_area_mm2=float((a^b).sum()/(up*s)**2),ref_area_mm2=float(b.sum()/(up*s)**2),model_area_mm2=float(a.sum()/(up*s)**2),
             frac_model_short=float(short.mean()),frac_model_proud=float(proud.mean()))
    if not full: return res
    z_r=(ty-yr/up-0.5/up*0)/1.0
    zr=(ty-(yr+0.5)/up)/s; zm=(ty-(ym+0.5)/up)/s
    res['_pts']=dict(zr=zr,xr=(xr+0.5)/up,d_r2m=d_r2m,short=short,zm=zm,xm=(xm+0.5)/up,d_m2r=d_m2r,proud=proud)
    res['_mm']=mm; res['_r4']=r4; res['_bm']=bm; res['_br']=br
    return res
def rowprofile(view,rm,mm4,cam):
    s,tx,ty=cam['s'],cam['tx'],cam['ty']; up=4; rows=[]
    r4=cv2.resize(rm,(W*up,H*up),interpolation=cv2.INTER_NEAREST)
    for z in np.arange(-87.5,156.1,2.5):
        y4=int(round((ty-s*z)*up-0.5))
        if y4<0 or y4>=H*up: continue
        rr=np.nonzero(r4[y4])[0]; mr=np.nonzero(mm4[y4])[0]
        if len(rr)==0 or len(mr)==0: rows.append(dict(z=float(z),ref_l=None,ref_r=None,mod_l=None,mod_r=None)); continue
        k=1.0/(up*s)
        rows.append(dict(z=float(z),ref_l_px=(rr[0])/up,ref_r_px=(rr[-1]+1)/up,mod_l_px=mr[0]/up,mod_r_px=(mr[-1]+1)/up,
            off_left_mm=float((rr[0]-mr[0])*k),off_right_mm=float((mr[-1]+1-(rr[-1]+1))*k),
            ref_width_mm=float((rr[-1]+1-rr[0])*k),model_width_mm=float((mr[-1]+1-mr[0])*k)))
    return rows
def band_stats(view,res_full,rows):
    P=res_full['_pts']; out=[]
    for name,z0,z1 in BANDS:
        sel_r=(P['zr']>=z0)&(P['zr']<z1); sel_m=(P['zm']>=z0)&(P['zm']<z1)
        d=np.concatenate([P['d_r2m'][sel_r],P['d_m2r'][sel_m]])
        rr=[r for r in rows if z0<=r['z']<z1 and 'off_left_mm' in r]
        offs=np.array([[r['off_left_mm'],r['off_right_mm']] for r in rr]) if rr else np.zeros((0,2))
        out.append(dict(band=name,z0=z0,z1=z1,n_pts=int(len(d)),sym_mean=float(d.mean()) if len(d) else None,sym_p95=float(np.percentile(d,95)) if len(d) else None,sym_max=float(d.max()) if len(d) else None,
            outline_abs_mean_mm=float(np.abs(offs).mean()) if len(offs) else None,outline_signed_mean_left=float(offs[:,0].mean()) if len(offs) else None,outline_signed_mean_right=float(offs[:,1].mean()) if len(offs) else None,n_rows=len(rr),
            frac_short=float(P['short'][sel_r].mean()) if sel_r.sum() else None,frac_proud=float(P['proud'][sel_m].mean()) if sel_m.sum() else None))
    return out
if __name__=='__main__':
    results={}; masks={}
    for v in ['side','back','front']:
        rm,im=ref_mask(v); masks[v]=rm
    sd={}
    for v in ['side','back']:
        ys,xs=np.nonzero(masks[v]); sd[v]=(ys.max()+1.0-ys.min())/(ZCROWN-ZSOLE)
    sd['front']=(sd['side']+sd['back'])/2
    print('ZCROWN',ZCROWN,'scales L',sd)
    for v in ['front','side','back']:
        rm=masks[v]; Lc=modeL(v,rm,sd); Fc=fit(v,rm,Lc)
        print(v,'L',Lc,'F',Fc,flush=True)
        R={'ref_file':v,'modeL_cam':Lc,'modeF_cam':Fc}
        for name,cam in [('modeL',Lc),('modeF',Fc)]:
            full=measure(v,rm,cam,full=True)
            rows=rowprofile(v,rm,full['_mm'],cam)
            R[name]={k:val for k,val in full.items() if not k.startswith('_')}
            R[name]['bands']=band_stats(v,full,rows)
            R[name]['rows']=rows
            if name=='modeF':
                # worst clusters: bin by z (3mm) and side of image
                P=full['_pts']; cl=[]
                for typ,zk,xk,dk,sk in [('model_short(ref beyond model)','zr','xr','d_r2m','short'),('model_proud(model beyond ref)','zm','xm','d_m2r','proud')]:
                    z=P[zk]; x=P[xk]; d=P[dk]; sg=P[sk]
                    sel=(d>1.0)&sg if typ.startswith('model_short') else (d>1.0)&sg
                    for zb in np.arange(-88,100,3.0):
                        for sidei,xs_ in [('image-left',x<cam['tx']+0.0),('image-right',x>=cam['tx'])]:
                            m_=sel&(z>=zb)&(z<zb+3)&xs_
                            if m_.sum()>=8: cl.append(dict(type=typ,z0=float(zb),z1=float(zb+3),side=sidei,n=int(m_.sum()),mean_d=float(d[m_].mean()),max_d=float(d[m_].max())))
                cl.sort(key=lambda c:-c['max_d']); R['worst_clusters_modeF']=cl[:25]
                np.savez_compressed(OUT+f'work/{v}_modeF_arrays.npz',mm=np.packbits(full['_mm']>0),r4=np.packbits(full['_r4']>0))
                results.setdefault('_full',{})[v]={k:full[k] for k in ['_pts','_bm','_br']}
        for name,cam in [('modeL_outer',Lc),('modeF_outer',Fc)]:
            fo=measure(v,rm,cam,full=True,outer=True)
            R[name]={k:val for k,val in fo.items() if not k.startswith('_')}
            rows=rowprofile(v,rm,fo['_mm'],cam); R[name]['bands']=band_stats(v,fo,rows)
        # sensitivity (Mode F fixed camera unless stated)
        sens=[]; Fc0=dict(Fc)
        def run(label,cam,rmx):
            r=measure(v,rmx,cam); sens.append(dict(label=label,p95=r['sym']['p95'],mean=r['sym']['mean'],p50=r['sym']['p50'],iou=r['iou']))
        run('modeF baseline',Fc0,rm)
        for dsx,lab in [(0.99,'scale -1%'),(1.01,'scale +1%'),(0.98,'scale -2%'),(1.02,'scale +2%')]:
            c=dict(Fc0); c['s']*=dsx; c['ty']=Fc0['ty']+ (Fc0['ty']-Lc['sole_row']) *(dsx-1)*0  # keep ty (offset) fixed
            run(lab,c,rm)
        for dx in [-1,1]:
            c=dict(Fc0); c['tx']+=dx; run(f'x shift {dx:+d}px',c,rm)
        for dy in [-2,2]:
            c=dict(Fc0); c['ty']+=dy; run(f'y shift {dy:+d}px',c,rm)
        for thr in [3.0,6.0]:
            rmx,_=ref_mask(v,tex=thr); run(f'ref segmentation texture thr {thr}',Fc0,rmx)
        R['sensitivity']=sens
        results[v]=R
    full_store=results.pop('_full')
    json.dump(results,open(OUT+'data/silhouette_measurements.json','w'),indent=1)
    print('MEASURE_DONE')
