"""Round 7 X set: score seven decision models on the 79 on-topic posts.
'use' is compared with Seeker labels (a single-annotator reference from another bot, not Jesse's hand labels);
stance4 has no reference labels, so only model-vs-model agreement and distributions.
usage: python3 score_r7x.py <outdir>   (reads posts_r7.jsonl and raw/ from $R7_SRC/round7, or next to this script)"""
import csv, json, os, sys
from collections import Counter
from itertools import combinations
H = os.path.join(os.environ['R7_SRC'], 'round7') if os.environ.get('R7_SRC') else os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
MODELS = {'d1': 'liquid/d1-ultra', 'pplx': 'perplexity/pplx-decider-v1.2', 'oa': 'openai/gpt-6-luna-decisions', 'joey': 'baseten/joey-1',
          'elephant': 'baseten/elephant-1', 'mammoth': 'baseten/mammoth-1', 'msd1': 'microsoft/microsoft-decision-1'}
OPTS = {'use': ['applied', 'commentary', 'academic'], 'stance4': ['reject', 'curious', 'serious', 'reporting']}
QKEY = {'use': 'use', 'stance4': 'stance'}
posts = [json.loads(l) for l in open(os.path.join(H, 'posts_r7.jsonl'))]
ids = [p['id'] for p in posts]; P = {p['id']: p for p in posts}

def kappa(a, b):
    n = len(a)
    if n == 0: return None
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return None if pe == 1 else round((po - pe) / (1 - pe), 3)
pct = lambda c, n: round(100 * c / n, 1) if n else ''

raw, run = {}, []
for k, m in MODELS.items():
    for g in OPTS:
        f = os.path.join(H, 'raw', f"{g}_{m.replace('/', '_')}.jsonl")
        ok, err = {}, {}
        for path in (f, f + '.errors'):
            if os.path.exists(path):
                for l in open(path):
                    r = json.loads(l); (ok if 'answers' in r else err)[r['id']] = r
        err = {i: e for i, e in err.items() if i not in ok}
        raw[k, g] = ok
        recs = list(ok.values()); lat = sorted(r['latency_s'] for r in recs)
        run.append({'model': m, 'question': g, 'answered': len(ok), 'total': len(ids), 'errors': len(err),
                    'error_sample': (next(iter(err.values()))['error'] or '')[-160:].replace('\n', ' ') if err else '',
                    'retried_calls': sum(r.get('attempts', 1) > 1 for r in recs), 'input_tokens': sum((r.get('usage') or {}).get('inputTokens') or 0 for r in recs),
                    'gateway_cost_usd': round(sum(float(r.get('cost') or 0) for r in recs), 6), 'market_cost_usd': round(sum(float(r.get('market_cost') or 0) for r in recs), 6),
                    'median_latency_s': lat[len(lat) // 2] if lat else '', 'max_latency_s': lat[-1] if lat else ''})
A = {(k, g): {i: r['answers'][QKEY[g]]['choice'] for i, r in raw[k, g].items()} for k in MODELS for g in OPTS}
PR = {(k, g): {i: r['answers'][QKEY[g]]['probabilities'] for i, r in raw[k, g].items()} for k in MODELS for g in OPTS}

def write(name, rows, fields):
    """Always (re)write the file, header-only when there are no rows, so a rescore never leaves stale rows behind."""
    with open(os.path.join(out, name), 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rows)
cols = lambda rows: list(rows[0])  # for exports that always have rows (one per model, question or pair)

write('posts_r7.csv', [{'id': p['id'], 'username': p['username'], 'created_at': p['created_at'], 'url': p['url'], 'queries': ';'.join(p['queries']),
                        'seeker_label': p['seeker_label'], 'text': p['text']} for p in posts],
      ['id', 'username', 'created_at', 'url', 'queries', 'seeker_label', 'text'])
labels = []
for i in ids:
    row = {'id': i, 'username': P[i]['username'], 'seeker_label': P[i]['seeker_label']}
    for k in MODELS:
        for g in OPTS:
            row[f'{k}_{g}'] = A[k, g].get(i, '')
            row[f'{k}_{g}_conf'] = round(max(PR[k, g][i].values()), 3) if i in PR[k, g] else ''
    labels.append(row)
write('labels_r7_x.csv', labels, ['id', 'username', 'seeker_label', *(f'{k}_{g}{c}' for k in MODELS for g in OPTS for c in ('', '_conf'))])
agree = []
for g in OPTS:
    for a, b in combinations(MODELS, 2):
        both = [i for i in ids if i in A[a, g] and i in A[b, g]]
        xa, xb = [A[a, g][i] for i in both], [A[b, g][i] for i in both]
        ag = sum(x == y for x, y in zip(xa, xb))
        agree.append({'question': g, 'model_a': MODELS[a], 'model_b': MODELS[b], 'n': len(both), 'agree': ag, 'pct': pct(ag, len(both)), 'kappa': kappa(xa, xb)})
write('model_agreement_r7_x.csv', agree, cols(agree))
seeker = []
for k, m in MODELS.items():
    both = [i for i in ids if i in A[k, 'use']]
    xs, xm = [P[i]['seeker_label'] for i in both], [A[k, 'use'][i] for i in both]
    ag = sum(x == y for x, y in zip(xs, xm))
    row = {'model': m, 'n': len(both), 'agree': ag, 'pct': pct(ag, len(both)), 'kappa': kappa(xs, xm), 'model_applied': xm.count('applied')}
    for s in OPTS['use']:
        for c in OPTS['use']:
            row[f'seeker_{s}_model_{c}'] = sum(x == s and y == c for x, y in zip(xs, xm))
    seeker.append(row)
write('model_vs_seeker_r7_x.csv', seeker, cols(seeker))
dist = [{'model': m, 'question': g, 'option': o, 'count': sum(v == o for v in A[k, g].values())} for g in OPTS for k, m in MODELS.items() for o in OPTS[g]]
dist += [{'model': 'Seeker labels', 'question': 'use', 'option': o, 'count': sum(p['seeker_label'] == o for p in posts)} for o in OPTS['use']]
write('distribution_r7_x.csv', dist, cols(dist))
cands = []
for i in ids:
    who = [k for k in MODELS if A[k, 'use'].get(i) == 'applied']
    if who:
        cands.append({'id': i, 'username': P[i]['username'], 'seeker_label': P[i]['seeker_label'], 'n_models': len(who),
                      'models': ';'.join(MODELS[k] for k in who), **{f'{k}_p_applied': round(PR[k, 'use'][i]['applied'], 3) if i in PR[k, 'use'] else '' for k in MODELS},
                      'url': P[i]['url'], 'text': ' '.join(P[i]['text'].split())})
cands.sort(key=lambda r: -r['n_models'])
write('applied_candidates_r7_x.csv', cands, ['id', 'username', 'seeker_label', 'n_models', 'models', *(f'{k}_p_applied' for k in MODELS), 'url', 'text'])
write('run_r7_x.csv', run, cols(run))
print(json.dumps({'applied_candidates': len(cands)}))
