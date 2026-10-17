# step 8: decoded joins: idle->f0 and f120->idle (face/eyes/mouth/body L diff + best shift, feet/sole), in-clip steps, band edges.
import sys,json;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
I=idle_rgba()
FB=(slice(120,285),slice(260,460)); EB=(slice(150,200),slice(290,430)); MB=(slice(180,212),slice(345,410)); BODY=(slice(0,1280),slice(0,720))
def fd(a,b,box=FB): return round(float(np.abs(L(a)[box]-L(b)[box]).mean()),2)
def bs(a,b,r=4):
    X=L(a);Y=L(b);best=None
    for dy in range(-r,r+1):
        for dx in range(-r,r+1):
            v=np.abs(X[FB]-np.roll(np.roll(Y,dy,0),dx,1)[FB]).mean()
            if best is None or v<best[0]: best=(round(float(v),2),dx,dy)
    return best
def feats(f): x=np.clip(L(f),0,255).astype(np.uint8); return {k:v for k,v in dark_feats(np.stack([x]*3,-1)).items() if k in ('sole','fx0','fx1','crown')}
R={'idle':feats(I)}
for p in sys.argv[1:]:
    F=dec_rgba(p); n=len(F)
    st=[fd(F[k-1],F[k]) for k in range(1,n)]; sb=[fd(F[k-1],F[k],BODY) for k in range(1,n)]; a=F[...,3]
    R[p]=dict(frames=n,
      idle_to_f0=dict(face=fd(I,F[0]),eyes=fd(I,F[0],EB),mouth=fd(I,F[0],MB),body=fd(I,F[0],BODY),best=bs(I,F[0]),feet=feats(F[0])),
      last_to_idle=dict(face=fd(F[n-1],I),eyes=fd(F[n-1],I,EB),mouth=fd(F[n-1],I,MB),body=fd(F[n-1],I,BODY),best=bs(I,F[n-1]),feet=feats(F[n-1])),
      max_face_step=max(st),at=int(np.argmax(st))+1,max_body_step=max(sb),body_at=int(np.argmax(sb))+1,first8_face=st[:8],last8_face=st[-8:],
      edges=[int(a[:,:,:2].max()),int(a[:,:,670:672].max()),int(a[:,-2:].max())],minx=int(np.where((a>0).any((0,1)))[0].min()),
      top_rows_alpha_frames=int((a[:,0,:]>0).any(1).sum()),top_rows_alpha32_frames=int((a[:,0,:]>32).any(1).sum()))
print(json.dumps(R,indent=1,default=str))
