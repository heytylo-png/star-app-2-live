"""paste-15 FINAL (1085/1084 video bridge) probe, from probe_clock15 (from probe_hold14): real textbox + Send, Grok/Eleven stubbed in-page.
usage: probe_hold14.py <url> <outdir> <cpu> <voice on|off> <preload_ms> <set>
Each step: send, then wait mode: hold=<s> (hold must persist that long after the turn is over),
settle (wait for the reply + exit + next pose), plus actions reload / hide."""
import sys, json, re, os, base64, time
from playwright.sync_api import sync_playwright
BASE,OUT,CPU,VOICE,PRE,SET=sys.argv[1],sys.argv[2],float(sys.argv[3]),sys.argv[4],int(sys.argv[5]),sys.argv[6]
os.makedirs(OUT,exist_ok=True)
UA="Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
LINE="Smug pose locked in, all for you"
WLINE="Hmph. Fine, here is a wink, since you asked so nicely~"
def smug(L=3000,u="smug pose",**k): return dict(user=u, chunks=[[L,'{"line":"%s","emotion":"smug","pose":"smug"}'%LINE]], line=LINE, **k)
def plain_wink(**k): return dict(user="what's up with you today", chunks=[[600,'{"line":"%s","emotion":"bratty","pose":"wink"}'%WLINE]], line=WLINE, **k)
def plain(**k): return dict(user="tell me about your day", chunks=[[600,'{"line":"Ugh, you again? Fine, I will entertain you for a bit, okay~","emotion":"bratty"}']], line="Ugh", **k)
_P='{"line":"Smug pose locked in, all for you and only'
def cancel_mid(**k): return dict(user="smug pose", cancel=4500, chunks=[[1500,_P],[15000,' you"}']], line="Smug pose locked in, all for you and only", **k)
HOLD=float(os.environ.get('HOLD','32'))
SETS={
 'hold_plain':[smug(hold=HOLD), plain_wink(settle=1)],
 'smug_smug':[smug(hold=6), smug(hold=6), plain(settle=1)],
 'cancel_hold':[cancel_mid(hold=HOLD), plain_wink(settle=1)],
 'reload_hold':[smug(hold=5, after='reload'), plain_wink(settle=1)],
 'wink_exit':[smug(hold=5), dict(user="wink at me", chunks=[[250,'{"line":"Wink. Catch it~ You are welcome, obviously.","emotion":"bratty","pose":"wink"}']], line="Wink. Catch it~", settle=1)],
 'vis_hold':[smug(hold=5, after='hide'), plain_wink(settle=1, hide_exit=1)],
}
L28="Ugh, fine. What do you want?"
L95="Hmph. You took your sweet time, but fine, I will hear you out. Talk fast before I get bored."
assert len(L28)==28, len(L28)
def reply(text, pose=None, emo="bratty", user="how was your day", at=400, **k):
    j='{"line":"%s","emotion":"%s"%s}'%(text,emo,(',"pose":"%s"'%pose) if pose else '')
    return dict(user=user, chunks=[[at,j]], line=text, **k)
SETS.update({
 'chew28':[smug(hold=6), reply(L28, settle=1)],
 'chew95':[smug(hold=6), reply(L95, settle=1)],
 'n_wink':[smug(hold=6), reply("Hmph. Here is a wink, since you asked so nicely~", pose="wink", settle=1)],
 'n_laugh':[smug(hold=6), reply("Pfft, that is honestly hilarious, okay~", pose="laugh", settle=1)],
 'n_think':[smug(hold=6), reply("Hmm, let me think about that for a second.", pose="think", settle=1)],
 'wink_entry':[smug(L=200, nowait=1), reply("Wink. Catch it~ You are welcome, obviously.", pose="wink", user="wink at me", at=250, wait_br='in-02', settle=1)],
 'cold_wink':[smug(hold=6), plain_wink(settle=1)],
 'laugh_primed':[reply("Pfft, okay, that one got me~", pose="laugh", user="tell me a joke", settle=1), smug(hold=6), reply("Pfft, that is honestly hilarious, okay~", pose="laugh", settle=1)],
 'think_primed':[reply("Hmm, give me a moment.", pose="think", user="riddle me this", settle=1), smug(hold=6), reply("Hmm, let me think about that for a second.", pose="think", settle=1)],
})
SETS.update({
 'smug_hold':[smug(hold=HOLD), plain_wink(settle=1)],
 'cold_smug':[smug(L=600, hold=HOLD), plain_wink(settle=1)],
 'smug_plain':[smug(hold=HOLD), reply("Ugh, fine. What do you want?", settle=1)],
 'send_entry':[smug(L=200, nowait=1), reply("Wink. Catch it~ You are welcome, obviously.", pose="wink", user="wink at me", at=250, wait_br='in', settle=1)],
})

