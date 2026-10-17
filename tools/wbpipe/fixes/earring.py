import sys,numpy as np,cv2;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
from scipy import ndimage as ndi
REG=(slice(110,340),slice(220,500))
def detect(X,gold=False):
    """small bright compact blobs inside dark hair, head band. returns label mask of earring-candidate px (stage coords)"""
    rgb=X[...,:3].astype(np.float32); a=X[...,3]
    l=rgb.mean(2); mx=rgb.max(2); mn=rgb.min(2); sat=(mx-mn)/np.maximum(mx,1)
    br=(l>140)&(a>200)&((sat<0.45) if gold else (sat<0.2))
    if gold: br&=(rgb[...,0]>=rgb[...,2]+15)
    m=np.zeros_like(br); m[REG]=br[REG]
    dark=ndi.uniform_filter(((l<70)&(a>200)).astype(np.float32),15)
    lab,n=ndi.label(m,np.ones((3,3)))
    out=np.zeros(m.shape,bool); comps=[]
    for i,sl in enumerate(ndi.find_objects(lab),1):
        h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start; area=int((lab[sl]==i).sum())
        cy=(sl[0].start+sl[0].stop)/2; cx=(sl[1].start+sl[1].stop)/2
        if 2<=area<=70 and h<=11 and w<=11 and dark[int(cy),int(cx)]>0.45:
            out|=lab==i; comps.append((int(cx),int(cy),area))
    return out,comps
if __name__=='__main__':
    I=idle_rgba(); m,c=detect(I,gold=True); print('idle',c)
    for k in (0,20,40,50,60,80,110,144):
        X=np.asarray(Image.open(f'/workspace/bridge/hf_new/build/ship/welcome1366n_{k:03d}.png')); m,c=detect(X); print(k,c)
def lab(rgb): return cv2.cvtColor(rgb.astype(np.uint8)[None],cv2.COLOR_RGB2LAB)[0].astype(np.float32)
def track(X,prev):
    m,c=detect(X); picked=[]
    for side,(px,py) in enumerate(prev):
        cand=[(abs(x-px)+abs(y-py),x,y,ar) for x,y,ar in c if 6<=ar and 160<=y<=215 and ((x<380) if side==0 else (x>=380))]
        if cand:
            d,x,y,ar=min(cand)
            if d<=25: picked.append((x,y))
            else: picked.append(None)
        else: picked.append(None)
    lab_,n=ndi.label(m,np.ones((3,3))); mask=np.zeros(m.shape,bool)
    for p in picked:
        if p: 
            i=lab_[p[1],p[0]] if lab_[p[1],p[0]] else 0
            if i==0:
                ys,xs=np.nonzero(lab_); j=np.argmin((xs-p[0])**2+(ys-p[1])**2); i=lab_[ys[j],xs[j]]
            mask|=lab_==i
    return mask,[p for p in picked]
