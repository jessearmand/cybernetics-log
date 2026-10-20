# Rounds 5 and 6

Collected 20 Oct 2026 (SGT). The models are liquid/d1-ultra and perplexity/pplx-decider-v1.2 only. Jev was dropped because it was the least accurate model in round 4.

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

## Cost

Round 5 cost $0.00164 (414 calls) and round 6 cost $0.00045 (138 calls).

## Verification

`test/round5-6.test.ts` runs in `npm run check`. It recomputes every figure in this file from `labels_r5.csv`, `hand_labels_r5.csv`, `labels_r6.csv`, `hand_labels_r6.csv` and `posts_r5.jsonl`, and checks that this file contains each one. It does not check two things:

- the costs, because the raw call logs are not in the repo (they are checked against `discourse.json`, which the build script computes from those logs);
- which `claims_found` hits are misattributions, because that is a hand reading.
- the round 6 judgements in prose: that e_philalethes has a fair case for serious, that pplx-decider-v1.2 is better on direction, and the proposal.
