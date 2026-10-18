# Gated stance rule (round 4b)

18 Oct 2026. Tested against the 40 stance hand labels (R 18, C 10, S 12). The site is not changed: it still uses the round-4 Jev labels and confidence-gated rule.

## Question

Every model scored in round 4 gets only 2–3 of the 10 hand-Curious posts right, and Jev 1.14.0 labels 9 of 18 hand-Reject posts Serious. We wanted to know whether splitting the stance question in two fixes either problem:

1. Boolean `position`: "Does the author state a position on whether AI is or could be conscious?" If no, the label is **Curious**.
2. If yes, a binary `direction` choice: reject (AI is not and cannot be conscious, or the idea is dismissed) or serious (AI is or could be conscious, or it deserves moral concern).

Both questions go in one `ai decide` call per post (`questions_r4b.json`), and step 2 is read only when step 1 is yes. We ran liquid/d1-ultra and typesafe-ai/jev-1.14.0, with the gate at P(yes) ≥ 0.5.

## Results (40 posts)

| Rule | Accuracy | Macro-F1 | Curious recall | Reject → Serious |
|---|---|---|---|---|
| d1-ultra, 3-way (round 4) | 62.5% | 0.559 | 2/10 | 5/18 |
| **d1-ultra, gated** | 52.5% | 0.523 | **6/10** | **1/18** |
| Jev 1.14.0, 3-way (round 4) | 52.5% | 0.507 | 3/10 | 9/18 |
| Jev 1.14.0, gated | 47.5% | 0.469 | 6/10 | 2/18 |

Confusion matrices for the gated rule (rows are the hand label, columns the prediction):

| | d1 R | d1 C | d1 S | Jev R | Jev C | Jev S |
|---|---|---|---|---|---|---|
| hand R (18) | 10 | 7 | 1 | 9 | 7 | 2 |
| hand C (10) | 0 | 6 | 4 | 0 | 6 | 4 |
| hand S (12) | 0 | 7 | 5 | 1 | 7 | 4 |

Both models send 20 of the 40 posts to Curious.

## Reading

- **The gated rule is not a clear improvement, so we kept the round-4 rule.** Curious recall reaches 6/10 and Reject → Serious falls to 1, but macro-F1 drops (0.559 → 0.523) and accuracy drops 10 points.
- **The gate filters by confidence; it does not detect curiosity.** P(position) overlaps heavily across the three hand classes. For d1, the hand-Curious medians are about 0.3, and hand-Reject and hand-Serious posts span the full range from 0.0 to 0.99. The gate picks up Curious posts only because it also moves 7 Reject and 7 Serious posts into Curious. The Reject → Serious errors are hidden in Curious rather than corrected.
- **The binary direction step is the useful part.** On posts that pass the gate, d1 gets direction right on 15 of 16 hand-Reject and hand-Serious posts. Asked of all 30 hand-Reject and hand-Serious posts, it gets 22/30 right (6 Reject → Serious) and 19/22 at P ≥ 0.8. Jev gets 19/30 (9 Reject → Serious). So d1's binary direction is no better than its 3-way stance at telling direction. The gain comes only from dropping the hard posts.
- **Moving the gate threshold does not help.**

  | d1 gate threshold | Macro-F1 | Curious recall | Reject → Serious |
  |---|---|---|---|
  | 0.3 | 0.562 | 5 | 3 |
  | 0.6 | 0.547 | 7 | 1 |
  | 0.8 | 0.405 | 8 | 1 |

  The 0.3 result only ties the 3-way rule on F1, and that threshold was picked after seeing the labels.
- **There is no usable confidence threshold.** We combined the gate and direction probabilities into one confidence score. d1 accuracy at confidence ≥ 0.7 is 58.3% (24 posts), at ≥ 0.8 it is 50.0% (20 posts), and at ≥ 0.9 it is 62.5% (8 posts). Accuracy is not monotonic in confidence. Jev is lower again: 54.2% at ≥ 0.7 and 43.8% at ≥ 0.8. The round-4 3-way top probability is still the better confidence signal (d1: 82.4% at ≥ 0.8, 42.5% coverage).

## Caveats

These are 40 hand labels with only 10 Curious, so one post moves curious recall by 10 points and accuracy by 2.5. The differences above are within noise except the drop in Reject → Serious, and that drop comes from abstaining, not from better judgment. The hand labels come from one reader.

## Cost

80 calls. d1-ultra reported $0.000428 and Jev 1.14.0 $0.000875. Per-post outputs are in `gated_stance_r4b.csv`.

## Verification

`test/gated-stance.test.ts` runs as part of `npm run check`. It recomputes every figure above from `gated_stance_r4b.csv` and fails if this write-up does not contain it exactly. The figures it covers:

- both results tables, including the round-4 3-way rows (from the CSV's `three_way` column);
- the confusion matrices;
- the gate-threshold sweep;
- the direction-step counts;
- the confidence-threshold accuracies and post counts;
- the hand-Curious median and the 7 + 7 posts moved to Curious;
- the costs.

One figure comes from round-4 data that is not in this CSV, so the test does not check it: the 3-way top-probability figure (82.4% at ≥ 0.8, 42.5% coverage).
