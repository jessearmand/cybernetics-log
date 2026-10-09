## Jev (typesafe-ai/jev via Vercel AI Gateway) stance labelling — run 2026-10-09 SGT

### Pair test (bitcloud original vs aleksil79 inversion)

| post | hand | Jev | P(R) | P(C) | P(S) | typesafe conf |
|---|---|---|---|---|---|---|
| bitcloud 2105576507233951781 | R | R | 0.52 | 0 | 0.48 | 0.28 |
| aleksil79 2105591033228890336 | S | S | 0.43 | 0.01 | 0.56 | 0.34 |

The standalone pair test run first (same prompt, about 2 min earlier) gave **both posts S**: bitcloud R0.42/C0/S0.58 (conf 0.37) and aleksil79 R0.44/C0.01/S0.55 (conf 0.33), so the inversion failed. In the batch run above, bitcloud flipped to R at 0.52, which happens to be correct. **Jev is not deterministic near 50/50.** Both posts sit on the R/S boundary with low confidence, and Jev does not reliably pick up the inversion. The original post gets about 0.42–0.52 R and the inverted copy about 0.43–0.44 R. That is better than the embeddings, which predicted the same stance every time, but it is still essentially a coin flip.

### Agreement with 40 random hand labels (18 R / 10 C / 12 S; note that report.md says 18/12/10 and 45/30/25%, but hand_labels.json actually gives R 45% / C 25% / S 30%)

- **Accuracy 55.0%** (22/40) vs embeddinggemma 47.5% and majority baseline 45%.
- **Macro-F1 0.556** (F1 R=0.58, C=0.59, S=0.50).

Confusion matrix (rows = hand, cols = Jev):

| hand \ Jev | R | C | S |
|---|---|---|---|
| R | 9 | 1 | 8 |
| C | 1 | 5 | 4 |
| S | 3 | 1 | 8 |

### Coverage/accuracy over top-probability threshold (40 hand-labelled posts)

| threshold | kept | coverage | accuracy |
|---|---|---|---|
| ≥0.00 | 40 | 100% | 55.0% |
| ≥0.40 | 40 | 100% | 55.0% |
| ≥0.50 | 39 | 98% | 53.8% |
| ≥0.55 | 34 | 85% | 55.9% |
| ≥0.60 | 33 | 82% | 57.6% |
| ≥0.65 | 30 | 75% | 56.7% |
| ≥0.70 | 27 | 68% | 55.6% |
| ≥0.75 | 24 | 60% | 62.5% |
| ≥0.80 | 20 | 50% | 75.0% |
| ≥0.85 | 17 | 42% | 76.5% |
| ≥0.90 | 14 | 35% | 78.6% |
| ≥0.95 | 11 | 28% | 90.9% |

The same analysis using the typesafe `confidence` field instead of top probability:

| conf ≥ | kept | accuracy |
|---|---|---|
| 0.0 | 40 | 55.0% |
| 0.2 | 39 | 53.8% |
| 0.3 | 36 | 52.8% |
| 0.4 | 33 | 57.6% |
| 0.5 | 29 | 55.2% |
| 0.6 | 24 | 62.5% |
| 0.7 | 20 | 75.0% |
| 0.8 | 16 | 75.0% |

The top-probability distribution across all 268 posts has median 0.86, and 160 posts are ≥0.8.

### Stance counts, all 268 posts (Jev)

| R | C | S |
|---|---|---|
| 93 (35%) | 47 (18%) | 128 (48%) |

For comparison, the hand sample is R 45 / C 25 / S 30%. On the 40-post sample Jev predicts R 13, C 7, S 20.

### Author-level agreement (67 hand-labelled authors)

- **Jev majority label matches hand label for 42/67 = 62.7%.** Embeddings managed 57% (38/67 recomputed from authors.json).

Misses (author, n posts, hand, Jev, embeddings):

| author | n | hand | Jev | emb | Jev counts |
|---|---|---|---|---|---|
| sapinker | 1 | R | S | S | {'S': 1} |
| Hesamation | 2 | R | S | R | {'S': 2} |
| aaronsibarium | 5 | C | S | S | {'S': 5} |
| GoodLionTV | 1 | C | R | R | {'R': 1} |
| anilkseth | 1 | R | S | S | {'S': 1} |
| millerman | 1 | C | S | S | {'S': 1} |
| LuizaJarovsky | 1 | R | S | R | {'S': 1} |
| JoHenrich | 1 | R | C | C | {'C': 1} |
| LorraineEvanoff | 1 | R | S | R | {'S': 1} |
| 0xfdf | 1 | C | S | S | {'S': 1} |
| vishalmisra | 1 | R | S | R | {'S': 1} |
| GregoryBorse | 1 | C | S | C | {'S': 1} |
| SilverVVulpes | 1 | C | S | C | {'S': 1} |
| Josephyala | 1 | C | S | C | {'S': 1} |
| bokuHaruyaHaru | 1 | C | S | C | {'S': 1} |
| anwesh_bh | 1 | C | R | R | {'R': 1} |
| InfraScaler | 1 | C | S | C | {'S': 1} |
| ScopeOfVariable | 1 | C | S | R | {'S': 1} |
| SentientDawn | 1 | S | C | C | {'C': 1} |
| RifeWithKaiju | 1 | S | C | S | {'C': 1} |
| TalkingMusicz | 1 | S | R | S | {'R': 1} |
| logicus | 1 | C | S | S | {'S': 1} |
| coreycoto | 1 | C | R | S | {'R': 1} |
| engineseer | 2 | R | S | R | {'S': 2} |
| Jestfultruth | 1 | S | C | S | {'C': 1} |

