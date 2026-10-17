# Per-clip fixes for the 1366 re-export (hf7, 2026-10-17), applied in process.py after post+dark and before the face ease
# (WB_FIX=fixes/hf1366n.py). Params from fixes/hf1366n.json (fit_hf1366n.py):
#  (a) earrings: the silver stars become idle's gold stars (earring blobs only, tracked per frame, 1 px halo)
#  (b) skin: Lab shift to idle per zone (face box / body), weighted by the wide skin mask (skin_w, blush included)
#  (c) shirt: optional L tone curve on the shirt mask (white, low saturation, torso rows), only if params say so
import json,os,numpy as np,cv2,sys
sys.path.insert(0,'/workspace/bridge/wbpipe'); from skin import skin_w
from scipy import ndimage as ndi
P=json.load(open(os.environ.get('WB_FIX_PARAMS') or os.path.join(os.path.dirname(os.path.abspath(__file__)),'hf1366n.json')))
def to_lab(rgb): return cv2.cvtColor((rgb/255.).astype(np.float32),cv2.COLOR_RGB2LAB)
def to_rgb(lab): return np.clip(cv2.cvtColor(lab.astype(np.float32),cv2.COLOR_LAB2RGB)*255,0,255)
REG=(slice(110,340),slice(220,500))
def blobs(X):
    rgb=X[...,:3].astype(np.float32); a=X[...,3]; l=rgb.mean(2); mx=rgb.max(2); mn=rgb.min(2); sat=(mx-mn)/np.maximum(mx,1)
    m=np.zeros(l.shape,bool); m[REG]=((l>140)&(a>200)&(sat<0.2))[REG]
    dark=ndi.uniform_filter(((l<70)&(a>200)).astype(np.float32),15)
    lab,n=ndi.label(m,np.ones((3,3))); keep=np.zeros(n+1,bool)
    for i,sl in enumerate(ndi.find_objects(lab),1):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start; ar=int((lab[sl]==i).sum())
        cy=(sl[0].start+sl[0].stop)//2; cx=(sl[1].start+sl[1].stop)//2
        keep[i]=2<=ar<=70 and h<=11 and w<=11 and dark[cy,cx]>0.45
    return lab,keep
def earrings(k,X):
    pos=P['earring_pos'][k]
    if not any(pos): return np.zeros(X.shape[:2],bool)
    lab,keep=blobs(X); m=np.zeros(X.shape[:2],bool)
    for p in pos:
        if not p: continue
        x,y=p; win=lab[max(0,y-6):y+7,max(0,x-6):x+7]; ids=[i for i in np.unique(win) if i and keep[i]]
        for i in ids: m|=lab==i
    return m
def fix(k,S):
    X=S.astype(np.float32); out=X.copy()
    Lb=to_lab(X[...,:3])
    # (b) skin
    w=skin_w(X); fz=np.zeros(w.shape,np.float32); y0,y1,x0,x1=P['face_box']; fz[y0:y1,x0:x1]=1; fz=cv2.GaussianBlur(fz,(0,0),8)
    sh=(fz[...,None]*np.array(P['skin_shift_face'],np.float32)+(1-fz[...,None])*np.array(P['skin_shift_body'],np.float32))
    Lb=Lb+w[...,None]*sh
    # (c) shirt tone curve (L only)
    if P.get('shirt_lut'):
        lut=np.array(P['shirt_lut'],np.float32); sm=shirt_mask(X)
        Lnew=np.interp(Lb[...,0],np.linspace(0,100,len(lut)),lut); Lb[...,0]=Lb[...,0]*(1-sm)+Lnew*sm
    rgb=to_rgb(Lb)
    # (a) earrings: core -> gold (idle star Lab, L scaled), 1 px halo -> gold chroma by brightness
    e=earrings(k,S)
    if e.any():
        halo=ndi.binary_dilation(e,np.ones((3,3),bool))&~e
        g=np.array(P['gold_lab'],np.float32); s=np.array(P['silver_lab'],np.float32)
        L2=to_lab(rgb)
        core=L2[e]; core[:,0]=core[:,0]*g[0]/s[0]; core[:,1]=g[1]; core[:,2]=g[2]; L2[e]=core
        hw=np.clip((L2[halo][:,0]-25)/50,0,1)[:,None]; hv=L2[halo]; hv[:,1:]=hv[:,1:]*(1-hw)+g[1:]*hw; L2[halo]=hv
        rgb=to_rgb(L2)
    out[...,:3]=rgb; out[out[...,3]==0,:3]=0
    return np.clip(np.rint(out),0,255).astype(np.uint8)
def shirt_mask(X):
    rgb=X[...,:3]; mx=rgb.max(2); mn=rgb.min(2); sat=(mx-mn)/np.maximum(mx,1); l=rgb.mean(2)
    m=((l>150)&(sat<0.14)&(X[...,3]>250)).astype(np.float32); m[:240]=0; m[720:]=0
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((3,3),np.uint8)); return cv2.GaussianBlur(m,(0,0),1.5)
