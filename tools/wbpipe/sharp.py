# Face sharpness at stage scale: shipped/rebuilt AVIF vs a reference AVIF (default hf3 1366 in the repo).
# Metrics on the idle face box (y 120-285, x 260-460), flattened on white, frames 8-15 and the 8 before the last 8 (the clip's own face, just outside the idle eases, near the idle position):
# Laplacian variance, mean Sobel magnitude, high-frequency spectral share (r > N/4). Writes a 3x side-by-side crop.
# usage: sharp.py <new.avif> [ref.avif] [out.png]
import sys,json,numpy as np;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
from scipy import ndimage as nd
FB=(slice(120,285),slice(260,460))
def met(c):
    lap=nd.laplace(c); sob=np.hypot(nd.sobel(c,0),nd.sobel(c,1))
    F=np.abs(np.fft.fft2(c-c.mean())); F=np.fft.fftshift(F); yy,xx=np.indices(F.shape); rr=np.hypot(yy-F.shape[0]/2,xx-F.shape[1]/2)
    return np.array([lap.var(),sob.mean(),F[rr>min(F.shape)/4].sum()/F.sum()])
def run(p):
    A=dec_rgba(p); ks=list(range(8,16))+list(range(len(A)-16,len(A)-8))
    m=np.mean([met(L(A[k])[FB]) for k in ks],0); return dict(lap_var=round(float(m[0]),1),sobel=round(float(m[1]),2),hf_share=round(float(m[2]),4)),A
new=sys.argv[1]; ref=sys.argv[2] if len(sys.argv)>2 else REPO+'public/rai/welcome1366.avif'; out=sys.argv[3] if len(sys.argv)>3 else WORK+'sharp_side_by_side.png'
a,A=run(new); b,B=run(ref)
def crop(X,k): x=np.clip(L(X[k]),0,255).astype(np.uint8)[FB]; return Image.fromarray(x).resize((600,495),Image.NEAREST)
c=Image.new('L',(1200,990),255); c.paste(crop(B,8),(0,0)); c.paste(crop(A,8),(600,0)); c.paste(crop(B,len(B)-9),(0,495)); c.paste(crop(A,len(A)-9),(600,495)); c.save(out)
print(json.dumps(dict(new=dict(file=new,**a),ref=dict(file=ref,**b),ratio=dict(lap_var=round(a['lap_var']/b['lap_var'],3),sobel=round(a['sobel']/b['sobel'],3),hf_share=round(a['hf_share']/b['hf_share'],3)),crop=out+' (left ref, right new; top f8, bottom last-8)')))
