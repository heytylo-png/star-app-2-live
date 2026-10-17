# Validate a rebuild against a shipped AVIF: per-frame alpha / colour / skin stats (decoded both sides) and,
# optionally, the pre-encode ship PNGs against a reference set. usage: validate.py <rebuilt.avif> <shipped.avif> [ship_dir_a ship_dir_b n]
import sys,json,numpy as np;sys.path.insert(0,'/workspace/bridge/wbpipe');from lib import *
from skin import skin_w
A=dec_rgba(sys.argv[1]).astype(np.float32); B=dec_rgba(sys.argv[2]).astype(np.float32)
assert A.shape==B.shape,(A.shape,B.shape)
aa,ab=A[...,3],B[...,3]; ma,mb=aa>128,ab>128
op=(aa>250)&(ab>250)
sa=skin_w(A)>0.9; sb=skin_w(B)>0.9; sk=sa&sb
fr=[]
for k in range(len(A)):
    fr.append(dict(alpha_mad=float(np.abs(aa[k]-ab[k]).mean()),iou=float((ma[k]&mb[k]).sum()/max(1,(ma[k]|mb[k]).sum())),
        rgb_mad_opaque=float(np.abs(A[k][op[k]][:,:3]-B[k][op[k]][:,:3]).mean()),
        skin_ratio=(A[k][sk[k]][:,:3].mean(0)/B[k][sk[k]][:,:3].mean(0)).round(4).tolist()))
R=dict(frames=len(A),bytes=[os.path.getsize(sys.argv[1]),os.path.getsize(sys.argv[2])],
  alpha_mad_mean=round(np.mean([f['alpha_mad'] for f in fr]),4),alpha_mad_max=round(max(f['alpha_mad'] for f in fr),4),
  iou_min=round(min(f['iou'] for f in fr),5),iou_mean=round(np.mean([f['iou'] for f in fr]),5),
  rgb_mad_opaque_mean=round(np.mean([f['rgb_mad_opaque'] for f in fr]),3),rgb_mad_opaque_max=round(max(f['rgb_mad_opaque'] for f in fr),3),
  skin_ratio_mean=np.mean([f['skin_ratio'] for f in fr],0).round(4).tolist(),
  matte_px_diff_alpha128_mean=round(float(np.mean([(ma[k]^mb[k]).sum() for k in range(len(A))])),1))
if len(sys.argv)>5:
    da,db,n=sys.argv[3],sys.argv[4],sys.argv[5]; d=[]
    for k in range(len(A)):
        x=np.asarray(Image.open(f'{da}/welcome{n}_{k:03d}.png')).astype(np.int16); y=np.asarray(Image.open(f'{db}/welcome{n}_{k:03d}.png')).astype(np.int16)
        d.append((float(np.abs(x[...,3]-y[...,3]).mean()),int((x!=y).any(2).sum()),int(np.abs(x-y).max())))
    R['ship_png']=dict(alpha_mad_mean=round(np.mean([v[0] for v in d]),4),changed_px_mean=round(np.mean([v[1] for v in d]),1),changed_px_max=max(v[1] for v in d),max_abs=max(v[2] for v in d))
print(json.dumps(R))
