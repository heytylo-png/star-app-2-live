import sys,time
from multiprocessing import Pool
sys.path.insert(0,'/workspace/f807/bridge/engine'); sys.path.insert(0,'/workspace/bridge/wbpipe')
import sweeplib, sheets_hf as B
import os; from lib import WORK
sweeplib.OUTROOT=WORK+'cut/'; sweeplib.REPO='/workspace/r67/'
ks=[k for k in sorted(B.FR) if any(k.startswith(a) for a in (sys.argv[1:] or ['']))]
def one(k):
    t=time.time(); c=B.cfg(k); c['commit']=os.environ.get('WB_TAG','welcome-hf1'); r=sweeplib.run(c)
    return k,{n:len(v) for n,v in c['pockets'].items()},r['halo_near_white_touching_transparent'],time.time()-t
if __name__=='__main__':
    with Pool(8) as p:
        for k,pk,halo,dt in p.imap_unordered(one,ks): print(k,pk,'halo',halo,'%.1fs'%dt,flush=True)
