import json,struct,sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
b=open(sys.argv[1],'rb').read(); cl=struct.unpack('<I',b[12:16])[0]; js=json.loads(b[20:20+cl]); off=20+cl
bl=struct.unpack('<I',b[off:off+4])[0]; BIN=b[off+8:off+8+bl]
def acc(i,dt,n):
    a=js['accessors'][i]; bv=js['bufferViews'][a['bufferView']]; o=bv.get('byteOffset',0)+a.get('byteOffset',0)
    return np.frombuffer(BIN,dt,count=a['count']*n,offset=o).reshape(a['count'],n)
p=js['meshes'][0]['primitives'][0]
V=acc(p['attributes']['POSITION'],np.float32,3).astype(np.float64); F=acc(p['indices'],np.uint32,1).astype(np.int64).reshape(-1,3)
for tol in (1e-7,1e-6,1e-5):
    q=np.round(V/tol).astype(np.int64); _,inv=np.unique(q,axis=0,return_inverse=True); inv=inv.ravel()
    Fw=inv[F]; n=inv.max()+1
    e=np.concatenate([Fw[:,[0,1]],Fw[:,[1,2]],Fw[:,[2,0]]]); e=e[e[:,0]!=e[:,1]]
    nc,lab=connected_components(coo_matrix((np.ones(len(e),np.int8),(e[:,0],e[:,1])),shape=(n,n)),directed=False)
    es=np.sort(e,1); _,cnt=np.unique(es[:,0]*n+es[:,1],return_counts=True)
    sz=np.sort(np.bincount(lab))[::-1]
    print(dict(tol=tol,welded_verts=int(n),components=int(nc),largest=sz[:6].tolist(),boundary_edges=int((cnt==1).sum()),nonmanifold=int((cnt>2).sum())))
