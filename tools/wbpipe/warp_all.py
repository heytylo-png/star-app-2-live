# step 1 registration: one uniform transform for all frames (count from vid/hf<n>/) (no slide). s/tx/ty from reg_scan.json
# (rebuilt rule reproduces wb1/wb2 exactly: s 1.845, tx -303.4675, ty -540.41375).
import sys,json,os;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import VID,nframes
from PIL import Image
from multiprocessing import Pool
R=json.load(open('/workspace/bridge/wbpipe/reg_scan.json'))
def job(a):
    n,k=a; s,tx,ty=R[n]
    Image.open(VID+f'hf{n}/f{k:03d}.png').convert('RGB').transform((720,1280),Image.AFFINE,(1/s,0,-tx/s,0,1/s,-ty/s),resample=Image.BICUBIC,fillcolor=(255,255,255)).save(VID+f'reghf{n}/f{k:03d}.png')
if __name__=='__main__':
    ns=sys.argv[1:]
    for n in ns: os.makedirs(VID+f'reghf{n}',exist_ok=True)
    with Pool(8) as p: p.map(job,[(n,k) for n in ns for k in range(nframes(n))])
