# Read-only inspection of a COPY of bv9. Never saves. Run: blender -b --factory-startup work/bv9_copy.blend --python this.py -- out.json
import bpy, sys, json, bmesh, mathutils
out=sys.argv[sys.argv.index('--')+1]
R={'blender':bpy.app.version_string,'file':bpy.data.filepath,'scene':{},'objects':[]}
sc=bpy.context.scene
R['scene']={'unit_system':sc.unit_settings.system,'scale_length':sc.unit_settings.scale_length,'length_unit':sc.unit_settings.length_unit,'frame':sc.frame_current,'n_scenes':len(bpy.data.scenes)}
dg=bpy.context.evaluated_depsgraph_get()
for ob in bpy.data.objects:
    d={'name':ob.name,'type':ob.type,'parent':ob.parent.name if ob.parent else None,'hide_viewport':ob.hide_viewport,'hide_render':ob.hide_render,
       'matrix_world':[list(r) for r in ob.matrix_world],'location':list(ob.location),'rotation_euler':list(ob.rotation_euler),'scale':list(ob.scale),
       'modifiers':[{'name':m.name,'type':m.type,'show_viewport':m.show_viewport,'show_render':m.show_render} for m in ob.modifiers],
       'collections':[c.name for c in ob.users_collection]}
    if ob.type=='MESH':
        me=ob.data
        d['mesh']={'name':me.name,'verts':len(me.vertices),'edges':len(me.edges),'faces':len(me.polygons),'loops':len(me.loops),
                   'shape_keys':[k.name for k in me.shape_keys.key_blocks] if me.shape_keys else [],'vertex_groups':len(ob.vertex_groups),
                   'materials':[m.name if m else None for m in me.materials]}
        # evaluated
        ev=ob.evaluated_get(dg); me2=ev.to_mesh()
        d['evaluated']={'verts':len(me2.vertices),'edges':len(me2.edges),'faces':len(me2.polygons)}
        import numpy as np
        a=np.empty(len(me.vertices)*3,dtype=np.float32); me.vertices.foreach_get('co',a); a=a.reshape(-1,3)
        b=np.empty(len(me2.vertices)*3,dtype=np.float32); me2.vertices.foreach_get('co',b); b=b.reshape(-1,3)
        d['evaluated']['same_vertex_count']=len(a)==len(b)
        d['evaluated']['max_abs_coord_diff_local']=float(np.abs(a-b).max()) if len(a)==len(b) else None
        W=np.array(ob.matrix_world)
        aw=(np.c_[a,np.ones(len(a))]@W.T)[:,:3]
        d['bbox_world_min']=aw.min(0).tolist(); d['bbox_world_max']=aw.max(0).tolist(); d['dims_world']=(aw.max(0)-aw.min(0)).tolist()
        d['bbox_local_min']=a.min(0).tolist(); d['bbox_local_max']=a.max(0).tolist()
        # components via union-find on edges
        e=np.empty(len(me.edges)*2,dtype=np.int32); me.edges.foreach_get('vertices',e); e=e.reshape(-1,2)
        par=np.arange(len(a))
        def f(x):
            while par[x]!=x:
                par[x]=par[par[x]]; x=par[x]
            return x
        for u,v in e:
            ru,rv=f(u),f(v)
            if ru!=rv: par[ru]=rv
        roots=np.array([f(i) for i in range(len(a))])
        u,c=np.unique(roots,return_counts=True)
        d['components']={'n':int(len(u)),'sizes':sorted(c.tolist(),reverse=True)[:20]}
        # boundary edges / non-manifold
        bm=bmesh.new(); bm.from_mesh(me)
        d['topology']={'boundary_edges':sum(1 for ed in bm.edges if len(ed.link_faces)==1),'nonmanifold_edges':sum(1 for ed in bm.edges if len(ed.link_faces)>2),'loose_verts':sum(1 for v in bm.verts if not v.link_edges),
                       'tris':sum(1 for fc in bm.faces if len(fc.verts)==3),'quads':sum(1 for fc in bm.faces if len(fc.verts)==4),'ngons':sum(1 for fc in bm.faces if len(fc.verts)>4)}
        bm.free()
        ev.to_mesh_clear()
    if ob.type=='ARMATURE':
        d['armature']={'bones':len(ob.data.bones),'pose_position':ob.data.pose_position}
    R['objects'].append(d)
json.dump(R,open(out,'w'),indent=1)
print('INSPECT_OK',out)
