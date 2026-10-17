# Final asset check: frame count = source, no audio / extra tracks, 672x1280, size < 1.8 MB, band edges 0 on every frame,
# first/last alpha bbox. usage: ship_check.py <avif> <n>
import sys,os,json,numpy as np;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
p,n=sys.argv[1],sys.argv[2]; st=streams(p); A=dec_rgba(p)[...,3][:,:,:672]
info=json.loads(__import__('subprocess').run(['ffprobe','-v','error','-show_entries','stream=codec_type','-of','json',p],capture_output=True).stdout)['streams']
R=dict(bytes=os.path.getsize(p),under_1_8MB=os.path.getsize(p)<1.8e6,frames=len(A),source_frames=nframes(n),frames_ok=len(A)==nframes(n),
  audio_streams=sum(1 for s in info if s.get('codec_type')=='audio'),edges=[int(A[:,:,:2].max()),int(A[:,:,-2:].max()),int(A[:,-2:].max())],
  top_row_alpha32_frames=int((A[:,0,:]>32).any(1).sum()))
R['ok']=R['under_1_8MB'] and R['frames_ok'] and R['audio_streams']==0 and R['edges']==[0,0,0]
print(json.dumps(R))
