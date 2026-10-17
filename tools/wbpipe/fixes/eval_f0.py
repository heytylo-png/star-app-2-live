import sys,os,json,numpy as np,importlib
sys.argv=['process.py','1366n']; sys.path.insert(0,'/workspace/bridge/wbpipe'); sys.path.insert(0,'/workspace/bridge/wbpipe/fixes')
os.environ.pop('WB_FIX',None)
import process as PR; from lib import *
import hf1366n as FX
I=idle_rgba()
def body(A): return round(float(np.abs(L(A)-L(I)).mean()),2)
def ev(lut,tag):
    FX.P['shirt_lut']=lut
    out={}
    for k in (0,144):
        S=np.asarray(Image.open(f'/workspace/bridge/hf_new/stage1/f{k:03d}.png'))
        base=PR.edge(PR.toward_idle(S,1.0)); fx=PR.edge(PR.toward_idle(FX.fix(k,S),1.0))
        out[k]=(body(base),body(fx))
    print(tag,out)
ev(None,'skin+earrings')
# shirt LUT: quantile-match clip f0 shirt L to idle shirt L (same mask rule, torso rows)
S=np.asarray(Image.open('/workspace/bridge/hf_new/stage1/f000.png')).astype(np.float32)
ms=FX.shirt_mask(S)>0.5; mi=FX.shirt_mask(I.astype(np.float32))>0.5
Ls=FX.to_lab(S[...,:3])[...,0][ms]; Li=FX.to_lab(I[...,:3].astype(np.float32))[...,0][mi]
q=np.linspace(0,100,101); xs=np.percentile(Ls,q); ys=np.percentile(Li,q)
grid=np.linspace(0,100,101); lut=np.interp(grid,xs,ys); lut=np.where(grid<xs[0],grid+(ys[0]-xs[0]),lut); lut=np.where(grid>xs[-1],grid+(ys[-1]-xs[-1]),lut)
lut=np.maximum.accumulate(np.clip(lut,0,100))
print('shirt L quantiles clip',xs[[5,25,50,75,95]].round(1),'idle',ys[[5,25,50,75,95]].round(1))
ev(lut.round(3).tolist(),'skin+earrings+shirtLUT')
json.dump(lut.round(3).tolist(),open('/workspace/bridge/hf_new/shirt_lut.json','w'))
