import json,sys,os,math,itertools,collections,csv
import numpy as np
RR={}
class _N: pass
R={'M1':{}}
# ---------- M1 parse
V = []; VT = []; counts = collections.Counter(); faces = []; fgroup = []; grp_segments = collections.Counter(); cur = None
with open(D + '/3dobjs/base.obj') as fh:
    for ln in fh:
        if not ln.strip() or ln[0] == '#': continue
        p = ln.split()
        t = p[0]; counts[t] += 1
        if t == 'v': V.append([float(x) for x in p[1:4]])
        elif t == 'vt': VT.append([float(x) for x in p[1:3]])
        elif t in ('g', 'o'):
            cur = p[1]; grp_segments[cur] += 1
        elif t == 'f':
            refs = [r.split('/') for r in p[1:]]
            faces.append(([int(r[0]) - 1 for r in refs], [int(r[1]) - 1 if len(r) > 1 and r[1] else -1 for r in refs]))
            fgroup.append(cur)
V = np.array(V); VT = np.array(VT); nv = len(V)
ar = collections.Counter(len(f[0]) for f in faces)
R['M1'] = dict(v=nv, vt=len(VT), f=len(faces), line_counts=dict(counts), face_arity={str(k): v for k, v in sorted(ar.items())},
               n_groups_distinct=len(grp_segments), n_group_segments=sum(grp_segments.values()),
               repeated_groups={k: v for k, v in grp_segments.items() if v > 1})
groups = collections.OrderedDict()  # name -> set of vertex idx
gfaces = collections.Counter()
for (vi, _), g in zip(faces, fgroup):
    groups.setdefault(g, set()).update(vi); gfaces[g] += 1
R['M1']['groups'] = {g: dict(faces=gfaces[g], verts=len(s), min_idx=min(s), max_idx=max(s)) for g, s in groups.items()}
body = groups['body']
# group-name families
fam = collections.Counter()
for g in groups: fam[g.split('-')[0] if g.startswith(('joint', 'helper')) else g] += 1
R['M1']['group_families'] = dict(fam)
allref = set().union(*groups.values())
# overlap between groups' vertex sets
ov = {}
names = list(groups)
for a in names:
    for b in names:
        if a < b and groups[a] & groups[b]:
            ov[a + '|' + b] = len(groups[a] & groups[b])
R['M1']['group_vertex_overlaps'] = ov
grp_of = collections.defaultdict(list)
for g, s in groups.items():
    for i in s: grp_of[i].append(g)
def fam_of(i):
    gs = grp_of.get(i)
    if not gs: return 'UNREFERENCED'
    return '+'.join(sorted(set('joint-*' if g.startswith('joint-') else g for g in gs)))


W={n:json.load(open(D+'/rigs/'+p))['weights'] for n,p in [('default','standard/weights.default.json'),('game_engine','standard/weights.game_engine.json'),('rigify_human_toes','rigify/weights.human_toes.json')]}
def load_rig(path):
    d=json.load(open(path)); return d.get('bones',d)
RIGS={'default':'standard/rig.default.json','game_engine':'standard/rig.game_engine.json'}

def recon(spec):
    s=spec['strategy']
    if s=='CUBE':
        g=spec['cube_name']; return V[sorted(groups[g])].mean(0) if g in groups else None
    if s=='VERTEX': return V[spec['vertex_index']]
    if s=='MEAN': return V[spec['vertex_indices']].mean(0)
    return None
src=[];dst=[];kinds=[]
for rn in ('default','game_engine'):
    rig=load_rig(D+'/rigs/'+RIGS[rn])
    for b,x in rig.items():
        for e in ('head','tail'):
            sp=x[e]; p=recon(sp)
            if p is None or 'default_position' not in sp: continue
            src.append(p); dst.append(sp['default_position']); kinds.append((rn,b,e,sp['strategy']))
src=np.array(src); dst=np.array(dst)
