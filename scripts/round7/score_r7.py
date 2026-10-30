"""Round 7: score extra decision models on the round 5/6 posts against d1-ultra, Decider and the hand labels.
Reads raw answers directly. Writes labels_r7.csv, model_agreement_r7.csv, model_comparison_r7.csv, run_r7.csv to <outdir>.
usage: python3 score_r7.py <outdir> <model> [<model> ...]
The source tree (round5/, round6/ with posts, raw answers and hand labels) is $R7_SRC, or the parent of this script's directory."""
import csv, json, os, sys
from collections import Counter
H = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('R7_SRC') or os.path.join(H, '..')
R5, R6 = os.path.join(SRC, 'round5'), os.path.join(SRC, 'round6')
outdir, *models = sys.argv[1:]
REF = {'d1': 'liquid/d1-ultra', 'pplx': 'perplexity/pplx-decider-v1.2'}
QS = [('stance', 'core', 'stance', 'choice', 5), ('on_topic', 'core', 'on_topic', 'bool', 5), ('frame', 'framing', 'frame', 'choice', 5),
      ('policy', 'framing', 'policy_politics', 'bool', 5), ('claims_found', 'attribution', 'claims_found', 'bool', 5), ('stance4', 'stance4', 'stance', 'choice', 6)]
posts = [json.loads(l) for l in open(os.path.join(R5, 'posts_r5.jsonl'))]
ids = [p['id'] for p in posts]
user = {p['id']: p['username'] for p in posts}

def raw_path(group, model):
    s = model.replace('/', '_')
    return os.path.join(R6, 'raw', f'stance4_{s}.jsonl') if group == 'stance4' else os.path.join(R5, 'raw', f'{group}_{s}.jsonl')

def load(group, model):
    """{id: record} for answered posts, plus error lines (latest per id) for posts never answered."""
    p, ok, err = raw_path(group, model), {}, {}
    if not os.path.exists(p):
        return None, {}
    for f in (p, p + '.errors'):
        if os.path.exists(f):
            for l in open(f):
                r = json.loads(l)
                (ok if 'answers' in r else err)[r['id']] = r
    return ok, {i: e for i, e in err.items() if i not in ok}

def answer(rec, key, kind):
    a = rec['answers'].get(key)
    if a is None: return ''
    return a['choice'] if kind == 'choice' else ('yes' if a['probability'] >= 0.5 else 'no')

def kappa(a, b):
    n = len(a)
    if n == 0: return None
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    return None if pe == 1 else round((po - pe) / (1 - pe), 3)

