# wbpipe (rebuilt 2026-10-14 after the box restore lost /workspace/f807/bridge/wb): shared helpers.
import numpy as np
from PIL import Image
REPO='/workspace/r67/'
VID='/workspace/bridge/wbpipe/vid/'
def idle_rgba():
    return np.asarray(Image.open(REPO+'public/rai/idle.png').convert('RGBA').resize((720,1280),Image.LANCZOS))
def L(f):
    f=f.astype(np.float32)
    if f.shape[-1]==4: a=f[...,3:4]/255.; return (f[...,:3]*a+255*(1-a)).mean(2)
    return f[...,:3].mean(2)
def dark_feats(rgb):
    """figure features on a white-studio RGB (or RGBA flattened): sole = lowest figure row, fx0/fx1 = shoe x extent
    over the 40 rows above the sole, fcx = their centre, crown = top figure row."""
    l=L(rgb); fig=l<120
    rows=np.where(fig.sum(1)>=3)[0]; sole=int(rows.max()); crown=int(rows.min())
    band=fig[sole-40:sole+1]; xs=np.where(band.any(0))[0]
    return dict(sole=sole,crown=crown,fx0=int(xs.min()),fx1=int(xs.max()),fcx=(xs.min()+xs.max())/2)
import subprocess
def dec(p,m):
    r=subprocess.run(['ffmpeg','-v','error','-i',p,'-map','0:%d'%m,'-f','rawvideo','-pix_fmt','rgb24' if m==2 else 'gray','-'],capture_output=True,check=True).stdout
    return np.frombuffer(r,np.uint8).reshape(-1,1280,672,3 if m==2 else 1)
def dec_rgba(p):
    c,a=dec(p,2),dec(p,3); o=np.zeros((len(c),1280,720,4),np.uint8); o[:,:,:672,:3]=c; o[:,:,:672,3]=a[...,0]; return o
# --- added 2026-10-17 (second restore): helpers used by reg_scan.py / gate.py / validate.py
import os,json
ROOT=os.path.dirname(os.path.abspath(__file__))+'/'
STAGE=(720,1280)
def warp(im,s,tx,ty,fill=(255,255,255),resample=Image.BICUBIC):
    """uniform affine source -> 720x1280 stage: stage = s*src + (tx,ty)."""
    return np.asarray(im.transform(STAGE,Image.AFFINE,(1/s,0,-tx/s,0,1/s,-ty/s),resample=resample,fillcolor=fill))
def streams(p):
    return json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','stream=index,nb_frames,width,height','-of','json',p],capture_output=True,check=True).stdout)['streams']
def extract(mp4,n):
    """video stream 0 only (no audio, no cover art) -> vid/hf<n>/fNNN.png"""
    d=VID+f'hf{n}/'; os.makedirs(d,exist_ok=True)
    subprocess.run(['ffmpeg','-v','error','-y','-i',mp4,'-map','0:v:0','-vsync','passthrough','-start_number','0',d+'f%03d.png'],check=True)
    return sorted(os.listdir(d))
def frames(n,kind='hf'):
    d=VID+f'{kind}{n}/'; return [d+f for f in sorted(os.listdir(d)) if f.endswith('.png')]
# WB_WORK redirects cut/ ship/ enc/ (validation runs write to a scratch root and leave the shipped build alone).
WORK=os.environ.get('WB_WORK',ROOT).rstrip('/')+'/'
def nframes(n): return len([f for f in os.listdir(VID+f'hf{n}') if f.endswith('.png')])
