# Source gate for a new welcome clip (before any build). usage: gate.py <mp4> <n> [outdir]
# Measures: fps/frames, cadence (distinct poses vs 1329 / old 1366 sources), camera lock + feet (sole, shoe x, shoe width
# over all frames), registration scale (reg_scan rule, auto range from shoe width) vs 1.845, stage top (figure / hand),
# bookends f0 + last vs idle (face score, silhouette XOR) at the one fixed registration and at each frame's own scale.
# Writes <outdir>/gate.json, GATE.md, montage.png, reg_first.png, reg_last.png. Exit code 0 = PASS, 1 = FAIL.
import sys,os,json,subprocess,numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from lib import *
import reg_scan as RS
MP4,N=sys.argv[1],sys.argv[2]; OUT=sys.argv[3] if len(sys.argv)>3 else ROOT+f'gate{N}'; os.makedirs(OUT,exist_ok=True)
REF={'1329':ROOT+'src/welcome-wave-1329.mp4','1366':ROOT+'src/welcome-flip-1366.mp4'}
def gray_frames(p,w=360):
    st=[s for s in streams(p) if 'width' in s][0]; h=int(round(w*int(st['height'])/int(st['width'])/2)*2)
    r=subprocess.run(['ffmpeg','-v','error','-i',p,'-map','0:v:0','-vsync','passthrough','-vf',f'scale={w}:{h}','-f','rawvideo','-pix_fmt','gray','-'],capture_output=True,check=True).stdout
    return np.frombuffer(r,np.uint8).reshape(-1,h,w).astype(np.float32)
def cadence(p):
    F=gray_frames(p); d=np.abs(np.diff(F,axis=0)).mean((1,2)); p90=float(np.percentile(d,90))
    return dict(frames=len(F),distinct_poses=int(1+(d>=0.1*p90).sum()),near_dup=int((d<0.1*p90).sum()),median_diff=round(float(np.median(d)),3),
                p90_diff=round(p90,3),period3=round(float(np.mean(d[2::3])/max(1e-6,np.mean(np.r_[d[0::3],d[1::3]]))),2))
R=dict(mp4=MP4,n=N)
info=json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration','-of','json',MP4],capture_output=True).stdout)['streams']
R['streams']=info
R['cadence']={N:cadence(MP4),**{k:cadence(v) for k,v in REF.items() if os.path.exists(v)}}
fs=[VID+f'hf{N}/'+f for f in extract(MP4,N)]
FE=[]
for f in fs:
    a=np.asarray(Image.open(f).convert('RGB')); fe=dark_feats(a); m=L(a)<235
    rows=np.where(m.sum(1)>=3)[0]; fe['top']=int(rows.min()); fe['edge_touch']=int(m[0].sum()+m[-1].sum()+m[:,0].sum()+m[:,-1].sum()); FE.append(fe)
H,W=a.shape[:2]; rng=lambda k:[min(x[k] for x in FE),max(x[k] for x in FE)]
sw=[x['fx1']-x['fx0'] for x in FE]; ht=[x['sole']-x['crown'] for x in FE]
R['camera']=dict(size=[W,H],sole=rng('sole'),fx0=rng('fx0'),fx1=rng('fx1'),shoe_width=[min(sw),max(sw)],fig_height=[min(ht),max(ht)],
    height_first_last=[ht[0],ht[-1]],sole_margin_px=H-1-max(x['sole'] for x in FE),edge_touch_frames=sum(1 for x in FE if x['edge_touch']))
s_est=79*1.845/sw[0]
fe0,res=RS.scan(N,s_est-0.08,s_est+0.08,0.001); s,tx,ty=res[0][1],res[0][2],res[0][3]
R['registration']=dict(s=s,tx=tx,ty=ty,s_vs_1845=round(s/1.845,3),score=res[0][0],upscale_720_equiv=round(s*W/720,3),fig_height_stage=round(s*ht[0]),old1366_fig_height_stage=1249)
sy=lambda y:s*y+ty
hx0,hx1=(260-tx)/s,(460-tx)/s; hand=[]
for i,f in enumerate(fs):
    a=np.asarray(Image.open(f).convert('RGB')).astype(int); r,g,b=a[...,0],a[...,1],a[...,2]
    sk=(r>150)&(r-b>45)&(r-g>15)&(g>80); sk[:,max(0,int(hx0)):int(hx1)]=False
    rows=np.where(sk.sum(1)>=4)[0]
    if len(rows): hand.append((i,round(sy(rows.min()),1)))