pct = lambda c, n: round(100 * c / n, 1) if n else ''
allm = {**REF, **{m: m for m in models}}
data, errors, runinfo = {}, {}, []
for k, m in allm.items():
    data[k], errors[k] = {}, {}
    for g in ['core', 'framing', 'attribution', 'stance4']:
        ok, err = load(g, m)
        if ok is None: continue
        data[k][g], errors[k][g] = ok, err
        recs = list(ok.values())
        cost = sum(float(r.get('cost') or 0) for r in recs); mkt = sum(float(r.get('market_cost') or 0) for r in recs)
        lat = sorted(r['latency_s'] for r in recs)
        runinfo.append({'model': m, 'group': g, 'answered': len(ok), 'total': len(ids), 'errors': len(err),
                        'error_sample': (next(iter(err.values()))['error'] or '')[-160:].replace('\n', ' ') if err else '',
                        'retried_calls': sum(r.get('attempts', 1) > 1 for r in recs), 'input_tokens': sum((r.get('usage') or {}).get('inputTokens') or 0 for r in recs),
                        'gateway_cost_usd': round(cost, 6), 'market_cost_usd': round(mkt, 6),
                        'median_latency_s': lat[len(lat) // 2] if lat else '', 'max_latency_s': lat[-1] if lat else ''})

def ans(k, q):
    """{id: answer} for one model and question, answered posts only."""
    _, g, key, kind, _ = next(x for x in QS if x[0] == q)
    return {i: answer(r, key, kind) for i, r in data[k].get(g, {}).items()}

A = {k: {q[0]: ans(k, q[0]) for q in QS} for k in allm}
# Per-post answers for the new models.
rows = []
for i in ids:
    row = {'id': i, 'username': user[i]}
    for m in models:
        for q in QS:
            row[f'{m}:{q[0]}'] = A[m][q[0]].get(i, '')
    rows.append(row)
agree = []
for m in models:
    for q, _, _, _, rnd in QS:
        if not A[m][q]: continue
        for r in REF:
            both = [i for i in ids if A[m][q].get(i, '') != '' and A[r][q].get(i, '') != '']
            xa, xb = [A[m][q][i] for i in both], [A[r][q][i] for i in both]
            ag = sum(x == y for x, y in zip(xa, xb))
            agree.append({'model': m, 'question': q, 'round': rnd, 'vs': REF[r], 'n': len(both), 'agree': ag, 'pct': pct(ag, len(both)), 'kappa': kappa(xa, xb)})

rd = lambda f: list(csv.DictReader(open(os.path.join(R5 if f == 'hand_labels_r5.csv' else R6, f), encoding='utf-8')))
hand5, hand6, hand_oa = rd('hand_labels_r5.csv'), rd('hand_labels_r6.csv'), rd('hand_labels_r5_6_openai.csv')
hv = lambda h: 'reporting' if h['hand'] == 'skip' else h['hand']
S3 = {'reject', 'curious', 'serious'}

def score(sub, q, keep, target):
    """(correct, scored, unanswered) over hand rows kept by `keep`; unanswered posts count as wrong and are reported."""
    hs = [h for h in sub if keep(h)]
    got = [A_k[q].get(h['id'], '') for h in hs]
    return sum(g == target(h) for g, h in zip(got, hs)), len(hs), sum(g == '' for g in got)

comp = []
first26 = hand5 + hand6
for k, m in allm.items():
    A_k = A[k]
    note26 = 'no (hand labels drawn from d1-ultra/Decider disagreements)'
    noteo = 'no (outlier set picked where GPT-6 Luna disagreed with both d1-ultra and Decider)'
    metrics = []
    if A_k['stance']:
        metrics += [('r5_hand26_threeway', *score(hand5, 'stance', lambda h: h['hand'] in S3, lambda h: h['hand']), note26),
                    ('r5_outlier6_threeway', *score(hand_oa, 'stance', lambda h: h['hand'] in S3, lambda h: h['hand']), noteo)]
    if A_k['stance4']:
        metrics += [('r6_hand26_skips_as_reporting', *score(first26, 'stance4', lambda h: True, hv), note26),
                    ('r6_hand26_not_skipped', *score(first26, 'stance4', lambda h: h['hand'] != 'skip', lambda h: h['hand']), note26),
                    ('r6_outlier6_skips_as_reporting', *score(hand_oa, 'stance4', lambda h: True, hv), noteo),
                    ('r6_outlier6_not_skipped', *score(hand_oa, 'stance4', lambda h: h['hand'] != 'skip', lambda h: h['hand']), noteo)]
    for name, c, n, un, cmp_ in metrics:
        comp.append({'model': m, 'metric': name, 'correct': c, 'n': n, 'pct': pct(c, n), 'unanswered': un,
                     'comparable': cmp_ if k in REF else cmp_.replace('no (', 'no (sample not drawn for this model; ')})

def write(name, rs, fields):
    """Always (re)write the file, header-only when there are no rows, so a rescore never leaves stale rows behind."""
    with open(os.path.join(outdir, name), 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rs)
write('labels_r7.csv', rows, ['id', 'username', *(f'{m}:{q[0]}' for m in models for q in QS)])
write('model_agreement_r7.csv', agree, ['model', 'question', 'round', 'vs', 'n', 'agree', 'pct', 'kappa'])
write('model_comparison_r7.csv', comp, ['model', 'metric', 'correct', 'n', 'pct', 'unanswered', 'comparable'])
write('run_r7.csv', [r for r in runinfo if r['model'] in models], ['model', 'group', 'answered', 'total', 'errors', 'error_sample', 'retried_calls', 'input_tokens',
                                                                   'gateway_cost_usd', 'market_cost_usd', 'median_latency_s', 'max_latency_s'])
print(json.dumps({'agreement_rows': len(agree), 'comparison_rows': len(comp)}))
