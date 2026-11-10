import json,struct,sys,math
import numpy as np
b=open(sys.argv[1],'rb').read(); cl=struct.unpack('<I',b[12:16])[0]; js=json.loads(b[20:20+cl]); off=20+cl
bl=struct.unpack('<I',b[off:off+4])[0]; BIN=b[off+8:off+8+bl]
a=js['accessors'][js['meshes'][0]['primitives'][0]['attributes']['POSITION']]; bv=js['bufferViews'][a['bufferView']]
V=np.frombuffer(BIN,np.float32,count=a['count']*3,offset=bv.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3).astype(float)
H=V[:,1].max()-V[:,1].min()
out={}
for side,sel in (('right_x<0',V[:,0]<0),('left_x>0',V[:,0]>0)):
    P=V[sel & (V[:,1]<0.12*H)]
    # lower envelope along z (front=+Z) in 2 mm-equivalent bins (H normalised; use 0.002 units)
    zb=np.arange(P[:,2].min(),P[:,2].max(),0.002); env=[]
    for z0 in zb:
        m=(P[:,2]>=z0)&(P[:,2]<z0+0.002)
        if m.any(): env.append((z0+0.001,P[m,1].min()))
    env=np.array(env)
    toe=P[P[:,2].argmax()]; heel=P[P[:,2].argmin()]
    ground=env[:,1].min()
    # contact rows: envelope within 0.003 of ground
    contact=env[env[:,1]<ground+0.003]
    out[side]=dict(z_range=[round(P[:,2].min(),4),round(P[:,2].max(),4)],ground_y=round(ground,5),
        contact_z_range=[round(contact[:,0].min(),4),round(contact[:,0].max(),4)],n_contact_bins=int(len(contact)),
        toe_tip=toe.round(4).tolist(),heel_back=heel.round(4).tolist(),
        envelope_sample=[(round(z,3),round(y,4)) for z,y in env[::max(1,len(env)//24)]])
    # sole line from heel-back region to ball: fit on envelope excluding contact spike(s): use bins where y < ground+0.06*H
print(json.dumps(dict(height_units=H,feet=out),indent=1))
