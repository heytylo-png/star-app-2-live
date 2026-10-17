"""wb1 welcome-back probe (phone profile, slow4g, DPR 3.5). usage: probe_welcome.py <url> <outdir> <mode> [secs]
mode: gap7h (last activity 7 h ago) | gap10m (10 min ago) | first (no stamp) | debug1329 | debug1330 (?welcome=N) | resume7h
(open with a fresh stamp, then hide, age the stamp to 7 h, show)."""
import sys, json, os, re, time
from playwright.sync_api import sync_playwright
BASE,OUT,MODE=sys.argv[1],sys.argv[2],sys.argv[3]; SECS=float(sys.argv[4]) if len(sys.argv)>4 else 22
os.makedirs(OUT,exist_ok=True)
src=open('/workspace/f807/mouth/wire/probe17.py').read()
INIT=re.search(r'INIT=r"""(.*?)"""',src,re.S).group(1)
UA="Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
url=BASE
if MODE.startswith('debug'): url=BASE+('&' if '?' in BASE else '?')+'welcome='+MODE[5:]
stamp={'gap3h':3*3600e3,'callopen3h':3*3600e3,'callpend3h':3*3600e3,'checkin3h':3*3600e3,'gap2h59':(2*60+59)*60e3,'gap7h':7*3600e3,'callopen':7*3600e3,'callpend':7*3600e3,'gap10m':600e3,'resume7h':60e3}.get(MODE)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('RAI_BROWSER') or None,args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    ctx=b.new_context(viewport={"width":412,"height":915},device_scale_factor=3.5,is_mobile=True,has_touch=True,user_agent=UA,service_workers="block",timezone_id="America/Chicago",permissions=["microphone"])
    REQ=[]; pg=ctx.new_page(); pg.on('request',lambda r: REQ.append(r.url) if '/rai/' in r.url else None)
    pg.add_init_script(INIT)
    if stamp: pg.add_init_script("if(!sessionStorage.getItem('__wbset')){sessionStorage.setItem('__wbset','1');localStorage.setItem('rai-last-activity-ms',String(Date.now()-%d))}"%stamp)
    cdp=ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate',{'rate':4}); cdp.send('Network.enable')
    cdp.send('Network.emulateNetworkConditions',{'offline':False,'downloadThroughput':1.6e6/8,'uploadThroughput':750e3/8,'latency':150})
    pg.goto(url,timeout=120000)
    build=pg.evaluate("document.querySelector('meta[name=star-rai-build]')?.content")
    def start_call():
        pg.wait_for_function("(()=>{const i=document.querySelector('.rai-stage img');return i&&i.complete&&i.naturalWidth})()", timeout=120000)
        try: pg.get_by_role('button', name='Skip').click(timeout=2500); pg.wait_for_timeout(300)
        except Exception: pass
        pg.get_by_role('button', name='Menu').first.click(); pg.wait_for_timeout(300)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='Menu').first.click(); pg.wait_for_timeout(300)
        pg.locator('[aria-label="Start call"],button:has-text("Start call")').first.click(); pg.evaluate("(window.__raiWelcome??=[]).push([performance.now(),'PROBE-call-clicked'])")
        pg.wait_for_timeout(1500); pg.keyboard.press('Escape')
        print('call bar', pg.evaluate("[...document.querySelectorAll('span.font-medium')].map(s=>s.textContent).filter(t=>/call|micro/i.test(t))"), flush=True)
    if MODE.startswith('callopen'): start_call()
    if MODE=='checkin3h':
        t_end=time.time()+90
        while time.time()<t_end and not any(w[1]=='arm' for w in pg.evaluate("window.__raiWelcome||[]")): pg.wait_for_timeout(100)
        pg.evaluate("localStorage.setItem('star-rai-checkin','probe-'+Date.now());(window.__raiWelcome??=[]).push([performance.now(),'PROBE-checkin-posted'])")
    if MODE.startswith('callpend'):
        t_end=time.time()+90
        while time.time()<t_end and not any(w[1]=='arm' for w in pg.evaluate("window.__raiWelcome||[]")): pg.wait_for_timeout(300)
        start_call()
    if MODE=='resume7h':
        pg.wait_for_timeout(15000)
        pg.evaluate("""()=>{const set=h=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>h?'hidden':'visible'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});document.dispatchEvent(new Event('visibilitychange'))};
          set(true); localStorage.setItem('rai-last-activity-ms',String(Date.now()-7*3600e3)); window.__mark('resume'); set(false)}""")
    t_end=time.time()+SECS
    while time.time()<t_end: pg.wait_for_timeout(500)
    S=pg.evaluate("window.__s"); W=pg.evaluate("window.__raiWelcome||[]"); L=pg.evaluate("(window.__raiBridgeLog||[])"); D=pg.evaluate("window.__raiBridgeDone||[]")
    stage=pg.evaluate("(()=>{const s=document.querySelector('.rai-stage');return {welcome:s.dataset.raiWelcome,phase:s.dataset.raiPosePhase,bubbles:document.querySelectorAll('.chat-bubble-assistant').length}})()")
    json.dump(dict(build=build,mode=MODE,url=url,welcome=W,bridge_log=L,bridge_done=D,stage=stage,requests=REQ,samples=S),open(OUT+'/run.json','w'))
    # per-sample shown layers while a welcome canvas is up
    wc=[s for s in S if any(str(x).startswith('bridgewc') for x in s['sh'])]
    seq=[]; 
    for s in wc:
        for x in s['sh']:
            if str(x).startswith('bridgewc'): seq.append(x)
    idx=[int(x[-3:]) for x in seq]
    mid_idle=[s for s in wc if any(str(x).startswith('idle') for x in s['sh'])]
    print(json.dumps(dict(build=build,mode=MODE,welcome=W,stage=stage,frames_seen=len(set(idx)),first=idx[:1],last=idx[-1:],
      samples_with_welcome=len(wc),samples_idle_mid=len(mid_idle),max_audio=max([s['au'] for s in S] or [0]),
      log_frames={k:len({f for _,c,f in L if c==k}) for k in ('in','out')},done=D,
      welcome_requests=[r.split('/')[-1] for r in REQ if 'welcome' in r])))
    b.close()
