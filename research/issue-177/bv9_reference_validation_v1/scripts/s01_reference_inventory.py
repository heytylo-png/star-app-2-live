import json,hashlib,os
from PIL import Image
D='/workspace/blendbro/references/issue177_official_v1/issue177_reference_images/'
man=json.load(open(D+'REFERENCE_MANIFEST.json')); out=[]
for e in man['images']:
    p=D+e['filename']; b=open(p,'rb').read(); h=hashlib.sha256(b).hexdigest(); im=Image.open(p)
    out.append(dict(file=p,filename=e['filename'],description=e['description'],original_upload=e['original_upload'],width=im.size[0],height=im.size[1],bytes=len(b),sha256=h,manifest_sha256=e['sha256'],hash_matches_manifest=(h==e['sha256']),size_matches_manifest=(len(b)==e['bytes'] and im.size==(e['width_px'],e['height_px']))))
uniq=len({o['sha256'] for o in out})
other=[]
for p in ['/workspace/blender/star_rai/reference/bikini/'+f for f in sorted(os.listdir('/workspace/blender/star_rai/reference/bikini'))]+['/workspace/star-rai-canon-refs/'+f for f in ['01-front-idle.png','02-three-quarter.jpg','03-side.jpg','04-back.jpg','05-face-closeup.jpg'] if os.path.exists('/workspace/star-rai-canon-refs/'+f)]:
    b=open(p,'rb').read(); im=Image.open(p); other.append(dict(file=p,width=im.size[0],height=im.size[1],bytes=len(b),sha256=hashlib.sha256(b).hexdigest()))
json.dump(dict(official_set_dir=D,n_files=len(out),n_unique_images=uniq,files=out,not_used_unverified_sets=other,
   readme_sha256=hashlib.sha256(open(D+'README.txt','rb').read()).hexdigest(),manifest_sha256=hashlib.sha256(open(D+'REFERENCE_MANIFEST.json','rb').read()).hexdigest()),open('/workspace/blendbro/out/bv9_reference_validation_v1/data/reference_inventory.json','w'),indent=1)
print(uniq,[o['hash_matches_manifest'] and o['size_matches_manifest'] for o in out])