R['stage_top']=dict(figure_top_min=round(min(sy(x['top']) for x in FE),1),frames_figure_above_0=int(sum(sy(x['top'])<0 for x in FE)),
    hand_top_min=list(min(hand,key=lambda h:h[1])) if hand else None)
I=idle_rgba(); im=I[...,3]>128
def book(path,s,tx,ty):
    A=warp(Image.open(path).convert('RGB'),s,tx,ty); x=(L(A)<235)^im
    return dict(face=RS.score(A)[0],xor=int(x.sum())),A
B={}
for tag,i in (('first',0),('last',len(fs)-1)):
    b,A=book(fs[i],s,tx,ty); Image.fromarray(A).save(f'{OUT}/reg_{tag}.png')
    fe=FE[i]; best=None
    for ss in np.arange(s*0.8,s*1.2,0.003):
        p=RS.reg_params(fe,ss); sc=RS.score(warp(Image.open(fs[i]).convert('RGB'),*p))
        if best is None or sc[0]<best[0]: best=(sc[0],round(float(ss),3))
    b['own_scale']=dict(s=best[1],face=best[0]); B[tag]=b
ref={}
if os.path.exists(REF['1366']):
    rf=frames('1366'); 
    for tag,p in (('first',rf[0]),('last',rf[-1])): ref[tag]=book(p,1.845,-303.46749999999884,-540.413749999997)[0]
B['ref_old1366']=ref; R['bookends']=B
c=R['cadence'][N]; cam=R['camera']; reg=R['registration']; st=R['stage_top']
xr=max(ref.get('first',{'xor':54133})['xor'],ref.get('last',{'xor':54690})['xor'])
checks=dict(
  fps24=any(x.get('r_frame_rate')=='24/1' for x in info if x.get('codec_type')=='video'),
  true_24fps=c['distinct_poses']>=0.85*c['frames'] and c['period3']<1.5,
  camera_locked=(cam['sole'][1]-cam['sole'][0])<=2 and (cam['shoe_width'][1]-cam['shoe_width'][0])<=3,
  feet_in_frame=cam['sole_margin_px']>=4 and cam['edge_touch_frames']==0,
  framed_larger=reg['s']<1.80,   # stage px per source px; old 1366 = 1.845 (finer scan reads 1.844); < 1.80 = clearly bigger in its frame
  hand_on_stage=bool(st['hand_top_min'] is None or st['hand_top_min'][1]>=0),
  gesture_present=bool(st['hand_top_min'] is not None and st['hand_top_min'][1]<330),   # a hand reaches head height (flip / wave); 1599 idle-only: 383
  start_idle=B['first']['face']<=20 and B['first']['xor']<=1.2*xr,
  end_idle=B['last']['face']<=20 and B['last']['xor']<=1.2*xr)
R['checks']=checks; R['pass']=all(checks.values())
json.dump(R,open(f'{OUT}/gate.json','w'),indent=1,default=str)
idx=np.linspace(0,len(fs)-1,13).round().astype(int); tw=W*292//H
mont=Image.new('RGB',(tw*7,584),'white')
for k,i in enumerate(idx): mont.paste(Image.open(fs[i]).convert('RGB').resize((tw,292)),((k%7)*tw,(k//7)*292))
mont.save(f'{OUT}/montage.png')
md=[f"# gate {N}: {'PASS' if R['pass'] else 'FAIL'}",f"source {MP4}",
 f"cadence: {c} | refs {{k:v for k,v in R['cadence'].items() if k!=N}}".replace('{k:v for k,v in R[\'cadence\'].items() if k!=N}',json.dumps({k:v for k,v in R['cadence'].items() if k!=N})),
 f"camera: {cam}",f"registration: {reg}",f"stage top: {st}",f"bookends: {json.dumps(B)}",f"checks: {checks}"]
open(f'{OUT}/GATE.md','w').write('\n\n'.join(md)+'\n')
print('\n'.join(md)); sys.exit(0 if R['pass'] else 1)
