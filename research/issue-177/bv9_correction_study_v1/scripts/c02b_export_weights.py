# Read-only: export base-mesh vertex positions (mm), dense vertex-group weights, edges/faces and bone heads from a COPY of bv9. Never saves.
import bpy, sys, numpy as np, json
out=sys.argv[sys.argv.index('--')+1]
ob=bpy.data.objects['StarRai_base_body']; me=ob.data; n=len(me.vertices)
co=np.empty(n*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)*1000
names=[g.name for g in ob.vertex_groups]; Wm=np.zeros((n,len(names)),np.float32)
for v in me.vertices:
    for g in v.groups: Wm[v.index,g.group]=g.weight
arm=bpy.data.objects['StarRai_star_rai_locked_v10']
bones={b.name:(np.array(b.head_local)*1000).tolist()+(np.array(b.tail_local)*1000).tolist() for b in arm.data.bones}
e=np.empty(len(me.edges)*2,np.int32); me.edges.foreach_get('vertices',e)
np.savez_compressed(out,co_mm=co,W=Wm,names=np.array(names),edges=e.reshape(-1,2),bone_names=np.array(list(bones)),bone_ht=np.array(list(bones.values())))
print('WEIGHTS_OK',n,len(names))
