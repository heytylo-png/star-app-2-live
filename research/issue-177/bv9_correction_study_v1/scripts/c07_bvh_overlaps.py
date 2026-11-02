# Blender: non-adjacent triangle-pair overlaps (self-intersection) of the BASE mesh (rest) via mathutils.bvhtree. usage: blender -b file.blend --python this.py -- out.npz
import bpy, sys, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
out=sys.argv[sys.argv.index('--')+1]
ob=bpy.data.objects['StarRai_base_body']; me=ob.data; me.calc_loop_triangles()
n=len(me.vertices); co=np.empty(n*3,np.float32); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
tr=np.empty(len(me.loop_triangles)*3,np.int32); me.loop_triangles.foreach_get('vertices',tr); tr=tr.reshape(-1,3)
bt=BVHTree.FromPolygons([Vector(map(float,c)) for c in co],[tuple(int(i) for i in t) for t in tr],epsilon=0.0)
pairs=np.array(bt.overlap(bt),np.int64).reshape(-1,2)
pairs=pairs[pairs[:,0]<pairs[:,1]]
sv=[set(t) for t in tr.tolist()]
keep=np.array([not (sv[a]&sv[b]) for a,b in pairs],bool)   # drop pairs that share a vertex (adjacent)
pairs=pairs[keep]
np.savez_compressed(out,pairs=pairs,tris=tr,co=co)
print('BVH_OK',len(tr),len(pairs))