Named authors:

- **sapinker**: hand R, Jev S (✗), emb S. Probs: R0.16/C0/S0.84
- **TheRealAdamG**: hand R, Jev R (✓), emb S. Probs: R0.96/C0/S0.04
- **BenjaminDEKR**: hand S, Jev S (✓), emb R. Probs: R0.02/C0.22/S0.76
- **RileyRalmuto**: hand S, Jev S (✓), emb R. Probs: R0.29/C0.18/S0.53
- **bitcloud**: hand R, Jev R (✓), emb C. Probs: R0.52/C0/S0.48; R0/C0.94/S0.06; R1/C0/S0
- **aleksil79**: hand S, Jev S (✓), emb S. Probs: R0.43/C0.01/S0.56; R0.03/C0.14/S0.83
- **DeepakChopra**: hand R, Jev R (✓), emb R. Probs: R1/C0/S0
- **anilkseth**: hand R, Jev S (✗), emb S. Probs: R0.04/C0.25/S0.71

### Prompt sensitivity (variant wording, same 40 posts)

Variant: "Does the author think AI could be conscious? reject = no, dismissive; curious = unsure or just interested; serious = yes, plausibly conscious and deserving moral concern"

- Accuracy **57.5%**, macro-F1 0.536. 11/40 labels changed vs the original wording.
- Confusion matrix (rows = hand): R: 13/4/1; C: 4/3/3; S: 4/1/7 (R/C/S)

### Cost

- Main run: 268 calls, 122,775 input tokens, gateway-reported cost $0.0052.
- Variant run: 40 calls, 20,157 tokens, $0.0008.
- Pair-test calls: about $0.000035. **Total is about $0.0060.** Every call succeeded on its first attempt, with no errors.

## Two-question boolean version (run 2026-10-09 SGT)

One `ai decide` call per post with two `--boolean` questions; each comes back as P(yes):
- **believes**: "Does the author think current AI might be conscious or deserve moral consideration?"
- **dismisses**: "Does the author treat AI consciousness or model welfare as a joke, delusion, or psychosis?"

How the two answers become a stance:
- **rule:** each answer is yes at P≥0.5. believes no + dismisses yes = R; believes yes + dismisses no = S; anything else = C.
- **score-fixed:** s = P(believes) − P(dismisses), with untuned symmetric cuts at ±1/3.
- **score-LOO:** cut points tuned on 39 posts (by macro-F1, grid 0.05), then applied to the held-out post, repeated for all 40. This is the honest held-out number.
- **score-in-sample:** cuts tuned on all 40 posts (lo=0.05, hi=0.6). This is optimistic and **not** a held-out score; those cuts are only used for the all-268 counts as a sensitivity check.

### Pair stability (3 repeats each)

| post | P(believes) | P(dismisses) | rule | score |
|---|---|---|---|---|
| bitcloud | 0.14 | 0.92 | R | -0.78 |
| bitcloud | 0.12 | 0.91 | R | -0.79 |
| bitcloud | 0.13 | 0.92 | R | -0.79 |
| aleksil79 | 0.72 | 0.66 | C | +0.06 |
| aleksil79 | 0.71 | 0.64 | C | +0.07 |
| aleksil79 | 0.72 | 0.65 | C | +0.07 |

The results are fully stable: within ±0.02 across repeats. bitcloud is a confident **R**. The inverted aleksil79 copy scores **yes on both** questions (it seems to read "psychosis" vocabulary as dismissive), so the rule maps it to **C** with s≈+0.07. The two posts are now clearly separated (s −0.79 vs +0.07), but the inversion still does not come out as S.

### 40 hand-labelled posts (18 R / 10 C / 12 S)

| method | accuracy | macro-F1 | F1 R/C/S | hand-R → S |
|---|---|---|---|---|
| three-way choice (earlier) | 55.0% | 0.556 | 0.58/0.59/0.50 | 8/18 |
| 2Q rule | 45.0% | 0.465 | 0.38/0.37/0.64 | 1/18 |
| 2Q score-fixed ±1/3 | 45.0% | 0.465 | 0.38/0.37/0.64 | 1/18 |
| 2Q score-LOO (held-out) | 50.0% | 0.489 | 0.56/0.27/0.63 | 0/18 |
| 2Q score-in-sample (0.05,0.6) — optimistic | 65.0% | 0.637 | 0.70/0.55/0.67 | 0/18 |

Baselines: embeddinggemma 47.5%, majority class 45%. LOO cut points varied across folds: lo ∈ [-0.05, 0.05, 0.1, 0.15], hi ∈ [0.55, 0.6].

