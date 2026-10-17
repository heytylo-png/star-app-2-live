# Wave 1292 live check: bridge_log segments, hold layers, idle sheets painted inside clips, requests, audio.
import json, sys
for D in sys.argv[1:]:
    L=json.load(open(D+'/bridge_log.json')); S=json.load(open(D+'/samples.json')); R=json.load(open(D+'/requests.json'))
    segs=[]
    for t,c,f in L:
        if segs and segs[-1]['c']==c and f==segs[-1]['last']+1: segs[-1]['last']=f; segs[-1]['t1']=t; segs[-1]['n']+=1; segs[-1]['fr'].append(f)
        else: segs.append(dict(c=c,first=f,last=f,t0=t,t1=t,n=1,fr=[f]))
    W=[s for s in segs if s['c'] in ('win','wout')]
    win=[s for s in segs if s['c']=='in' and s['n']==121]; wout=[s for s in segs if s['c']=='out' and s['n']==121]
    o={'build':json.load(open(D+'/build.json'))}
    o['win']=[(s['first'],s['last'],s['n'],round(s['t1']-s['t0'])) for s in win]
    o['wout']=[(s['first'],s['last'],s['n'],round(s['t1']-s['t0'])) for s in wout]
    o['all_segments']=[(s['c'],s['first'],s['last'],s['n']) for s in segs]
    if win and wout:
        a,b=win[0]['t1'],wout[0]['t0']
        H=[s for s in S if a<s['t']<b and s['ph']=='hold']
        o['hold_samples']=len(H); o['hold_layer_sets']=sorted({tuple(s['sh']) for s in H})
        mid=[s for s in S if win[0]['t0']<=s['t']<=win[0]['t1'] or wout[0]['t0']<=s['t']<=wout[0]['t1']]
        o['clip_samples']=len(mid); o['clip_samples_with_idle_sheet']=sum(any(x.startswith('idle') for x in s['sh']) for s in mid)
        o['clip_layer_sets_sample']=sorted({tuple(x[:4] for x in s['sh']) for s in mid})[:8]
        after=[s for s in S if s['t']>wout[0]['t1']][:3]; o['after_wout']=[s['sh'] for s in after]
        o['hold_window_ms']=round(b-a)
    o['audio_samples_au>0']=sum(1 for s in S if s.get('au'))
    urls=[u if isinstance(u,str) else u.get('url','') for u in R]
    o['req_1126']=[u for u in urls if '1126' in u]; o['req_1140']=[u for u in urls if '1140' in u]; o['req_wave']=sorted({u.split('/')[-1] for u in urls if 'wave1' in u})
    o['req_official']=[u for u in urls if '_official' in u]
    print(D.split('/')[-1], json.dumps(o))
