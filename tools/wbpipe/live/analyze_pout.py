import json, sys, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
D=sys.argv[1]; OUT=sys.argv[2] if len(sys.argv)>2 else D
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',18)
L=json.load(open(D+'/bridge_log.json')); S=json.load(open(D+'/samples.json')); M=json.load(open(D+'/sc_meta.json')); G=json.load(open(D+'/geo.json'))
LY=json.load(open(D+'/layers.json')) if os.path.exists(D+'/layers.json') else []
req=json.load(open(D+'/requests.json'))
# wave segments: the first in-run of 97 and the first out-run of 145 after it
segs=[]
for t,c,f in L:
    if segs and segs[-1]['c']==c and f==segs[-1]['last']+1: segs[-1]['last']=f; segs[-1]['ts'].append(t)
    else: segs.append(dict(c=c,first=f,last=f,ts=[t]))
NIN=int(os.environ.get('NIN','49'))
win=next(s for s in segs if s['c']=='in' and s['first']==0 and s['last']==NIN-1)
wout=next(s for s in segs if s['c']=='out' and s['first']==0 and s['last']==144 and s['ts'][0]>win['ts'][-1])
res=dict(win_frames=len(win['ts']),win_skips=0,win_ms=round(win['ts'][-1]-win['ts'][0],1),wout_frames=len(wout['ts']),wout_ms=round(wout['ts'][-1]-wout['ts'][0],1))
# samples
def sh(a,b): return [s for s in S if a<=s['t']<=b]
t_hold0=win['ts'][-1]+42; t_send=wout['ts'][0]
hold=[s for s in sh(t_hold0,t_send-5)]
res['hold_sheets']=sorted(set(x for s in hold for x in s['sh']))
mid=sh(wout['ts'][0]+1,wout['ts'][-1]+30)
res['wout_non_bridge_samples']=sum(1 for s in mid if any(not x.startswith('po') for x in s['sh']))
res['wout_idle_png_samples']=sum(1 for s in mid if any(x.startswith('idle') for x in s['sh']))
res['max_layers_shown']=max(s['nsh'] for s in S)
after=[s for s in S if s['t']>wout['ts'][-1]+42][:30]
res['after_wout']=sorted(set(x for s in after for x in s['sh']))
# past-4s: any win frame index >96 or hold before frame 96
res['win_max_index']=win['last']
res['pout_requests']=sorted(set(u.split('/')[-1] for u in req if 'pout' in u))
res['pout_official_requests']=[u for u in req if 'pout_official' in u]
res['layers']=LY
# screencast frame nearest after t
mt=np.array([m['t'] for m in M])
def shot(t):
    i=int(np.searchsorted(mt,t+20)); i=min(i,len(M)-1); return Image.open(M[i]['f']).convert('RGB'), M[i]['t']
# stage crop from geo (any sheet rect), scaled to screenshot size
g=next(iter(G.values())); sx0,sy0,sw,sh_=g['stage']
im0=Image.open(M[0]['f'])
vw=1280 if im0.width/im0.height>1 else 412
k=im0.width/vw
rect=[v*k for v in g['rect']]
def crop(im):
    x,y,w,h=rect; return im.crop((int(x),int(y),int(x+w),int(y+h)))
def strip(items,fn,title):
    tiles=[]
    for lab,t in items:
        im,tt=shot(t); c=crop(im); c=c.resize((int(c.width*560/c.height),560)); d=ImageDraw.Draw(c); d.rectangle([0,0,c.width,26],fill=(0,0,0)); d.text((4,3),lab,fill=(255,255,0),font=F); tiles.append(c)
    o=Image.new('RGB',(sum(t.width for t in tiles)+6*len(tiles),600),'white'); d=ImageDraw.Draw(o); d.text((6,8),title,fill=(0,0,0),font=F); x=0
    for t in tiles: o.paste(t,(x,36)); x+=t.width+6
    o.save(fn)
ws=win['ts']; os_=wout['ts']
NL=NIN-1
strip([('1158 f0 0.0s',ws[0]),('f12 0.5s',ws[12]),('f24 1.0s',ws[24]),('f36 1.5s',ws[36]),('f%d %.3fs (last)'%(NL,NL/24),ws[NL]),('HOLD +0.5s',ws[NL]+500),('HOLD before send',t_send-60)],OUT+'/strip_intro_hold.png','Pout send: 1158 f0-f%d (0-2.000 s), then hold (= f%d, crossed-arms frown)'%(NL,NL))
strip([('HOLD',t_send-60),('1162 f0',os_[0]),('f7 .3s',os_[7]),('f12 .5s',os_[12]),('f24 1s',os_[24]),('f48 2s',os_[48]),('f96 4s',os_[96]),('f144 6s',os_[144]),('IDLE +0.2s',os_[144]+250)],OUT+'/strip_next_send_1162_idle.png','Next send: 1162 full forward, then idle')
# joins: screenshot diffs in head band and shoe band (stage-relative)
def band(im,y0,y1):
    c=np.asarray(crop(im)).astype(float); H=c.shape[0]; return c[int(H*y0):int(H*y1)]
J={}
for nm,ta,tb in [('idle->1158f0',ws[0]-80,ws[0]),('1158last->hold',ws[-1],ws[-1]+300),('hold->1162f0',t_send-60,os_[0]),('1162f144->idle',os_[144],os_[144]+300)]:
    A,_=shot(ta); B,_=shot(tb)
    J[nm]={b:round(float(np.abs(band(A,*r)-band(B,*r)).mean()),2) for b,r in {'head':(0.0,0.2),'torso':(0.2,0.55),'legs':(0.55,0.88),'shoes':(0.88,1.0)}.items()}
    ov=Image.blend(crop(A),crop(B),0.5); ov.save(OUT+'/join_%s.png'%nm.replace('->','_to_'))
res['join_screen_mean_abs_diff_incl_ui']=J
cv=[l for l in LY if l['tag']=='CANVAS']
if cv:
    sc=cv[0]['rect'][3]/1280.0; res['css_px_per_clip_px']=round(sc,4)
    res['clip_joins_px']=json.load(open('/workspace/f807/bridge/p1158/chk/joins.json'))
json.dump(res,open(OUT+'/pout_report.json','w'),indent=1); print(json.dumps({k:v for k,v in res.items() if k!='layers'},indent=1)); print('layers',[(l['tag'],l['clip'],[round(v,1) for v in l['rect']]) for l in LY if l['tag']=='CANVAS' or l['role']=='body'][:8])
