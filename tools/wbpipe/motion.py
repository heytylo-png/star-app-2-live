# per-frame motion: mean |dL| between consecutive frames (figure region, flattened on white) + DIS flow magnitude p95
import sys,json,numpy as np,cv2;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
def frames(src):
    if src.endswith('.avif'): return [L(f) for f in dec_rgba(src)]
    import glob; return [L(np.asarray(Image.open(f).convert('RGB'))) for f in sorted(glob.glob(src+'/f*.png'))]
R={}
for name,src in [a.split('=',1) for a in sys.argv[1:]]:
    F=frames(src); d=[];fl=[]
    dis=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    for k in range(1,len(F)):
        a=np.clip(F[k-1],0,255).astype(np.uint8); b=np.clip(F[k],0,255).astype(np.uint8)
        d.append(round(float(np.abs(F[k]-F[k-1]).mean()),3))
        f=dis.calc(a,b,None); m=np.hypot(f[...,0],f[...,1]); fl.append(round(float(np.percentile(m,99)),2))
    R[name]=dict(diff=d,flow99=fl); print(name,len(F),'diff',d[:40]); print('   flow99',fl[:40],flush=True)
import os
P='/workspace/bridge/wbpipe/motion.json'; old=json.load(open(P)) if os.path.exists(P) else {}; old.update(R); json.dump(old,open(P,'w'))