WLINE2="Hey there. Caught your wave."
def wave(L=3000,u="wave at me",**k): return dict(user=u, chunks=[[L,'{"line":"%s","emotion":"soft","pose":"wave"}'%WLINE2]], line=WLINE2, **k)
SETS.update({
 'wave_hold':[wave(hold=HOLD), plain_wink(settle=1)],
 'wave_wave':[wave(hold=HOLD), wave(settle=1)],
 'wave_cancel':[dict(user="wave at me", cancel=4500, chunks=[[1500,'{"line":"Hey there. Caught","emotion":"soft","pose":"wave"}'],[15000,' your wave."}']], line="Hey there. Caught your wave.", hold=HOLD), plain_wink(settle=1)],
 'wave_entry':[wave(L=200, nowait=1), reply("Wink. Catch it You are welcome, obviously.", pose="wink", user="wink at me", at=250, wait_br='win', settle=1)],
})

PLINE="Hmph. I am not talking to you right now."
def pout(L=3000,u="pout for me",**k): return dict(user=u, chunks=[[L,'{"line":"%s","emotion":"bratty","pose":"pout"}'%PLINE]], line=PLINE, **k)
SETS.update({
 'pout_hold':[pout(hold=HOLD), plain_wink(settle=1)],
 'cold_pout':[pout(L=600, hold=HOLD), plain_wink(settle=1)],
 'cold_wave':[wave(L=600, hold=HOLD), plain_wink(settle=1)],
})

TLINE="Fine, pouting just for you :)"
def tpout(L=3000,**k): return dict(user="Pout for me", chunks=[[L,'{"line":"%s","emotion":"bratty","pose":"pout"}'%TLINE]], line=TLINE, **k)
SETS.update({
 'tylo_pout':[reply("Heh, you're welcome", user="thanks", settle=1), tpout(hold=HOLD), plain_wink(settle=1)],
 'tylo_cold':[tpout(L=600, hold=HOLD), plain_wink(settle=1)],
 'tylo_wave':[reply("Heh, you're welcome", user="thanks", settle=1), wave(u="Wave at me", hold=6), plain_wink(settle=1)],
 'tylo_smug':[reply("Heh, you're welcome", user="thanks", settle=1), smug(u="Smug for me", hold=6), plain_wink(settle=1)],
})

LONG="Ugh, fine, I will tell you about my day, but only because you asked so nicely. I woke up late, spilled my tea, and then the cat stole my spot on the couch, can you believe that? Anyway, it got better later, I guess."
HYPE="WAIT! You actually did it! That is AMAZING, I cannot believe it, okay, okay, tell me everything right now!"
SETS.update({
 'talk06':[reply(LONG, settle=1), reply(HYPE, user="I passed my exam", settle=1), reply(LONG, user="and then what", settle=1), reply(L95, user="hello", settle=1)],
})

TKLINE="Fine. I am listening, so talk."
def talk(L=3000,u="talk",**k): return dict(user=u, chunks=[[L,'{"line":"%s","emotion":"bratty","pose":"talk"}'%TKLINE]], line=TKLINE, **k)
SETS.update({
 'talk_hold':[talk(hold=HOLD), reply(L95, user="ok so about my day", settle=1)],
 'talk_cold':[talk(L=600, hold=HOLD), reply(L95, user="ok so about my day", settle=1)],
 'plain_only':[reply(L95, user="tell me something", settle=1)],
})

