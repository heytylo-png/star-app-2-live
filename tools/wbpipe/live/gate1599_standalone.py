import glob,json,subprocess,numpy as np
from PIL import Image
D='/workspace/bridge/wbpipe/vid/hf1599/'
I=np.asarray(Image.open('ref/idle.png').convert('RGBA').resize((720,1280),Image.LANCZOS))
def L(f):
    f=f.astype(np.float32)
    if f.shape[-1]==4: a=f[...,3:4]/255.; return (f[...,:3]*a+255*(1-a)).mean(2)
    return f[...,:3].mean(2)
def dark_feats(rgb):
    l=L(rgb); fig=l<120; rows=np.where(fig.sum(1)>=3)[0]; sole=int(rows.max()); crown=int(rows.min())
    xs=np.where(fig[sole-40:sole+1].any(0))[0]; return dict(sole=sole,crown=crown,fx0=int(xs.min()),fx1=int(xs.max()),fcx=(xs.min()+xs.max())/2)
LI=L(I);FB=(slice(120,285),slice(260,460))
def warp(im,s,tx,ty): return np.asarray(im.transform((720,1280),Image.AFFINE,(1/s,0,-tx/s,0,1/s,-ty/s),resample=Image.BICUBIC,fillcolor=(255,255,255)))
def score(A,r=4):
    X=L(A);b=None
    for dy in range(-r,r+1):
        for dx in range(-r,r+1):
            v=np.abs(X[FB]-np.roll(np.roll(LI,dy,0),dx,1)[FB]).mean()
            if b is None or v<b[0]: b=(round(float(v),2),dx,dy)
    return b
R={}
# cadence
r=subprocess.run(['ffmpeg','-v','error','-i','1599.mp4','-map','0:v:0','-vsync','passthrough','-vf','scale=360:-2','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True).stdout
F=np.frombuffer(r,np.uint8).reshape(145,-1).astype(np.float32); d=np.abs(np.diff(F,axis=0)).mean(1); p90=np.percentile(d,90)
R['cadence']=dict(n=len(F),median=round(float(np.median(d)),3),mean=round(float(d.mean()),3),p90=round(float(p90),3),distinct=int(1+(d>=0.1*p90).sum()),near_dup=int((d<0.1*p90).sum()),
  near_dup_idx=[int(i+1) for i in np.where(d<0.1*p90)[0]],period3_ratio=round(float(np.mean(d[2::3])/max(1e-6,np.mean(np.r_[d[0::3],d[1::3]]))),2))
# camera / feet
fs=sorted(glob.glob(D+'f*.png')); FE=[]
for f in fs:
    a=np.asarray(Image.open(f).convert('RGB')); fe=dark_feats(a); l=L(a); m=l<235
    rows=np.where(m.sum(1)>=3)[0]; fe['top']=int(rows.min()); fe['edge']=[int(m[0].sum()),int(m[-1].sum()),int(m[:,0].sum()),int(m[:,-1].sum())]
    sk=(a[...,0].astype(int)>150)&(a[...,0].astype(int)-a[...,2]>45)&(a[...,0].astype(int)-a[...,1]>15)&(a[...,1]>80); fe['skin']=sk
    FE.append(fe)
H,W=a.shape[:2]
st=lambda k:(min(x[k] for x in FE),max(x[k] for x in FE))
R['camera']=dict(size=[W,H],sole=st('sole'),fx0=st('fx0'),fx1=st('fx1'),crown=st('crown'),edge_touch_frames=[i for i,x in enumerate(FE) if any(x['edge'])][:20],
  sole_margin_px=H-1-FE[0]['sole'])
# registration
f0=Image.open(fs[0]).convert('RGB'); fe=FE[0]; res=[]
s_est=145.8/(fe['fx1']-fe['fx0'])
for s in np.arange(s_est-0.08,s_est+0.08,0.001):
    tx=363.5-s*fe['fcx']; ty=1258-s*(fe['sole']+0.75); res.append((score(warp(f0,s,tx,ty)),round(float(s),3),tx,ty))
res.sort(key=lambda r:(abs(r[0][2])>0,r[0][0])); s,tx,ty=res[0][1:]
R['reg']=dict(s=s,tx=tx,ty=ty,s_est_from_shoes=round(s_est,3),top4=[(x[0],x[1]) for x in res[:4]],fig_height_stage=round(s*(fe['sole']-fe['crown'])),old1366_fig_height_stage=1249)
json.dump([s,tx,ty],open('reg.json','w'))
# stage top
sy=lambda y: s*y+ty
R['stage_top']=dict(fig_top_min=round(min(sy(x['top']) for x in FE),1),frames_fig_above0=sum(sy(x['top'])<0 for x in FE))
# hand: skin pixels outside head columns (head cols approx from idle face box mapped back)
hx0=(260-tx)/s; hx1=(460-tx)/s
hand=[]
for i,x in enumerate(FE):
    sk=x['skin'].copy(); sk[:, int(hx0):int(hx1)]=False
    rows=np.where(sk.sum(1)>=4)[0]; hand.append((i,round(sy(rows.min()),1)) if len(rows) else (i,None))
hv=[h for h in hand if h[1] is not None]; R['stage_top']['hand_top_min']=min(hv,key=lambda h:h[1])
# bookends
im=I[...,3]>128; B={}
for i in (0,len(fs)-1):
    A=warp(Image.open(fs[i]).convert('RGB'),s,tx,ty); m=L(A)<235; x=m^im
    B[f'f{i}']=dict(face=score(A),xor_total=int(x.sum()),xor_arms=int(x[300:700].sum()),xor_head=int(x[:300].sum()))
    Image.fromarray(A).save(f'reg_f{i:03d}.png')
B['ref_1366']=dict(face=[12.69,16.75],xor_total=[54133,54690],xor_arms=[38298,38243],xor_head=[8958,9645])
B['ref_1596_fail']=dict(face=[47.91,35.2],xor_total=[96379,79561])
R['bookends']=B
for x in FE: del x['skin']
json.dump(FE,open('feats.json','w'))
print(json.dumps(R,indent=1,default=str))
