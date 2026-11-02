#!/usr/bin/env python3
"""Overlay + deviation heat images from the measured cameras (data/silhouette_measurements.json). Evidence images only."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, cv2
import s05_measure as S
OUT=S.OUT; D=json.load(open(OUT+'data/silhouette_measurements.json'))
os.makedirs(OUT+'overlays',exist_ok=True); os.makedirs(OUT+'overlays_publishable',exist_ok=True)
UP=2
def heat(d,lo=0.0,hi=3.0):
    t=np.clip((d-lo)/(hi-lo),0,1); c=cv2.applyColorMap((t*255).astype(np.uint8).reshape(-1,1),cv2.COLORMAP_TURBO); return c.reshape(-1,3)
def draw(view,mode,flat=False):
    cam=D[view][mode+'_cam'] if mode+'_cam' in D[view] else D[view]['modeF_cam']
    cam={'modeL':D[view]['modeL_cam'],'modeF':D[view]['modeF_cam']}[mode]
    rm,im=S.ref_mask(view); res=S.measure(view,rm,cam,full=True)
    s,tx,ty=cam['s'],cam['tx'],cam['ty']; up=4
    base=cv2.cvtColor(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),cv2.COLOR_GRAY2BGR)
    base=cv2.resize(base,(S.W*UP,S.H*UP),interpolation=cv2.INTER_CUBIC); base=(base*0.55).astype(np.uint8)
    if flat: base=np.full_like(base,70)  # publishable variant: NO reference pixels, contours only
    # overlay A: contours on dimmed reference (red=ref, cyan=model); within z>=100 drawn thinner/darker (informational)
    A=base.copy()
    ycut=res['ycut_px']
    for m,col in [(res['_r4'],(0,0,255)),(res['_mm'],(255,255,0))]:
        m2=cv2.resize(m.astype(np.uint8),(S.W*UP,S.H*UP),interpolation=cv2.INTER_NEAREST)
        cs,_=cv2.findContours(m2,cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE)
        for c in cs:
            pts=c.reshape(-1,2)
            inzone=pts[:,1]>=ycut*UP
            for seg_in,colr,th in [(True,col,1),(False,tuple(int(x*0.45) for x in col),1)]:
                sel=pts[inzone==seg_in]
                for p in sel: A[p[1],p[0]]=colr
    A=cv2.dilate(A,np.ones((2,2),np.uint8)) if False else A
    cv2.line(A,(0,int(ycut*UP)),(S.W*UP,int(ycut*UP)),(0,255,255),1,cv2.LINE_AA)
    cv2.putText(A,f'{view} {mode}  red=official ref outline  cyan=bv9 outline  yellow=zone cut z=100mm (above: info only)',(10,28),cv2.FONT_HERSHEY_SIMPLEX,0.7,(0,255,255),2,cv2.LINE_AA)
    cv2.putText(A,f's={s:.3f} px/mm  1px={1/s:.3f} mm  (model mm)',(10,58),cv2.FONT_HERSHEY_SIMPLEX,0.7,(0,255,255),2,cv2.LINE_AA)
    # heat B: contours coloured by distance to the other contour (0..3 mm); light grey bg
    B=np.full((S.H*UP,S.W*UP,3),235,np.uint8)
    P=res['_pts']
    def put(zk,xk,dk,fl=None):
        z=P[zk]; x=P[xk]; d=P[dk]
        cols=heat(d)
        xs=np.round(x*UP-0.5).astype(int); ys=np.round((ty-s*z)*UP-0.5).astype(int)
        for xi,yi,c in zip(xs,ys,cols):
            if 0<=xi<S.W*UP-1 and 0<=yi<S.H*UP-1: B[yi:yi+2,xi:xi+2]=c
    # ref contour dots (R2M) then model contour dots (M2R) slightly offset
    put('zr','xr','d_r2m'); put('zm','xm','d_m2r')
    cv2.line(B,(0,int(ycut*UP)),(S.W*UP,int(ycut*UP)),(0,160,160),1,cv2.LINE_AA)
    cv2.putText(B,f'{view} {mode}: contour deviation to other outline, colour 0..3+ mm (both contours)',(10,28),cv2.FONT_HERSHEY_SIMPLEX,0.7,(40,40,40),2,cv2.LINE_AA)
    st=res['sym']; cv2.putText(B,f"zone z<100: mean {st['mean']:.2f}  p50 {st['p50']:.2f}  p95 {st['p95']:.2f}  p99 {st['p99']:.2f}  max {st['max']:.2f} mm",(10,58),cv2.FONT_HERSHEY_SIMPLEX,0.65,(40,40,40),2,cv2.LINE_AA)
    for i in range(0,101):
        c=heat(np.array([i/100*3.0]))[0]; cv2.rectangle(B,(10+i*3,S.H*UP-40),(13+i*3,S.H*UP-20),tuple(int(x) for x in c),-1)
    cv2.putText(B,'0 mm',(8,S.H*UP-45),cv2.FONT_HERSHEY_SIMPLEX,0.5,(40,40,40),1); cv2.putText(B,'3+ mm',(285,S.H*UP-45),cv2.FONT_HERSHEY_SIMPLEX,0.5,(40,40,40),1)
    return A,B
if __name__=='__main__':
    for flat,folder in [(False,'overlays'),(True,'overlays_publishable')]:
        montA=[];montB=[]
        for v in ['front','side','back']:
            for mode in ['modeF','modeL']:
                A,B=draw(v,mode,flat)
                cv2.imwrite(OUT+f'{folder}/overlay_{v}_{mode}.png',A)
                cv2.imwrite(OUT+f'{folder}/deviation_heat_{v}_{mode}.png',B)
                if mode=='modeF': montA.append(A); montB.append(B)
                print(folder,v,mode,flush=True)
        cv2.imwrite(OUT+f'{folder}/overlay_all_views_modeF.png',np.hstack([cv2.resize(a,None,fx=0.5,fy=0.5,interpolation=cv2.INTER_AREA) for a in montA]))
        cv2.imwrite(OUT+f'{folder}/deviation_heat_all_views_modeF.png',np.hstack([cv2.resize(a,None,fx=0.5,fy=0.5,interpolation=cv2.INTER_AREA) for a in montB]))
