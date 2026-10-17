# step 2 matte geometry (welcome clips): same seed rule as engine/sheets_1158_1162.py (enclosed studio white = background
# pockets; MIN_POCKET 300; ring-dark check next to the shirt) + auto hair/unmix zones per frame.
import sys
sys.path.insert(0,'/workspace/f807/sweep'); sys.path.insert(0,'/workspace/f807/bridge/engine')
import importlib.util
spec=importlib.util.spec_from_file_location('s1158','/workspace/f807/bridge/engine/sheets_1158_1162.py'); S1158=importlib.util.module_from_spec(spec); spec.loader.exec_module(S1158)
import sheets as S, sweeplib as _sw, numpy as np
from PIL import Image
V='/workspace/bridge/wbpipe/vid/'
FR={}
import os
for d in sorted(os.listdir(V)):   # every registered clip vid/reghf<n>/, all its frames
    if not d.startswith('reghf'): continue
    n=d[5:]
    for f in sorted(os.listdir(V+d)):
        if f.endswith('.png'): i=int(f[1:4]); FR[f'{n}_{i:03d}']=(f'welcome{n}_{i:03d}', V+f'{d}/{f}')
def cfg(k):
    key,path=FR[k]; p=S1158.seeds(path)
    c=S.fam(key,None,None,None,extra=p); c['abs_file']=path; c['file']='bridge/wbpipe/vid/'+path.split('/')[-2]+'/'+path.split('/')[-1]
    hz,uz,tops=_sw.auto_zones(np.asarray(Image.open(path).convert('RGB')))
    c['zones']='manual'; c['hair_zones']=hz; c['unmix_zone']=uz; c['shoulder_tops_LR']=tops
    return c
