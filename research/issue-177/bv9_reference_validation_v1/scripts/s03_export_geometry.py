# Read-only: export evaluated body geometry (Outline/solidify modifier muted in-memory) from a COPY of bv9 to npz. Never saves the .blend.
import bpy, sys, numpy as np, json, bmesh
out=sys.argv[sys.argv.index('--')+1]
ob=bpy.data.objects['StarRai_body' if 'StarRai_body' in bpy.data.objects else 'StarRai_base_body']
arm=bpy.data.objects['StarRai_star_rai_locked_v10']
info={'pose_bones_non_identity':[]}
for pb in arm.pose.bones:
    if (pb.location.length>1e-9) or (abs(pb.rotation_quaternion[0]-1)>1e-9) or (pb.rotation_quaternion[1:]).__len__() and max(abs(v) for v in pb.rotation_quaternion[1:])>1e-9 or max(abs(v-1) for v in pb.scale)>1e-9:
        info['pose_bones_non_identity'].append(pb.name)
info['armature_pose_position']=arm.data.pose_position
def evalmesh(muted):
    saved={}
    for m in ob.modifiers:
        saved[m.name]=m.show_viewport
        if m.name in muted: m.show_viewport=False
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get()
    ev=ob.evaluated_get(dg); me=ev.to_mesh()
    v=np.empty(len(me.vertices)*3,dtype=np.float64); me.vertices.foreach_get('co',v); v=v.reshape(-1,3)
    W=np.array(ob.matrix_world); vw=(np.c_[v,np.ones(len(v))]@W.T)[:,:3]
    me.calc_loop_triangles()
    t=np.empty(len(me.loop_triangles)*3,dtype=np.int32); me.loop_triangles.foreach_get('vertices',t); t=t.reshape(-1,3)
    mi=np.empty(len(me.loop_triangles),dtype=np.int32); me.loop_triangles.foreach_get('material_index',mi)
    n=len(v)
    ev.to_mesh_clear()
    for m in ob.modifiers: m.show_viewport=saved[m.name]
    return vw,t,mi
vw,t,mi=evalmesh({'Outline'})
vw_all,t_all,_=evalmesh(set())
vw_none,_,_=evalmesh({'Outline','Armature','FaceNormals'})
base=ob.data
b=np.empty(len(base.vertices)*3); base.vertices.foreach_get('co',b); b=b.reshape(-1,3)
W=np.array(ob.matrix_world); bw=(np.c_[b,np.ones(len(b))]@W.T)[:,:3]
info['armature_modifier_max_displacement_m']=float(np.abs(vw-bw).max()) if len(vw)==len(bw) else None
info['n_verts_no_outline']=int(len(vw)); info['n_tris_no_outline']=int(len(t)); info['n_verts_with_outline']=int(len(vw_all)); info['n_tris_with_outline']=int(len(t_all))
info['outline_modifier']={m.name:{'type':m.type} for m in ob.modifiers}
sol=[m for m in ob.modifiers if m.type=='SOLIDIFY'][0]
info['outline_params']={'thickness':sol.thickness,'offset':sol.offset,'use_flip_normals':sol.use_flip_normals,'use_rim':sol.use_rim}
info['materials']=[m.name if m else None for m in base.materials]
np.savez_compressed(out,verts=vw.astype(np.float32),tris=t,mat=mi,base_world=bw.astype(np.float32))
info['bbox_min']=vw.min(0).tolist(); info['bbox_max']=vw.max(0).tolist()
json.dump(info,open(out.replace('.npz','_info.json'),'w'),indent=1)
print('EXPORT_OK',info)
