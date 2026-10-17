# steps 3-6 for one clip: post (alpha-only cleanup) -> dark (skin + blush band B gains, learned from wb1 f0) ->
# face ease in over the first 8 frames from idle (ease-in, f0 face = idle) and out over the last 8 frames (f113-120 at 121 frames; adapts to the real length) to idle (wb/w14 pattern) -> edge (x fade 15->22 at both band
# edges, rows >= 1264 alpha 0). usage: process.py <n>
import sys,os,json,numpy as np,cv2;sys.path.insert(0,'/workspace/bridge/wbpipe')
from lib import *; from skin import skin_w,CHEEK
from scipy import ndimage as ndi
from multiprocessing import Pool
N=sys.argv[1]; NF=nframes(N); CUT=WORK+'cut/welcome%s_%03d/welcome%s_%03d_cut.png'; OUT=WORK+'ship/welcome%s_%03d.png'
G=json.load(open('/workspace/bridge/wbpipe/dark_gains.json'))
I=idle_rgba().astype(np.float32)
def post(A):
    a=A[...,3].copy()
    lab,n=ndi.label(a>0); sz=np.bincount(lab.ravel()); keep=np.zeros(n+1,bool); keep[1:]=sz[1:]>=40; a[~keep[lab]]=0   # specks
    hole=ndi.binary_fill_holes(a>0)&(a==0); lab,n=ndi.label(hole); sz=np.bincount(lab.ravel())
    small=np.zeros(n+1,bool); small[1:]=sz[1:]<30; fill=small[lab]                                                      # pinholes (not pockets)
    if fill.any():
        nb=ndi.grey_dilation(a,size=(3,3)); a[fill]=nb[fill]
    # white fringe on hair strands (alpha-only): near-white edge px next to transparency with dark hair beside them lose alpha
    rgb=A[...,:3].astype(np.int32); mn=rgb.min(2); darkn=ndi.maximum_filter((rgb.mean(2)<90)&(a>200),size=5)
    for _ in range(2):
        f=(a>0)&(mn>=200)&ndi.binary_dilation(a==0,np.ones((3,3),bool))&darkn
        a=np.where(f,np.rint(a*np.clip((235-mn)/35.,0,1)),a).astype(np.uint8)
    # thin near-white slivers in gaps (alpha-only): near-white px whose 5x5 neighbourhood is mostly transparent
    op=ndi.uniform_filter((a>128).astype(np.float32),size=5)
    a=np.where((a>0)&(mn>=200)&(op<0.3),0,a).astype(np.uint8)
    A=A.copy(); A[...,3]=a; A[a==0,:3]=0; return A
def dark(A):
    X=A.astype(np.float32); w=skin_w(X)[...,None]; ch=np.zeros(X.shape[:2],np.float32); ch[CHEEK]=1; ch=cv2.GaussianBlur(ch,(0,0),4)[...,None]
    g=(1-ch)*np.array(G['skin'],np.float32)+ch*np.array(G['cheek'],np.float32)
    X[...,:3]=X[...,:3]*(1+w*(g-1)); return np.clip(np.rint(X),0,255).astype(np.uint8)
def stage1(k):
    A=np.asarray(Image.open(CUT%(N,k,N,k)).convert('RGBA')); return dark(post(A))
GY,GX=np.mgrid[0:1280,0:720].astype(np.float32)
m=np.zeros((1280,720),np.float32); cv2.ellipse(m,(360,205),(92,82),0,0,360,1,-1); m=cv2.GaussianBlur(m,(0,0),10)
W=[0.25,0.6,0.9,1.0,0.85,0.6,0.35,0.12]; T=np.cumsum(W)/sum(W)
def toward_idle(S,t):
    if t<=0: return S
    la=np.clip(L(S),0,255).astype(np.uint8); lb=np.clip(L(I),0,255).astype(np.uint8)
    F=cv2.GaussianBlur(cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(la,lb,None),(0,0),3)
    S=S.astype(np.float32); As=cv2.remap(S,GX-t*F[...,0],GY-t*F[...,1],cv2.INTER_CUBIC); Bs=cv2.remap(I,GX+(1-t)*F[...,0],GY+(1-t)*F[...,1],cv2.INTER_CUBIC)
    face=(1-t)*As+t*Bs if t<1-1e-9 else I
    inner=cv2.erode(((S[...,3]>250)&(I[...,3]>250)).astype(np.uint8),np.ones((9,9),np.uint8)).astype(np.float32)
    mm=(m*cv2.GaussianBlur(inner,(0,0),3))[...,None]; o=S.copy(); o[...,:3]=S[...,:3]*(1-mm)+face[...,:3]*mm
    return np.clip(np.rint(o),0,255).astype(np.uint8)
def tw(k):
    if k<8:
        u=k/8.0
        return 1-u*u*(3-2*u) if os.environ.get('WB_BODY_EASE')=='1' else 1-(k/8.0)**2   # body morph: smoothstep (no step into f8)
    if k>=NF-8: return float(T[k-(NF-8)])
    return 0.0
x=np.arange(720,dtype=np.float32); fx=np.clip((x-15)/7,0,1)*np.clip((671-15-x)/7,0,1); fx[672:]=0
def edge(A):
    A=A.copy(); a=A[...,3].astype(np.float32)*fx[None]; a[1264:]=0; A[...,3]=np.rint(a).astype(np.uint8); A[A[...,3]==0,:3]=0; return A
BODY=os.environ.get('WB_BODY_EASE')=='1'
def body_toward_idle(S,t):
    """optional (WB_BODY_EASE=1): whole-figure morph to idle (DIS flow warp both ways + dissolve, all four channels) with the
    same weights as the face ease. For re-rendered sources whose shading/outline differ from idle; only use where the
    eased frames are still (no motion to ghost)."""
    if t<=0: return S
    if t>=1-1e-9: return np.clip(np.rint(I),0,255).astype(np.uint8)
    la=np.clip(L(S),0,255).astype(np.uint8); lb=np.clip(L(I),0,255).astype(np.uint8)
    F=cv2.GaussianBlur(cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(la,lb,None),(0,0),3)
    S=S.astype(np.float32); As=cv2.remap(S,GX-t*F[...,0],GY-t*F[...,1],cv2.INTER_CUBIC); Bs=cv2.remap(I,GX+(1-t)*F[...,0],GY+(1-t)*F[...,1],cv2.INTER_CUBIC)
    o=(1-t)*As+t*Bs; o[...,3]=np.clip(o[...,3],0,255); return np.clip(np.rint(o),0,255).astype(np.uint8)
def job(k):
    S=stage1(k); S=body_toward_idle(S,tw(k)) if BODY else toward_idle(S,tw(k)); Image.fromarray(edge(S),'RGBA').save(OUT%(N,k)); return k
if __name__=='__main__':
    os.makedirs(WORK+'ship',exist_ok=True)
    with Pool(8) as p: p.map(job,range(NF))
    print(N,'done',NF,'frames',[round(tw(k),3) for k in (0,4,7,8,NF-9,NF-8,NF-1)])
