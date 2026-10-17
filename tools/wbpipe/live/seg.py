import json,sys
D=sys.argv[1]
for s in sys.argv[2:]:
  try:
    L=json.load(open(f'{D}/{s}/bridge_log.json')); R=json.load(open(f'{D}/{s}/requests.json'))
  except Exception as e: print(s,'ERR',e); continue
  segs=[]
  for t,c,f in L:
    if segs and segs[-1][0]==c and f==segs[-1][2]+1: segs[-1][2]=f; segs[-1][3]+=1; segs[-1][5]=t
    else: segs.append([c,f,f,1,t,t])
  urls=sorted({(u if isinstance(u,str) else u.get('url','')).split('/')[-1] for u in R if any(k in (u if isinstance(u,str) else u.get('url','')) for k in ('pout1','smug1','wave1','talk1'))})
  print(s,json.load(open(f'{D}/{s}/build.json')),[(a,b,c,n,round(t1-t0)) for a,b,c,n,t0,t1 in segs],urls)
