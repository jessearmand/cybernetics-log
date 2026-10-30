"""Run one question group with one model over a posts file. Resumable. Records answers, cost, latency.
usage: python3 run_r7x.py <group> <model> <posts.jsonl> <out.jsonl> [ids.txt]"""
import json,subprocess,sys,os,time
from concurrent.futures import ThreadPoolExecutor
os.environ['PATH']='/home/box/.local/bin:'+os.path.expanduser('~/.local/node24/bin')+':'+os.environ['PATH']
Q=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'questions_r7.json')))
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
        r=subprocess.run(['ai','decide','-m',model,'--input','text',*Q[group]['args'],'--max-retries','2'],input=p['text'],capture_output=True,text=True,timeout=120)
        dt=time.time()-t
        if r.returncode==0:
            try:
                j=json.loads(r.stdout); g=j.get('providerMetadata',{}).get('gateway',{})
                return {'id':p['id'],'username':p.get('username'),'model':model,'group':group,'answers':j['answers'],'usage':j.get('usage'),'cost':g.get('cost'),'latency_s':round(dt,3),'attempts':a+1,'market_cost':g.get('marketCost'),'openai':j.get('providerMetadata',{}).get('openai'),'provider_meta':{k:v for k,v in j.get('providerMetadata',{}).items() if k!='gateway'} or None}
            except Exception as e: err=f'parse:{e}'
        else: err=r.stderr[-300:]
        if 'authentication failed' in (err or '').lower(): break
        time.sleep(2*(a+1))
    return {'id':p['id'],'username':p.get('username'),'model':model,'group':group,'error':err}
with ThreadPoolExecutor(4) as ex, open(out,'a') as f:
    for res in ex.map(run,todo): f.write(json.dumps(res)+'\n'); f.flush()
print('done',group,model,len(todo))
