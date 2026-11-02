import sys,os,json; sys.path.insert(0,os.path.dirname(__file__))
import numpy as np, s05_measure as S
M=json.load(open(S.OUT+'data/silhouette_measurements.json')); R={}
for v in ['front','side','back']:
    rm,_=S.ref_mask(v); R[v]={}
    for mode in ['modeL','modeF']:
        full=S.measure(v,rm,M[v][mode+'_cam'],full=True); P=full['_pts']
        d=np.concatenate([P['d_r2m'],P['d_m2r']]); z=np.concatenate([P['zr'],P['zm']])
        out=dict(overall={f'frac_le_{t}mm':float((d<=t).mean()) for t in (0.5,1.0,2.0)},bands={})
        for nm,z0,z1 in S.BANDS:
            s=(z>=z0)&(z<z1); out['bands'][nm]={f'frac_le_{t}mm':float((d[s]<=t).mean()) for t in (0.5,1.0,2.0)}
        R[v][mode]=out
        print(v,mode,{k:round(x,3) for k,x in out['overall'].items()},{b:round(o['frac_le_1.0mm'],2) for b,o in out['bands'].items()},flush=True)
json.dump(R,open(S.OUT+'data/fractions_within_tolerance.json','w'),indent=1)
# informational: head/hair/shoulder-top zone (z>=100) contour distances under Mode F (NOT used for classification)
H={}
for v in ['front','side','back']:
    rm,_=S.ref_mask(v); cam=M[v]['modeF_cam']; s,tx,ty=cam['s'],cam['tx'],cam['ty']; up=4
    mm=S.render(v,s,tx,ty,up); import cv2
    r4=cv2.resize(rm,(S.W*up,S.H*up),interpolation=cv2.INTER_NEAREST); bm=S.boundary(mm); br=S.boundary(r4)
    ycut=int(np.ceil((ty-s*S.ZCUT)*up)); dm=cv2.distanceTransform((~bm).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE); dr=cv2.distanceTransform((~br).astype(np.uint8),cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    k=1.0/(up*s); yr,xr=np.nonzero(br); sel0=yr<ycut; yr,xr=yr[sel0],xr[sel0]
    ym,xm=np.nonzero(bm); sel=ym<ycut; ym,xm=ym[sel],xm[sel]
    d=np.concatenate([dm[yr,xr],dr[ym,xm]])*k
    H[v]=dict(n=int(len(d)),mean=float(d.mean()),p50=float(np.percentile(d,50)),p95=float(np.percentile(d,95)),max=float(d.max()),note='informational only: model has hair geometry in all views; side/back references are bald; front reference clipped at image top')
    print('head zone',v,{a:round(b,2) for a,b in H[v].items() if a!='note'})
json.dump(H,open(S.OUT+'data/head_zone_info.json','w'),indent=1)
