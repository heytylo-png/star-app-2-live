import json,sys
d=json.load(open(sys.argv[1] if len(sys.argv)>1 else '/workspace/blendbro/out/bv9_reference_validation_v1/data/silhouette_measurements.json'))
for v in ['front','side','back']:
    R=d[v]
    print('==',v,'F cam',{k:round(x,3) for k,x in R['modeF_cam'].items() if isinstance(x,float)},'L cam s',round(R['modeL_cam']['s'],3))
    for m in ['modeL','modeF']:
        r=R[m]; print(m,'sym',{k:round(x,2) for k,x in r['sym'].items()},'iou',round(r['iou'],3),'short',round(r['frac_model_short'],2),'proud',round(r['frac_model_proud'],2))
    print(' R2M',{k:round(x,2) for k,x in R['modeF']['R2M'].items()});print(' M2R',{k:round(x,2) for k,x in R['modeF']['M2R'].items()})
    for b in R['modeF']['bands']: print('  ',b['band'].ljust(13),'sym_mean',round(b['sym_mean'],2),'p95',round(b['sym_p95'],2),'max',round(b['sym_max'],2),'|off|',round(b['outline_abs_mean_mm'],2),'sL',round(b['outline_signed_mean_left'],2),'sR',round(b['outline_signed_mean_right'],2))
    for s in R['sensitivity']: print('   sens',s['label'].ljust(40),round(s['p95'],2),round(s['mean'],2))
    for c in R['worst_clusters_modeF'][:8]: print('   worst',c['type'][:11],c['z0'],c['z1'],c['side'],c['n'],round(c['mean_d'],2),round(c['max_d'],2))
