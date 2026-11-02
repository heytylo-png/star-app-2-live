# Read-only extra inspection of a COPY of bv9 (never saves): vertex groups, shape keys, per-group extents, armature bones.
import bpy, sys, json, numpy as np
out=sys.argv[sys.argv.index('--')+1]
ob=bpy.data.objects['StarRai_base_body']; me=ob.data
n=len(me.vertices); co=np.empty(n*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)*1000
R={'blender':bpy.app.version_string,'n_verts':n,'shape_keys':[],'vertex_groups':{}}
if me.shape_keys:
    R['shape_key_use_relative']=me.shape_keys.use_relative
    for k in me.shape_keys.key_blocks:
        a=np.empty(n*3); k.data.foreach_get('co',a); a=a.reshape(-1,3)*1000
        R['shape_keys'].append(dict(name=k.name,value=k.value,relative_key=k.relative_key.name,mute=k.mute,max_diff_from_mesh_co_mm=float(np.abs(a-co).max())))
# weights per group
W={}
for v in me.vertices:
    for g in v.groups:
        W.setdefault(g.group,[]).append((v.index,g.weight))
for vg in ob.vertex_groups:
    ws=W.get(vg.index,[]); idx=np.array([i for i,w in ws],int)
    if len(idx)==0: R['vertex_groups'][vg.name]=dict(n=0); continue
    wt=np.array([w for i,w in ws])
    R['vertex_groups'][vg.name]=dict(n=int(len(idx)),n_w_gt_0_5=int((wt>0.5).sum()),bbox_min=co[idx].min(0).round(2).tolist(),bbox_max=co[idx].max(0).round(2).tolist())
arm=bpy.data.objects['StarRai_star_rai_locked_v10']
R['armature']={'n_bones':len(arm.data.bones),'bones':{b.name:{'head_mm':(np.array(b.head_local)*1000).round(2).tolist(),'tail_mm':(np.array(b.tail_local)*1000).round(2).tolist(),'parent':b.parent.name if b.parent else None} for b in arm.data.bones}}
R['modifiers']=[{'name':m.name,'type':m.type,'show_viewport':m.show_viewport,'show_render':m.show_render,'object':getattr(getattr(m,'object',None),'name',None)} for m in ob.modifiers]
R['object_names']=[o.name for o in bpy.data.objects]
R['mesh_users']=me.users; R['mesh_name']=me.name
json.dump(R,open(out,'w'),indent=1); print('EXTRA_OK')
