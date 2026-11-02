# Blender: signed distance (mm) from lower_arm/hand-dominant vertices to the nearest pelvis/hip/lower_waist/waist/thigh-dominant surface (negative = inside). Read-only on a COPY.
import bpy, sys, numpy as np, json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=sys.argv[sys.argv.index('--')+1]
N='/workspace/blendbro/out/bv9_correction_study_v1/'
Wz=np.load(N+'work/bv9_base_weights.npz'); names=[str(x) for x in Wz['names']]; W=Wz['W']; dom=np.array(names)[W.argmax(1)]
ob=bpy.data.objects['StarRai_base_body']; me=ob.data; me.calc_loop_triangles()
n=len(me.vertices); co=np.empty(n*3,np.float32); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
tr=np.empty(len(me.loop_triangles)*3,np.int32); me.loop_triangles.foreach_get('vertices',tr); tr=tr.reshape(-1,3)
torso=np.isin(dom,['pelvis','hip','lower_waist','waist','thigh_left','thigh_right','mid_chest'])
keep=torso[tr].all(1)
bt=BVHTree.FromPolygons([Vector(map(float,c)) for c in co],[tuple(int(i) for i in t) for t in tr[keep]],epsilon=0.0)
R={}
for s in ['right','left']:
    ids=np.nonzero(np.isin(dom,[f'lower_arm_{s}',f'hand_{s}']))[0]
    ds=[]
    for i in ids:
        r=bt.find_nearest(Vector(map(float,co[i])))
        if r[0] is None: continue
        loc,nrm,_,dist=r; sd=dist if (Vector(map(float,co[i]))-loc).dot(nrm)>=0 else -dist
        ds.append((sd*1000.0,i))
    d=np.array([a for a,_ in ds]); ii=np.array([b for _,b in ds])
    k=d.argmin(); R[s]=dict(min_signed_mm=float(d.min()),vertex=int(ii[k]),vertex_pos_mm=(co[ii[k]]*1000).round(2).tolist(),n_inside=int((d<0).sum()),n_checked=int(len(d)),n_within_1mm_outside=int(((d>=0)&(d<1)).sum()))
json.dump(R,open(out,'w'),indent=1); print('PEN_OK',R)
