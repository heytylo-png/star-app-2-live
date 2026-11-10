import json,struct,sys,hashlib
for path in sys.argv[1:]:
    b=open(path,'rb').read(); cl=struct.unpack('<I',b[12:16])[0]; js=json.loads(b[20:20+cl]); off=20+cl
    bl=struct.unpack('<I',b[off:off+4])[0]; BIN=b[off+8:off+8+bl]
    p=js['meshes'][0]['primitives'][0]; r={}
    for k in ('POSITION','NORMAL','TEXCOORD_0'):
        a=js['accessors'][p['attributes'][k]]; bv=js['bufferViews'][a['bufferView']]; o=bv.get('byteOffset',0)+a.get('byteOffset',0)
        n={'VEC3':3,'VEC2':2}[a['type']]; r[k]=hashlib.sha256(BIN[o:o+a['count']*n*4]).hexdigest()[:16]
    a=js['accessors'][p['indices']]; bv=js['bufferViews'][a['bufferView']]; o=bv.get('byteOffset',0)+a.get('byteOffset',0)
    r['indices']=hashlib.sha256(BIN[o:o+a['count']*4]).hexdigest()[:16]
    r['images']=[(im.get('mimeType'),js['bufferViews'][im['bufferView']]['byteLength']) for im in js['images']]
    print(path.split('/')[-1], r)
