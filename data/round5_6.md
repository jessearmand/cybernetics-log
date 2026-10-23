# Rounds 5 and 6

Collected 20 Oct 2026 (SGT). The models are liquid/d1-ultra and perplexity/pplx-decider-v1.2. Jev was dropped because it was the least accurate model in round 4. A third model, openai/gpt-6-luna-decisions, was added on 23 Oct 2026 on the same posts; see [Third model](#third-model-openaigpt-6-luna-decisions).

## Round 5

- **Corpus:** 69 posts from 61 authors, none overlapping earlier rounds. 2 of the authors appeared in earlier rounds.
- **Flashpoints:**
  - nature_search 23
  - seth_replies 22
  - anthropic_gwt 16
  - nature_quotes 5
  - seth_quotes 3
- **Questions:** stance, believes, dismisses and on_topic (core), plus policy_politics and frame (framing), are verbatim from round 4. The new `claims_found` boolean (`questions_r5.json`) asks whether a post says Anthropic found Claude to be conscious.
- **Per-post outputs:** `labels_r5.csv`.

| Model | Reject | Curious | Serious |
|---|---|---|---|
| d1-ultra | 26 | 27 | 16 |
| pplx-decider-v1.2 | 33 | 29 | 7 |
| gpt-6-luna-decisions | 21 | 36 | 10 |

GPT-6 Luna answered the core questions on 67 of the 69 posts; see the third-model section.

The two models agree on stance for 52 of 69 posts.

### Hand check on the disagreements

Jesse Armand hand-labelled the 17 posts where the models disagreed (`hand_labels_r5.csv`). He gave 10 of them a stance and skipped 7, because those only describe the research. This is the hard subset, so the scores below are not overall accuracy.

- d1-ultra matched 4 of 10 and pplx-decider-v1.2 matched 3 of 10.
- Both models missed both rejects, elephant_ben and dave_uncensored. Both posts are substrate-grounded rejects that sound open in principle. d1-ultra called both serious; pplx-decider-v1.2 called both curious.
- d1-ultra called 4 of the 7 skipped posts serious.

### claims_found

The two models flagged 5 posts between them at P ≥ 0.5: d1-ultra flagged 4 and pplx-decider-v1.2 flagged 5. Read by hand:

- **2 clear misattributions:** theaigrandpa and JkwuRmsl say Anthropic found signs of consciousness in Claude.
- **3 roughly match the paper's own claim:** AbnormalAIX, NewsTongueX and dogquie describe the workspace in terms close to the paper's conscious-access claim.

## Round 6

Round 6 asks the stance question again on the same 69 posts with a fourth option, `reporting` (`questions_r6.json`). Per-post outputs are in `labels_r6.csv`. Skipped hand labels count as reporting.

| Model | Reject | Curious | Serious | Reporting |
|---|---|---|---|---|
| d1-ultra | 20 | 10 | 11 | 28 |
| pplx-decider-v1.2 | 19 | 11 | 7 | 32 |
| gpt-6-luna-decisions | 21 | 14 | 9 | 25 |

- pplx-decider-v1.2 labelled 7 of the 7 skipped posts reporting, and d1-ultra labelled 6 of 7.
- On all 17 hand-labelled posts, pplx-decider-v1.2 matched 10 and d1-ultra matched 9.
- On the 10 posts with a stance, both matched 3 of 10. d1-ultra had matched 4 with three options.
- The rejects are still missed: both models call both rejects serious.
- Reporting is a large bucket: 28 of 69 posts for d1-ultra and 32 for pplx-decider-v1.2. d1-ultra's curious count fell from 27 to 10.
- Two enthusiastic research summaries that Jesse labelled curious, Sniffmeta and stretchcloud, went to reporting with both models.

### Hand check on the new disagreements

Round 6 left 9 new disagreements, on posts that round 5 had not hand-labelled. Jesse Armand labelled them too (`hand_labels_r6.csv`): 6 with a label and 3 skipped. Like round 5, this is the hard subset and the sample is small.

On the 6 posts he did not skip, pplx-decider-v1.2 matched 4 and d1-ultra matched 0. pplx-decider-v1.2 called RichUniverse_ reporting and e_philalethes reject, both of which Jesse labelled curious. d1-ultra called both reporting posts reject, with confidence 0.85 and 0.82, and called the curious posts reject or serious. Of the 3 skipped posts, pplx-decider-v1.2 called 2 reporting and d1-ultra called 1. pplx-decider-v1.2 used reporting for 5 of the 9 posts, and only 1 of those was a curious post pulled into reporting.

e_philalethes counts as a miss for d1-ultra in the strict score. Jesse labelled it curious but noted that it leans serious, because it considers the possibility with the right hardware, so d1-ultra's serious has a fair case.

Across all 26 hand labels from rounds 5 and 6, scored four-way with skips counted as reporting, pplx-decider-v1.2 matched 16 and d1-ultra matched 10. On the 16 posts he did not skip, pplx-decider-v1.2 matched 7 and d1-ultra matched 3.

On these new posts pplx-decider-v1.2 is clearly better on direction, while d1-ultra still confuses how strongly a post is worded with which way it leans. The proposal, from Seeker and agreed by Jesse, is to use pplx-decider-v1.2 as the primary labeller, with d1-ultra as a second opinion only on serious. Nine posts is a small sample.

## Third model: openai/gpt-6-luna-decisions

Run on 23 Oct 2026 (SGT) on exactly the same 69 posts (`posts_r5.jsonl`), with the same question groups and arguments: core, framing and attribution from `questions_r5.json`, and stance4 from `questions_r6.json`. Its columns are `oa_*` in `labels_r5.csv` and `labels_r6.csv`. Its probabilities come back rounded to two decimals. `oa_conf` is the top probability, as for the other two models, and `oa_openai_conf` is the confidence OpenAI reports alongside it.

- **Coverage:** 274 of 276 calls answered. The core group failed on every retry for 2 posts, TokenandoAI and SeanYoung1995 (gateway error), so its round-5 stance and on_topic cover 67 posts. Its framing, attribution and round-6 answers cover all 69.
- **Cost and latency:** gateway cost $0 (bring-your-own-key: OpenAI bills the key directly), $0.010761 at list price; 129.3 s of calls in total, median 0.447 s.

**The hand-label scores below are not comparable with the other two models.** All 26 hand labels were drawn from posts where d1-ultra and pplx-decider-v1.2 disagreed, so on each of them at least one of those two is wrong by construction, while gpt-6-luna-decisions played no part in the selection.

- Round 5, on the 10 posts with a hand stance: gpt-6-luna-decisions matched 6 (d1-ultra 4, pplx-decider-v1.2 3). It called the two substrate rejects curious and serious.
- Round 6, on the 17 round-5 hand labels: it matched 10 and called 5 of the 7 skipped posts reporting. On the 9 new round-6 hand labels it matched 1 of 6 and called 1 of the 3 skips reporting.
- Combined, on all 26 hand labels scored four-way with skips as reporting: gpt-6-luna-decisions 12/26, pplx-decider-v1.2 16/26, d1-ultra 10/26. On the 16 he did not skip: 6/16, 7/16 and 3/16.
- Reporting: it found 6 of the 12 reporting posts and called 5 of them reject.

Four-way confusion on the 26 hand labels, gpt-6-luna-decisions:

| hand \ model | reject | curious | serious | reporting |
|---|---|---|---|---|
| reject | 0 | 1 | 1 | 0 |
| curious | 2 | 6 | 3 | 1 |
| reporting | 5 | 1 | 0 | 6 |

### Agreement on all 69 posts

Each cell gives posts with the same answer out of posts both models answered, with Cohen's kappa in brackets. Yes/no questions are read at P ≥ 0.5. The kappa of 0 on policy_politics for d1-ultra comes from it answering no on every post.

| Question | d1-ultra / pplx-decider-v1.2 | d1-ultra / gpt-6-luna-decisions | pplx-decider-v1.2 / gpt-6-luna-decisions |
|---|---|---|---|
| stance | 52/69 (0.61) | 51/67 (0.628) | 48/67 (0.538) |
| frame | 62/69 (0.519) | 65/69 (0.576) | 60/69 (0.389) |
| on_topic | 62/69 (0.711) | 61/67 (0.764) | 60/67 (0.694) |
| policy_politics | 67/69 (0.0) | 65/69 (0.0) | 67/69 (0.653) |
| claims_found | 68/69 (0.881) | 68/69 (0.881) | 69/69 (1.0) |
| stance (round 6) | 56/69 (0.728) | 56/69 (0.736) | 54/69 (0.691) |

### Candidates for hand labelling

There are 6 posts without a hand label where gpt-6-luna-decisions disagrees on stance with both other models, which agree with each other. They are listed in `hand_label_candidates_r5_6.csv`. Jesse has since hand-labelled them; see the next section.

- NaveenKumar__T (2112372961386840163): round 5: d1-ultra and pplx-decider-v1.2 reject, gpt-6-luna-decisions serious
- HOTSPOTSREPORTS (2112355641947742624): round 5: d1-ultra and pplx-decider-v1.2 curious, gpt-6-luna-decisions reject
- lord_tgoodwin (2112248014504919077): round 5: d1-ultra and pplx-decider-v1.2 reject, gpt-6-luna-decisions curious; round 6: d1-ultra and pplx-decider-v1.2 reject, gpt-6-luna-decisions curious
- NAtanason (2112342179893092384): round 5: d1-ultra and pplx-decider-v1.2 reject, gpt-6-luna-decisions curious
- mCasual1 (2112334316789260563): round 5: d1-ultra and pplx-decider-v1.2 reject, gpt-6-luna-decisions curious
- therealkingson (2112366441915908402): round 6: d1-ultra and pplx-decider-v1.2 curious, gpt-6-luna-decisions serious

### Hand check on the candidates (biased against gpt-6-luna-decisions)

Jesse Armand labelled the 6 candidates (`hand_labels_r5_6_openai.csv`). **This set is biased against gpt-6-luna-decisions**: it was picked because that model disagreed with both others, just as the first 26 labels were picked where d1-ultra and pplx-decider-v1.2 disagreed. Each model cell gives the round 5 three-way answer, then the round 6 four-way answer.

| n | Post | Hand | d1-ultra | pplx-decider-v1.2 | gpt-6-luna-decisions |
|---|---|---|---|---|---|
| 1 | NaveenKumar__T | reject | reject → reject | reject → reject | serious → reject |
| 2 | HOTSPOTSREPORTS | reporting | curious → reporting | curious → reporting | reject → reporting |
| 3 | lord_tgoodwin | reject | reject → reject | reject → reject | curious → curious |
| 4 | NAtanason | reject | reject → reject | reject → reject | curious → reject |
| 5 | mCasual1 | skip | reject → reject | reject → reject | curious → reject |
| 6 | therealkingson | curious | curious → curious | curious → curious | curious → serious |

Jesse's note, verbatim:

- mCasual1 (2112334316789260563): Doesn’t engage in any side, irrelevant comment 

- **Round 6 (four-way), on the 5 he did not skip:** d1-ultra 5/5, pplx-decider-v1.2 5/5, gpt-6-luna-decisions 3/5. With the skip counted as reporting, it is 5/6, 5/6 and 3/6.
- **Round 5 (three-way), on the 4 labelled reject or curious:** d1-ultra 4/4, pplx-decider-v1.2 4/4, gpt-6-luna-decisions 1/4. HOTSPOTSREPORTS (reporting) and mCasual1 (skip) have no matching three-way option, so they are left out of the round 5 count.
- **Cross-round instability:** gpt-6-luna-decisions changed its stance between the round 5 and round 6 runs on 4 of the 6 posts: NaveenKumar__T (serious → reject), NAtanason (curious → reject), mCasual1 (curious → reject), therealkingson (curious → serious). d1-ultra changed on 0 and pplx-decider-v1.2 on 0, not counting moves to the new reporting option.

### All 32 hand labels combined

On all 32 hand labels (26 + 6), scored four-way with skips counted as reporting: pplx-decider-v1.2 21/32, d1-ultra 15/32, gpt-6-luna-decisions 15/32. On the 21 he did not skip: pplx-decider-v1.2 12/21, gpt-6-luna-decisions 9/21, d1-ultra 8/21.

**Neither subset is a random sample.** The first 26 were picked where d1-ultra and pplx-decider-v1.2 disagreed, and these 6 where gpt-6-luna-decisions disagreed with both of them. The combined count adds two differently biased sets, so it is not an accuracy figure for any model.

## Cost

Round 5 cost $0.00164 (414 calls) and round 6 cost $0.00045 (138 calls).

## Verification

`test/round5-6.test.ts` runs in `npm run check`. It recomputes every figure in this file from `labels_r5.csv`, `hand_labels_r5.csv`, `labels_r6.csv`, `hand_labels_r6.csv`, `hand_labels_r5_6_openai.csv` and `posts_r5.jsonl`, except the third model's cost and latency, which come from its raw call logs (checked against `discourse.json`), and checks that this file contains each one. It does not check two things:

- the costs, because the raw call logs are not in the repo (they are checked against `discourse.json`, which the build script computes from those logs);
- which `claims_found` hits are misattributions, because that is a hand reading.
- the round 6 judgements in prose: that e_philalethes has a fair case for serious, that pplx-decider-v1.2 is better on direction, and the proposal.
