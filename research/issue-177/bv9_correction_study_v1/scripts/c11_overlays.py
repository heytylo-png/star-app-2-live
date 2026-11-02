#!/usr/bin/env python3
"""Before/after contour overlays (fixed baseline cameras). red = official reference outline, cyan = bv9 baseline outline, yellow = candidate outline.
local (with dimmed reference underlay) -> overlays/ ; contour-only (flat grey background, NO reference pixels) -> overlays_publishable/"""
import sys,os,json; sys.path.insert(0,os.path.dirname(__file__))
import numpy as np, cv2, cs_common as C
S=C.S; N=C.NEW
GEOM={'baseline':N+'work/bv9_geom_rerun.npz','A':N+'work/geom_A_arm_hand.npz','B':N+'work/geom_B_foot.npz','B1':N+'work/geom_B1_foot_ytrans.npz'}
LAB={'A':'A arm/hand (3.5 mm inward)','B':'B foot (pitch+floor)','B1':'B1 foot (pitch+floor+Y shift; post-hoc)'}
MASKS={}
def candmask(k,v,cam):
    V,T,M=C.load_geom(GEOM[k]); C.set_geom(V,T,M); return S.render(v,cam['s'],cam['tx'],cam['ty'],4)
def contours(m4,up_out):
    cs,_=cv2.findContours(m4.astype(np.uint8),cv2.RETR_LIST,cv2.CHAIN_APPROX_NONE); return [c.reshape(-1,2)*(up_out/4.0) for c in cs]
def draw(view,cand,mode,crop_z,flat,up_out=3,xcrop=None):
    cam=C.BASE[view]['modeF_cam' if mode=='modeF' else 'modeL_cam']; s,tx,ty=cam['s'],cam['tx'],cam['ty']
    rm=C.refmask(view); r4=cv2.resize(rm,(S.W*4,S.H*4),interpolation=cv2.INTER_NEAREST)
    mb=candmask('baseline',view,cam); mc=candmask(cand,view,cam)
    _,im=S.ref_mask(view)
    if flat: base=np.full((S.H*up_out,S.W*up_out,3),70,np.uint8)
    else:
        g=cv2.cvtColor(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),cv2.COLOR_GRAY2BGR); base=(cv2.resize(g,(S.W*up_out,S.H*up_out),interpolation=cv2.INTER_CUBIC)*0.55).astype(np.uint8)
    for m,col,th in [(r4,(0,0,255),1),(mb,(255,255,0),1),(mc,(0,215,255),1)]:
        for c in contours(m,up_out):
            p=np.round(c).astype(int); p[:,0]=np.clip(p[:,0],0,S.W*up_out-1); p[:,1]=np.clip(p[:,1],0,S.H*up_out-1)
            base[p[:,1],p[:,0]]=col
    y0=int((ty-s*crop_z[1])*up_out); y1=int((ty-s*crop_z[0])*up_out)
    x0,x1=(0,S.W*up_out) if xcrop is None else xcrop
    img=base[max(y0,0):y1,x0:x1].copy()
    t=f'{view} {mode} fixed-baseline camera | red=official ref outline  cyan=bv9  yellow={cand}'
    cv2.putText(img,t,(8,22),cv2.FONT_HERSHEY_SIMPLEX,0.55,(255,255,255),1,cv2.LINE_AA)
    cv2.putText(img,f'z {crop_z[0]}..{crop_z[1]} mm (model mm), 1 px = {1/(s*up_out)*1:.3f} mm',(8,44),cv2.FONT_HERSHEY_SIMPLEX,0.5,(255,255,255),1,cv2.LINE_AA)
    return img
os.makedirs(N+'overlays',exist_ok=True); os.makedirs(N+'overlays_publishable',exist_ok=True)
JOBS=[('A','front',(10,105),None),('A','back',(10,105),None),('B','side',(-92,-35),(950,1750)),('B1','side',(-92,-35),(950,1750)),('B1','front',(-92,-35),None),('B1','back',(-92,-35),None),('B','front',(-92,-35),None),('B','back',(-92,-35),None)]
for flat,folder in [(False,'overlays'),(True,'overlays_publishable')]:
    for cand,view,cz,xc in JOBS:
        for mode in ['modeF','modeL']:
            if mode=='modeL' and (cand,view) not in [('A','front'),('A','back'),('B','side'),('B1','side')]: continue
            img=draw(view,cand,mode,cz,flat,3,xc)
            cv2.imwrite(N+f'{folder}/cand{cand}_{view}_{mode}_beforeafter.png',img)
    # full-body three-view montage (Mode F) for each candidate
    for cand in ['A','B','B1']:
        ims=[draw(v,cand,'modeF',(-92,110),flat,2) for v in C.VIEWS]
        h=max(i.shape[0] for i in ims); ims=[cv2.copyMakeBorder(i,0,h-i.shape[0],0,0,cv2.BORDER_CONSTANT,value=(40,40,40)) for i in ims]; cv2.imwrite(N+f'{folder}/cand{cand}_all_views_modeF_fullbody.png',np.hstack(ims))
    print('done',folder)
