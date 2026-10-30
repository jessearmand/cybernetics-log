"""Run one question group with one model over a posts file. Resumable. Records answers, cost, latency and provider metadata.
usage: python3 run_r6.py <group> <model> <posts.jsonl> <out.jsonl> [ids.txt]"""
import json,subprocess,sys,os,time
from concurrent.futures import ThreadPoolExecutor
os.environ['PATH']='/home/box/.local/bin:'+os.path.expanduser('~/.local/node24/bin')+':'+os.environ['PATH']
# AI_BIN, RUN_CALL_TIMEOUT and RUN_RETRY_SLEEP exist so tests can drive this with a stub instead of the real CLI.
AI=os.environ.get('AI_BIN','ai'); TIMEOUT=float(os.environ.get('RUN_CALL_TIMEOUT','120')); BACKOFF=float(os.environ.get('RUN_RETRY_SLEEP','2'))
_here=os.path.dirname(os.path.abspath(__file__))
_q=os.path.join(_here,'questions_r6.json')
Q=json.load(open(_q if os.path.exists(_q) else os.path.join(_here,'..','..','data','questions_r6.json')))
group,model,infile,out=sys.argv[1:5]
ids=set(open(sys.argv[5]).read().split()) if len(sys.argv)>5 else None
posts=[json.loads(l) for l in open(infile)]
if ids: posts=[p for p in posts if p['id'] in ids]
done=set()
if os.path.exists(out): done={json.loads(l)['id'] for l in open(out) if '"answers"' in l}
todo=[p for p in posts if p['id'] not in done]
def run(p):
    err=None
    for a in range(4):
        t=time.time()
        try:
            r=subprocess.run([AI,'decide','-m',model,'--input','text',*Q[group]['args'],'--max-retries','2'],input=p['text'],capture_output=True,text=True,timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            # A hung call is retried like any other failure, and recorded as an error if every attempt hangs.
            err=f'timeout after {TIMEOUT:g}s'; time.sleep(BACKOFF*(a+1)); continue
        dt=time.time()-t
        if r.returncode==0:
            try:
                j=json.loads(r.stdout); g=j.get('providerMetadata',{}).get('gateway',{})
                return {'id':p['id'],'username':p.get('username'),'model':model,'group':group,'answers':j['answers'],'usage':j.get('usage'),'cost':g.get('cost'),'latency_s':round(dt,3),'attempts':a+1,'market_cost':g.get('marketCost'),'openai':j.get('providerMetadata',{}).get('openai'),'provider_meta':{k:v for k,v in j.get('providerMetadata',{}).items() if k!='gateway'} or None}
            except Exception as e: err=f'parse:{e}'
        else: err=r.stderr[-300:]
        if 'authentication failed' in (err or '').lower(): break
        time.sleep(BACKOFF*(a+1))
    return {'id':p['id'],'username':p.get('username'),'model':model,'group':group,'error':err}
with ThreadPoolExecutor(4) as ex, open(out,'a') as f:
    for res in ex.map(run,todo): f.write(json.dumps(res)+'\n'); f.flush()
print('done',group,model,len(todo))