steps=SETS[SET]
INIT=r"""window.__plan=null;(function(){const of=window.fetch;window.fetch=function(u,o){const url=typeof u==='string'?u:(u&&u.url)||'';if(url.indexOf('api.x.ai')>=0&&window.__plan){const plan=window.__plan;const isStreamReq=/"stream":true/.test((o&&o.body)||'');
if(window.__ns&&!isStreamReq){const sg=o&&o.signal;return new Promise((res,rej)=>{const h=setTimeout(()=>res(new Response(JSON.stringify({choices:[{message:{content:plan[0][1]}}]}),{status:200,headers:{'content-type':'application/json'}})),window.__ns);if(sg)sg.addEventListener('abort',()=>{clearTimeout(h);rej(new DOMException('Aborted','AbortError'))})})}
if(window.__ns&&isStreamReq){return Promise.resolve(new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));c.close()}}),{status:200,headers:{'content-type':'text/event-stream'}}))}const enc=new TextEncoder();const sig=o&&o.signal;let timers=[];const stream=new ReadableStream({start(c){const t0=performance.now();let done=false;const fin=()=>{if(done)return;done=true;try{c.enqueue(enc.encode('data: [DONE]\n\n'));c.close()}catch(e){}};
 plan.forEach(([ms,text])=>{timers.push(setTimeout(()=>{if(done)return;for(let i=0;i<text.length;i+=18){c.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{content:text.slice(i,i+18)}}]})+'\n\n'))}},ms))});
 timers.push(setTimeout(fin,plan[plan.length-1][0]+50));if(sig)sig.addEventListener('abort',()=>{timers.forEach(clearTimeout);done=true;try{c.error(new DOMException('Aborted','AbortError'))}catch(e){}})}});
 return Promise.resolve(new Response(stream,{status:200,headers:{'content-type':'text/event-stream'}}))}return of.apply(this,arguments)};})();
window.__s=[];window.__au=0;window.__tl=[];window.__marks=[];window.__mark=(k)=>window.__marks.push([performance.now(),k]);
(function(){const st=window.setTimeout,ct=window.clearTimeout;window.setTimeout=function(f,ms){const a=[].slice.call(arguments);const stk=(new Error().stack||'').split('\n').slice(2,4).map(x=>x.replace(/^.*\/assets\//,'').trim()).join(' < ');
 const id=st.apply(this,[function(){if(ms>=700)window.__tl.push([performance.now(),'fire',ms,stk]);return f.apply(this,arguments)}].concat(a.slice(1)));if(ms>=700)window.__tl.push([performance.now(),'set',ms,stk,id]);return id};
 window.clearTimeout=function(id){window.__tl.push([performance.now(),'clear',0,'',id]);return ct.apply(this,arguments)}})();
(function(){const P=HTMLMediaElement.prototype,o=P.play;P.play=function(){window.__au++;let d=false;const dec=()=>{if(!d){d=true;window.__au--}};this.addEventListener('ended',dec,{once:true});this.addEventListener('pause',dec,{once:true});this.addEventListener('error',dec,{once:true});return o.apply(this,arguments)}})();
(function(){const A=window.AudioBufferSourceNode;if(!A)return;const o=A.prototype.start;A.prototype.start=function(){window.__au++;let d=false;this.addEventListener('ended',()=>{if(!d){d=true;window.__au--}},{once:true});return o.apply(this,arguments)}})();
(function w(){const st=document.querySelector('.rai-stage');if(st){const imgs=[...st.querySelectorAll('img,canvas')];
const info=imgs.map(i=>{const cs=getComputedStyle(i);const r=i.getBoundingClientRect();const base=(i.getAttribute('src')||'').split('/').pop().split('?')[0];
 const isC=i.tagName==='CANVAS';const role=i.dataset.raiRole||'';const sh=i.dataset.raiSheet||'';return {isC,n:isC?'canvas':base.startsWith('blob:')||/^[0-9a-f-]{30,}$/.test(base)?'blob':base.replace(/\.(png|webp)$/,''),role,sh,op:parseFloat(cs.opacity),vis:cs.visibility,ok:isC?true:(i.complete&&i.naturalWidth>0),w:r.width}});
const shown=info.filter(a=>a.op>0.01&&a.vis!=='hidden'&&a.w>0);
const bs=[...document.querySelectorAll('.chat-bubble-assistant')];const lb=bs[bs.length-1];let cap=0,capt='';if(lb){const r=lb.getBoundingClientRect(),cs=getComputedStyle(lb);if(r.height>0&&r.bottom>0&&r.top<innerHeight&&parseFloat(cs.opacity)>0.05&&cs.visibility!=='hidden'){cap=lb.textContent.length;capt=lb.textContent}}
window.__geo=window.__geo||{};imgs.forEach(i=>{if(i.tagName!=='IMG')return;const cs=getComputedStyle(i);if(parseFloat(cs.opacity)<=0.01||cs.visibility==='hidden')return;const r=i.getBoundingClientRect();const sr=st.getBoundingClientRect();const k=(i.getAttribute('src')||'').split('/').pop().split('?')[0];if(!window.__geo[k])window.__geo[k]={rect:[r.x,r.y,r.width,r.height],stage:[sr.x,sr.y,sr.width,sr.height],nat:[i.naturalWidth,i.naturalHeight],fit:cs.objectFit,tf:cs.transform,role:i.dataset.raiRole||'',t:performance.now()}});window.__s.push({t:performance.now(),raw:shown.map(a=>a.n),pose:st.dataset.raiPose,emo:st.dataset.raiEmotion,tk:st.dataset.raiTalking,mo:st.dataset.raiMouthFrame,bl:st.dataset.raiBlinkFrame,br:st.dataset.raiBridgeFrame||'n/a',
 sh:shown.map(a=>{if(a.role==='bridge'){const m=/^(in|out|win|wout|pin|pout|tin|tout)-(\d{3})$/.exec(a.sh);if(m)return({in:'i',out:'o',win:'wi',wout:'wo',pin:'pi',pout:'po',tin:'ti',tout:'to'})[m[1]]+m[2];return'bridge'+a.sh.replace('bridge-','');}if(a.role==='clip')return'clip'+a.sh.replace('clip-','');return a.n;}),ok:shown.every(a=>a.ok),nsh:shown.length,cap,capt,au:window.__au,fb:st.dataset.raiBridgeFallback,ph:st.dataset.raiPosePhase,rel:st.dataset.raiSmugRelease,vis:document.visibilityState,rm:st.dataset.raiReduced})}requestAnimationFrame(w)})();"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('RAI_BROWSER') or None, args=['--autoplay-policy=no-user-gesture-required'])
    ctx=b.new_context(**(dict(viewport={"width":1280,"height":800}, device_scale_factor=1) if os.environ.get("DESK") else dict(viewport={"width":412,"height":915}, device_scale_factor=float(os.environ.get("DPR","3")), is_mobile=True, has_touch=True, user_agent=UA)), service_workers=("allow" if os.environ.get("SW") else "block"), timezone_id="America/Chicago", ignore_https_errors=False, reduced_motion=("reduce" if os.environ.get("RM") else "no-preference"))
    REQ=[]
    pg=ctx.new_page(); pg.on('request', lambda r: REQ.append(r.url) if '/rai/' in r.url else None); pg.add_init_script(INIT); pg.add_init_script("window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([e.startTime,e.duration,e.name])}).observe({type:'longtask',buffered:true})}catch(e){}")
    import os
    if os.environ.get('JANK'):
        b,per=os.environ['JANK'].split(',')
        pg.add_init_script("setInterval(()=>{const e=performance.now()+%s;while(performance.now()<e);},%s);"%(b,per))
    WAV=open(os.environ.get('WAV') or ('/workspace/f807/mouth/wire/stub_speech_long.wav' if VOICE=='on' else '/workspace/f807/mouth/wire/stub_speech.wav'),'rb').read()
    def eleven(route):
        if route.request.method=='OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST'})
        if os.environ.get('ELFAIL'): return route.fulfill(status=401, headers={'access-control-allow-origin':'*','content-type':'application/json'}, body='{"detail":"x"}')
        route.fulfill(status=200, headers={'access-control-allow-origin':'*','content-type':'audio/wav'}, body=WAV)
    pg.route('https://api.elevenlabs.io/**', eleven)
    cdp=ctx.new_cdp_session(pg)
    if CPU>1: cdp.send('Emulation.setCPUThrottlingRate',{'rate':CPU})
    NET=os.environ.get('NET','')
    if NET:
        cond={'slow4g':(1.6e6/8,750e3/8,150),'slow3g':(400e3/8,400e3/8,400),'fast3g':(1.6e6/8,750e3/8,562)}[NET]
        cdp.send('Network.enable'); cdp.send('Network.emulateNetworkConditions',{'offline':False,'downloadThroughput':cond[0],'uploadThroughput':cond[1],'latency':cond[2]})
    if os.environ.get('PWA_OLD'):
        # installed-PWA scenario: run build N-1 (SW registered, controlling), then swap the server to build N and relaunch
        link=os.environ['PWA_LINK']
        def point(t):
            tmp=link+'.tmp'
            if os.path.lexists(tmp): os.remove(tmp)
            os.symlink(t,tmp); os.replace(tmp,link)
        point(os.environ['PWA_OLD'])
        pg.goto(BASE, timeout=120000); pg.wait_for_timeout(15000)
        pg.reload(timeout=120000); pg.wait_for_timeout(8000)
        print('old build', pg.evaluate("document.querySelector('meta[name=star-rai-build]')?.content"), 'sw ctrl', pg.evaluate("!!navigator.serviceWorker.controller"), flush=True)
        point(os.environ['PWA_NEW'])
    pg.goto(BASE, timeout=120000)
    print('build', pg.evaluate("document.querySelector('meta[name=star-rai-build]')?.content"), flush=True)
    pg.wait_for_function("(()=>{const i=document.querySelector('.rai-stage img');return i&&i.complete&&i.naturalWidth})()", timeout=120000)
    pg.wait_for_timeout(1200)
    try: pg.get_by_role('button', name='Skip').click(timeout=2500); pg.wait_for_timeout(400)
    except Exception: pass
    pg.get_by_role('button', name='Menu').first.click(); pg.wait_for_timeout(300)
    pg.get_by_role('menuitem', name=re.compile('Settings')).click(); pg.wait_for_timeout(500)
    pg.locator('#grok-key').click(); pg.wait_for_timeout(150); pg.locator('#grok-key').fill('xai-FAKEKEY0000000000000000'); pg.get_by_role('button', name='Save key').nth(0).click(); pg.wait_for_timeout(200)
    pg.locator('#eleven-key').click(); pg.wait_for_timeout(150); pg.locator('#eleven-key').fill('sk_FAKEELEVEN000000000000'); pg.get_by_role('button', name='Save key').nth(1).click(); pg.wait_for_timeout(200)
    pg.locator('#voice-id').fill('FAKEVOICEID000'); pg.get_by_role('button', name='Save voice').click(); pg.wait_for_timeout(200)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(800)
    if VOICE=='off':
        pg.get_by_role('button', name='Menu').first.click(); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='Mute voice').click(); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    frames=[]; c2=ctx.new_cdp_session(pg)
    c2.on('Page.screencastFrame', lambda ev:(frames.append((ev['metadata']['timestamp'], ev['data'])), c2.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})))
    pg.wait_for_timeout(PRE)
    off=pg.evaluate("Date.now()-performance.now()")
    if not os.environ.get('NOSC'): c2.send('Page.startScreencast', {'format':'jpeg','quality':80,'everyNthFrame':1,'maxWidth':824,'maxHeight':1830})
    pg.evaluate("window.__s=[]")
    runs=[]
    def st_now(): return pg.evaluate("(()=>{const s=document.querySelector('.rai-stage');return {pose:s.dataset.raiPose,br:s.dataset.raiBridgeFrame,ph:s.dataset.raiPosePhase,rel:s.dataset.raiSmugRelease,au:window.__au,t:performance.now()}})()")
    def busy(): return pg.get_by_role('button', name='Cancel').count()>0
    def set_hidden(h):
        pg.evaluate("""h=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>h?'hidden':'visible'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});document.dispatchEvent(new Event('visibilitychange'));window.__mark(h?'hide':'show')}""", h)
    def sample_dump():
        return pg.evaluate("window.__s")
    allS=[]; marks=[]
    for i,st in enumerate(steps):
        pg.evaluate('p=>{window.__plan=p}', st['chunks']); pg.evaluate('n=>{window.__ns=n}', st.get('ns',0))
        pg.get_by_role('textbox', name='Message').fill(st['user'])
        if st.get('wait_br'):
            t_end=time.time()+90
            while time.time()<t_end:
                if st_now()['br']==st['wait_br']: break
                pg.wait_for_timeout(15)
            print('send at bridge', st_now()['br'], 'busy', busy(), flush=True)
        t0=pg.evaluate("performance.now()"); pg.evaluate("k=>window.__mark(k)", 'send%d'%i)
        pg.get_by_role('button', name='Send').click()
        pg.evaluate("window.__mark('clicked')")
        tc=None
        if st.get('cancel'):
            pg.wait_for_timeout(st['cancel'])
            tc=pg.evaluate("performance.now()"); pg.evaluate("window.__mark('cancel')")
            pg.get_by_role('button', name='Cancel').click()
            print('cancel at', round(tc-t0), flush=True)
        if st.get('hide_exit'):
            # hide mid-973 (at o02/o03) for 3 s, then show
            t_end=time.time()+60
            while time.time()<t_end:
                a=st_now()
                if a['br'] in ('out-02','out-03'): break
                pg.wait_for_timeout(20)
            print('hide at', a['br'], flush=True); set_hidden(True); pg.wait_for_timeout(3000); set_hidden(False)
        if st.get('nowait'):
            runs.append(dict(i=i,cancel_t=tc,user=st['user'],line=st['line'],t0=t0,tq=None,t1=pg.evaluate("performance.now()"),chunks=st['chunks'],hold=None))
            continue
        pg.wait_for_timeout(800)
        t_end=time.time()+(200 if CPU>3 else 140); tq=None
        while time.time()<t_end:
            a=st_now()
            quiet = (not busy()) and a['au']==0 and a['br']=='off' and a['rel']=='off'
            if 'hold' in st:
                # quiet must last 1.5 s (TTS can start a beat after the line lands)
                if quiet and a['ph']=='hold':
                    tq=tq or a['t']
                    if a['t']-tq>=1500: break
                else: tq=None
            else:
                if quiet and a['t']-t0>3000: tq=a['t']; break
            pg.wait_for_timeout(100)
        print('step',i,'quiet at',round((tq or 0)-t0),'phase',a['ph'], flush=True)
        if 'hold' in st:
            pg.evaluate("window.__mark('hold_ready')")
            pg.wait_for_timeout(int(st['hold']*1000))
            pg.evaluate("window.__mark('hold_end')")
        else:
            pg.wait_for_timeout(int(os.environ.get('SETTLE_MS','6000')))
        runs.append(dict(i=i,cancel_t=tc,user=st['user'],line=st['line'],t0=t0,tq=tq,t1=pg.evaluate("performance.now()"),chunks=st['chunks'],hold=st.get('hold')))
        if st.get('after')=='hide':
            set_hidden(True); pg.wait_for_timeout(5000); set_hidden(False); pg.wait_for_timeout(2000)
            a=st_now(); print('after hide/show phase',a['ph'],'br',a['br'],flush=True)
        if st.get('after')=='reload':
            allS+= [dict(s,seg=len(marks)) for s in sample_dump()]; marks.append(pg.evaluate("window.__marks"))
            pg.evaluate("window.__mark('reload')"); pg.reload(timeout=120000)
            pg.wait_for_function("(()=>{const i=document.querySelector('.rai-stage img');return i&&i.complete&&i.naturalWidth})()", timeout=120000)
            pg.wait_for_timeout(4000)
            a=st_now(); print('after reload phase',a['ph'],'pose',a['pose'],flush=True)
            runs[-1]['after_reload']=a
    c2.send('Page.stopScreencast'); S=sample_dump()
    allS+=[dict(s,seg=len(marks)) for s in S]; marks.append(pg.evaluate("window.__marks"))
    json.dump(dict(cpu=CPU,voice=VOICE,pre=PRE,set=SET,url=BASE,runs=runs,marks=marks,seg_note='seg>0 after reload (new performance clock)'),open(f'{OUT}/run.json','w'))
    json.dump(allS,open(f'{OUT}/samples.json','w'))
    json.dump(pg.evaluate("window.__raiBridgeDone||[]"),open(f'{OUT}/bridge_done.json','w'))
    json.dump(pg.evaluate("window.__lt||[]"),open(f'{OUT}/longtasks.json','w'))
    json.dump(pg.evaluate("window.__raiBridgeLog||[]"),open(f'{OUT}/bridge_log.json','w'))
    json.dump(pg.evaluate("window.__geo||{}"),open(f'{OUT}/geo.json','w'))
    json.dump(pg.evaluate("performance.getEntriesByType('resource').filter(e=>/\\/rai\\//.test(e.name)).map(e=>({n:e.name.split('/').pop().split('?')[0],start:e.startTime,end:e.responseEnd,size:e.transferSize||e.encodedBodySize}))"),open(f'{OUT}/res.json','w'))
    os.makedirs(f'{OUT}/sc',exist_ok=True); meta=[]
    for i,(ts,data) in enumerate(frames):
        fn=f'{OUT}/sc/{i:05d}.jpg'; open(fn,'wb').write(base64.b64decode(data)); meta.append(dict(i=i,t=ts*1000-off,f=fn))
    json.dump(meta,open(f'{OUT}/sc_meta.json','w'))
    json.dump(REQ,open(f'{OUT}/requests.json','w'))
    json.dump(pg.evaluate("[...document.querySelectorAll('.rai-stage img, .rai-stage canvas')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,clip:e.dataset.raiClip||'',role:e.dataset.raiRole||'',w:e.width||0,h:e.height||0,rect:[r.x,r.y,r.width,r.height],fit:getComputedStyle(e).objectFit}})"),open(f'{OUT}/layers.json','w'))
    json.dump(pg.evaluate("document.querySelector('meta[name=star-rai-build]')?.content||null"),open(f'{OUT}/build.json','w'))
    ctx.close(); b.close()
print('done',SET,CPU,VOICE,len(allS))
