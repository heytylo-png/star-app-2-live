# hf4 retime: the 1366 source holds every pose for 3 frames (41 unique poses at f0,3,...,120 = 8 fps in a 24 fps file).
# Keep the key frames 3j bit-identical; replace the held 3j+1 / 3j+2 with flow in-betweens at t=1/3, 2/3 between keys 3j and 3j+3.
# Bidirectional DIS flow on the RGB source, Super-SloMo style intermediate flows, forward-backward occlusion weights.
import sys,os,numpy as np,cv2
from PIL import Image
from multiprocessing import Pool
SRC='/workspace/bridge/wbpipe/vid/hf1366/f%03d.png'; OUT='/workspace/bridge/wbpipe/vid/hf1366i/f%03d.png'
H,W=1280,720; GY,GX=np.mgrid[0:H,0:W].astype(np.float32)
import os as _os
_RAFT=None
def raft_flow(a,b):
    global _RAFT
    import torch, torchvision.models.optical_flow as of
    torch.set_num_threads(int(_os.environ.get('RAFT_THREADS','2')))
    if _RAFT is None:
        _RAFT=of.raft_large(weights=of.Raft_Large_Weights.DEFAULT).eval()
    sc=float(_os.environ.get('RAFT_SCALE','0.5')); h,w=int(H*sc)//8*8,int(W*sc)//8*8
    def t(x): x=cv2.resize(x,(w,h),interpolation=cv2.INTER_AREA); return torch.from_numpy(x).permute(2,0,1)[None].float()/127.5-1
    with torch.no_grad(): f=_RAFT(t(a),t(b),num_flow_updates=20)[-1][0].permute(1,2,0).numpy()
    f=cv2.resize(f,(W,H),interpolation=cv2.INTER_LINEAR); f[...,0]*=W/w; f[...,1]*=H/h; return f.astype(np.float32)
def flow(a,b):
    if _os.environ.get('FLOW','raft')=='raft': return raft_flow(a,b)
    d=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM); d.setFinestScale(0); d.setPatchSize(12); d.setPatchStride(4)
    d.setGradientDescentIterations(25); d.setVariationalRefinementIterations(10)
    return d.calc(cv2.cvtColor(a,cv2.COLOR_RGB2GRAY),cv2.cvtColor(b,cv2.COLOR_RGB2GRAY),None)
def warp(img,f): return cv2.remap(img,GX+f[...,0],GY+f[...,1],cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
def mid(I0,I1,F01,F10,t):
    Ft0=-(1-t)*t*F01+t*t*F10; Ft1=(1-t)**2*F01-t*(1-t)*F10
    # occlusion: forward-backward inconsistency of each side
    e0=np.linalg.norm(F01+warp(F10,F01),axis=2); e1=np.linalg.norm(F10+warp(F01,F10),axis=2)
    v0=warp((1/(1+e0**2)).astype(np.float32),Ft0); v1=warp((1/(1+e1**2)).astype(np.float32),Ft1)
    w0=(1-t)*v0+1e-4; w1=t*v1+1e-4
    A=warp(I0.astype(np.float32),Ft0); B=warp(I1.astype(np.float32),Ft1)
    return np.clip(np.rint((w0[...,None]*A+w1[...,None]*B)/(w0+w1)[...,None]),0,255).astype(np.uint8)
def splat(img,f,w):
    # forward bilinear splatting of img (float, HxWxC) by flow f with per-pixel weights w (softmax-splat style)
    x=GX+f[...,0]; y=GY+f[...,1]; x0=np.floor(x).astype(np.int64); y0=np.floor(y).astype(np.int64); fx=x-x0; fy=y-y0
    C=img.shape[2]; acc=np.zeros((H*W,C),np.float64); nrm=np.zeros(H*W,np.float64); src=img.reshape(-1,C).astype(np.float64)
    for dx,dy,ww in ((0,0,(1-fx)*(1-fy)),(1,0,fx*(1-fy)),(0,1,(1-fx)*fy),(1,1,fx*fy)):
        xi=x0+dx; yi=y0+dy; ok=((xi>=0)&(xi<W)&(yi>=0)&(yi<H)).ravel(); wt=(ww*w).ravel()[ok]; idx=(yi*W+xi).ravel()[ok]
        np.add.at(nrm,idx,wt); 
        for c in range(C): np.add.at(acc[:,c],idx,src[ok,c]*wt)
    return acc.reshape(H,W,C),nrm.reshape(H,W)
def mid_splat(I0,I1,F01,F10,t,alpha=0.08):
    A=I0.astype(np.float32); B=I1.astype(np.float32)
    e0=np.abs(A-warp(B,F01)).mean(2); e1=np.abs(B-warp(A,F10)).mean(2)
    a0,n0=splat(A,t*F01,np.exp(-alpha*e0)); a1,n1=splat(B,(1-t)*F10,np.exp(-alpha*e1))
    num=(1-t)*a0+t*a1; den=(1-t)*n0+t*n1
    lin=(1-t)*A+t*B
    out=np.where(den[...,None]>1e-3,num/np.maximum(den,1e-6)[...,None],lin)
    return np.clip(np.rint(out),0,255).astype(np.uint8)
def job(j):
    I0=np.asarray(Image.open(SRC%(3*j)).convert('RGB')); I1=np.asarray(Image.open(SRC%(3*j+3)).convert('RGB'))
    Image.fromarray(I0).save(OUT%(3*j))
    F01=flow(I0,I1); F10=flow(I1,I0)
    for s,t in ((1,1/3),(2,2/3)): Image.fromarray((mid_splat if _os.environ.get('MODE','splat')=='splat' else mid)(I0,I1,F01,F10,t)).save(OUT%(3*j+s))
    return j
if __name__=='__main__':
    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    js=[int(x) for x in _os.environ['JOBS'].split(',')] if _os.environ.get('JOBS') else range(40)
    with Pool(int(_os.environ.get('PROCS','4'))) as p: p.map(job,js)
    Image.open(SRC%120).convert('RGB').save(OUT%120)
    print('done',len(os.listdir(os.path.dirname(OUT))))
