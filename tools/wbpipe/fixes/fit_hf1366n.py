# fit fixes/hf1366n.json from the pre-ease stage1 frames (post + dark) of clip 1366n and idle.
import sys,os,json,numpy as np,cv2
sys.argv=['process.py','1366n']; os.environ.pop('WB_FIX',None)
sys.path.insert(0,'/workspace/bridge/wbpipe'); sys.path.insert(0,'/workspace/bridge/wbpipe/fixes')
import process as PR
from lib import *; from skin import skin_w
from multiprocessing import Pool
OUT='/workspace/bridge/hf_new/stage1/'; os.makedirs(OUT,exist_ok=True)
def job(k):
    p=OUT+f'f{k:03d}.png'
    if not os.path.exists(p): Image.fromarray(PR.stage1(k)).save(p)
    return k
if __name__=='__main__':
    with Pool(8) as pl: pl.map(job,range(PR.NF))
    json.dump(dict(earring_pos=[[None,None]]*PR.NF,face_box=[100,300,250,470],skin_shift_face=[0,0,0],skin_shift_body=[0,0,0],gold_lab=[0,0,0],silver_lab=[1,0,0]),open('/workspace/bridge/wbpipe/fixes/hf1366n.json','w'))
    import importlib; import hf1366n as FX
    def lab(rgb): return FX.to_lab(rgb.astype(np.float32))
    I=idle_rgba().astype(np.float32); LI=lab(I[...,:3])
    # earrings: idle gold stars at (320,188) / (425,184); track silver stars
    prev=[(320,188),(425,184)]; pos=[]; sil=[]
    F=[np.asarray(Image.open(OUT+f'f{k:03d}.png')) for k in range(PR.NF)]
    for k,X in enumerate(F):
        lab_,keep=FX.blobs(X); cur=[]
        for side,(px,py) in enumerate(prev):
            best=None
            for i,sl in enumerate(__import__('scipy.ndimage',fromlist=['x']).find_objects(lab_),1):
                if not keep[i]: continue
                cy=(sl[0].start+sl[0].stop)//2; cx=(sl[1].start+sl[1].stop)//2; ar=int((lab_[sl]==i).sum())
                if ar<6 or not (160<=cy<=215) or ((cx>=380) if side==0 else (cx<380)): continue
                d=abs(cx-px)+abs(cy-py)
                if d<=25 and (best is None or d<best[0]): best=(d,cx,cy)
            cur.append([best[1],best[2]] if best else None)
        pos.append(cur); prev=[tuple(c) if c else p for c,p in zip(cur,prev)]
        for c in cur:
            if c: m=lab_==lab_[c[1],c[0]]; sil.append(lab(X[...,:3].astype(np.float32))[m].mean(0)) if lab_[c[1],c[0]] else None
    from scipy import ndimage as ndi
    import earring as E
    mI,_=E.detect(I.astype(np.uint8),gold=True); lb,_=ndi.label(mI,np.ones((3,3))); gm=(lb==lb[188,320])|(lb==lb[184,425])
    gold=LI[gm].mean(0); silver=np.mean(sil,0)
    # skin shifts per zone, frames 8..NF-9, wide skin mask (blush included)
    fb=np.zeros((1280,720),bool); fb[100:300,250:470]=True
    def zone(X,z):
        w=(skin_w(X.astype(np.float32))>0.5)&z; return lab(X[...,:3].astype(np.float32))[w].mean(0)
    cf=np.mean([zone(F[k],fb) for k in range(8,PR.NF-8,4)],0); cb=np.mean([zone(F[k],~fb) for k in range(8,PR.NF-8,4)],0)
    idf=zone(I,fb); idb=zone(I,~fb)
    P=dict(earring_pos=pos,face_box=[100,300,250,470],skin_shift_face=(idf-cf).round(3).tolist(),skin_shift_body=(idb-cb).round(3).tolist(),
           gold_lab=gold.round(3).tolist(),silver_lab=silver.round(3).tolist(),
           fit=dict(idle_face=idf.round(2).tolist(),clip_face=cf.round(2).tolist(),idle_body=idb.round(2).tolist(),clip_body=cb.round(2).tolist(),
                    earring_found=[sum(1 for c in p if c) for p in pos]))
    json.dump(P,open('/workspace/bridge/wbpipe/fixes/hf1366n.json','w'))
    print(json.dumps({k:v for k,v in P.items() if k!='earring_pos'}))
    print('earring misses',[(k,p) for k,p in enumerate(pos) if None in p])