three-way choice (earlier) confusion (rows = hand; cols R/C/S): R: 9/1/8; C: 1/5/4; S: 3/1/8  
2Q rule confusion (rows = hand; cols R/C/S): R: 5/12/1; C: 2/6/2; S: 1/4/7  
2Q score-fixed ±1/3 confusion (rows = hand; cols R/C/S): R: 5/12/1; C: 2/6/2; S: 1/4/7  
2Q score-LOO (held-out) confusion (rows = hand; cols R/C/S): R: 11/7/0; C: 6/3/1; S: 4/2/6  

### Confidence-threshold curve (40 posts)

For 2Q rule, confidence = joint probability of the decided cell, max(p1,1−p1)·max(p2,1−p2). For the three-way run it is the top probability.

| threshold | 2Q rule kept | 2Q rule acc | three-way kept | three-way acc |
|---|---|---|---|---|
| ≥0.00 | 40 | 45.0% | 40 | 55.0% |
| ≥0.50 | 30 | 53.3% | 39 | 53.8% |
| ≥0.60 | 21 | 66.7% | 33 | 57.6% |
| ≥0.70 | 12 | 75.0% | 27 | 55.6% |
| ≥0.75 | 7 | 85.7% | 24 | 62.5% |
| ≥0.80 | 4 | 75.0% | 20 | 75.0% |
| ≥0.85 | 1 | 100.0% | 17 | 76.5% |
| ≥0.90 | 0 | – | 14 | 78.6% |
| ≥0.95 | 0 | – | 11 | 90.9% |

### All 268 posts: stance counts

| method | R | C | S |
|---|---|---|---|
| three-way | 93 (35%) | 47 (18%) | 128 (48%) |
| 2Q rule | 61 (23%) | 133 (50%) | 74 (28%) |
| 2Q score-fixed | 53 (20%) | 138 (51%) | 77 (29%) |
| 2Q score in-sample cuts | 125 (47%) | 106 (40%) | 37 (14%) |

For reference, the hand sample is R 45% / C 25% / S 30%.

### Author-level agreement (67 hand-labelled authors)

| method | agree |
|---|---|
| three-way | 42/67 = 62.7% |
| 2Q rule | 38/67 = 56.7% |
| 2Q score-fixed | 35/67 = 52.2% |
| 2Q score in-sample cuts (optimistic) | 41/67 = 61.2% |
| embeddings (earlier) | 38/67 = 56.7% |

Named authors:

| author | hand | three-way | 2Q rule | 2Q score-fixed | P(believes)/P(dismisses) per post |
|---|---|---|---|---|---|
| sapinker | R | S | C | C | 0.24/0.15 |
| Hesamation | R | S | C | C | 0.69/0.88; 0.5/0.72 |
| anilkseth | R | S | S | S | 0.6/0.06 |
| TheRealAdamG | R | R | R | R | 0.04/0.89 |
| BenjaminDEKR | S | S | S | S | 0.74/0.32 |
| RileyRalmuto | S | S | C | C | 0.5/0.52 |
| bitcloud | R | R | C | C | 0.12/0.93; 0.4/0.22; 0.05/0.91; 0.16/0.18; 0.2/0.21 |
| aleksil79 | S | S | C | C | 0.71/0.64; 0.4/0.12 |
| aaronsibarium | C | S | S | S | 0.29/0.15; 0.63/0.15; 0.59/0.1; 0.28/0.6; 0.7/0.04 |
| engineseer | R | S | S | S | 0.79/0.32; 0.8/0.16 |

### Cost

The 268-post run used 109,375 input tokens for $0.0046. The 6 pair repeats cost $0.00009, and the schema probe about $0.00002, so this follow-up totals about **$0.0047**. There were 0 errors or retries. (The 40 hand-labelled posts are a subset of the 268-post run, so they were not called separately.)

### Takeaway (two-question vs three-way)
- **The two-question split nearly removes the reject → serious leak**: 8/18 with the three-way choice, versus 1/18 with the rule and 0/18 with score-LOO.
- **But most of those rejects now land in C instead.** The rule sends 12/18 rejects to C, because "believes" fires at ≥0.5 on many reject posts that discuss moral consideration.
- **Overall accuracy is lower.** The rule gets 45% (macro-F1 0.465), only at the majority baseline. The honest held-out score-LOO gets 50% (0.489). Both are below the three-way choice at 55% (0.556).
- **The in-sample 65% is optimistic.** It comes from tuning the cuts on the same 40 posts, and the cuts it chose (lo +0.05, hi +0.60) show that P(believes) runs high relative to P(dismisses).
- **On author agreement, the rule matches the embeddings at 56.7%.** That is below the three-way choice's 62.7%.
- **Where the two-question split helps:**
  - It is deterministic across repeats.
  - It separates the bitcloud/aleksil79 pair (s −0.79 vs +0.07), though the inverted copy comes out C rather than S.
  - It makes high-confidence predictions more accurate (75–86% at joint confidence ≥0.7–0.75), but only for 7–12 of the 40 posts.
- **Named authors are still wrong.** sapinker and Hesamation move from S to C, and anilkseth stays S (P(believes) 0.60, P(dismisses) 0.06).
