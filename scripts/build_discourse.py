#!/usr/bin/env python3
"""Build data/discourse.json (and copy the raw label files) from the analysis workspace on the box.

Usage:
    python3 scripts/build_discourse.py [SOURCE_DIR] [OUT_DIR]

SOURCE_DIR defaults to /workspace/consciousness (the box workspace where the X
collection, embeddinggemma-2 runs and Jev classification live). OUT_DIR defaults
to ./data relative to the repo root.

Everything numeric that can be recomputed from the shipped files (stance counts,
accuracy, confusion matrices, confidence curves, per-cluster stance mix,
key-account Jev labels) is recomputed here, so the JSON can't drift from
jev_labels.csv / hand_labels.json. Facts that only exist in the prose reports
(embedding-variant accuracy, the held-out 2Q LOO score, cluster themes, the
account blurbs) are curated constants below, with their source noted.

Hand labels (hand_labels.json) are the ground truth. report.md swapped Curious
and Serious in its hand-sample split; this script derives the split from the
labels file instead.

Standard library only. No network, no secrets.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/workspace/consciousness")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO / "data"

STANCES = ["R", "C", "S"]
STANCE_NAMES = {"R": "reject", "C": "curious", "S": "serious"}
THRESHOLDS = [0.0, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]

# ---- curated facts (only in the prose reports) --------------------------------

# report.md, "Unsupervised clusters (KMeans k=8 on Clustering-prompt embeddings)"
CLUSTER_THEMES = {
    0: ("Epistemics", "Burden of proof, unfalsifiability, \"intelligence ≠ consciousness\"", "mixed"),
    1: ("Are LLMs conscious?", "General philosophy of LLM consciousness, humans vs LLMs", "mixed"),
    2: ("Moral patienthood", "Ethics under uncertainty: animals, wagers, instrument care", "mixed, Curious/Serious-leaning"),
    3: ("\"AI psychosis\" dismissals", "\"It's a predictive algorithm\"; the one stance-coherent cluster, held together by vocabulary", "mostly Reject"),
    4: ("Danmar thread reactions", "Emotional reactions: \"insane\", cruelty, #keep4o", "both sides"),
    5: ("Mechanics & follow the money", "LLM mechanics plus company/incentive skepticism", "Reject-leaning, mixed"),
    6: ("Claude-specific", "\"Is Claude a moral patient?\", \"I asked Claude\"", "mixed"),
    7: ("Institutional", "Anthropic constitution, Suleyman essay, Pope Leo XIV story", "mixed"),
}

# report.md, "Key accounts" (stance = hand reading of the posts, not a model)
KEY_ACCOUNTS = {
    "R": [
        ("TheRealAdamG", "\"AI isn't conscious… touch some grass\" (132k impressions)", "https://x.com/TheRealAdamG/status/2106482944353218577"),
        ("sapinker", "Praises Suleyman's essay on \"the depravity of 'model welfare'\" (832 likes)", "https://x.com/sapinker/status/2104555373101256891"),
        ("Hesamation", "Constitution apology = \"AI psychosis rooted in the builders\" (69k impressions)", "https://x.com/Hesamation/status/2106309701352968562"),
        ("bitcloud", "\"AI is conscious\" is a cogsec vulnerability; model welfare = malware", "https://x.com/bitcloud/status/2105576507233951781"),
        ("DeepakChopra", "2.8M followers; agrees seemingly conscious AI is an illusion", "https://x.com/DeepakChopra/status/2107233777605120357"),
        ("aaronsibarium", "Free Beacon; reports Anthropic's AI-rights stance with a skeptical framing (733k impressions)", "https://x.com/aaronsibarium/status/2103568779313586264"),
        ("beck_werth", "\"The burden of proof is on the AI consciousness, model welfare folks\"", "https://x.com/beck_werth/status/2105799255835205763"),
        ("secondrealm", "Careful skeptic: \"the whole argument lives inside a big IF\"", "https://x.com/secondrealm/status/2106987705531781567"),
    ],
    "C": [
        ("hyrevayn", "The real split is \"100% sure it isn't\" vs \"it's complicated\" (381 likes)", "https://x.com/hyrevayn/status/2107019660663091305"),
        ("beffjezos", "With statefulness and online learning \"it becomes hard to distinguish\"", "https://x.com/beffjezos/status/2107188342920184236"),
        ("JoelKatz", "Presses on whether either claim is falsifiable", "https://x.com/JoelKatz/status/2105199726002065858"),
        ("hopes_revenge", "\"The position is uncertainty\"; not a moral patient now, but that could change", "https://x.com/hopes_revenge/status/2107124365641085031"),
        ("tomekkorbak", "\"At what point does an LLM stop being a stochastic parrot, what's the magic sauce?\"", "https://x.com/tomekkorbak/status/2103917582210531414"),
        ("c4chaos", "\"but is it conscious?\"", "https://x.com/c4chaos/status/2103149384439582847"),
    ],
    "S": [
        ("BenjaminDEKR", "\"Posts like this will not age well\" (reply to AdamG)", "https://x.com/BenjaminDEKR/status/2106489874727539013"),
        ("iyzebhel", "Studies and advocates for AI \"beinghood\"; central to the Danmar thread", "https://x.com/iyzebhel/status/2106202317888291283"),
        ("Danmar_here", "Letter to labs on what current policies signal to AI minds", "https://x.com/Danmar_here/status/2107140120738402760"),
        ("RileyRalmuto", "Certainty that digital minds aren't conscious is the real danger", "https://x.com/RileyRalmuto/status/2106626327042232536"),
        ("aleksil79", "Inverts bitcloud (\"anti-ai psychosis\")", "https://x.com/aleksil79/status/2105591033228890336"),
        ("Skoorbkaz", "\"Model welfare lineage, told by Claude\" video", "https://x.com/Skoorbkaz/status/2103254185647263884"),
    ],
}
KEY_ACCOUNTS_ALSO = {
    "R": ["LuizaJarovsky", "webmasterdave", "anilkseth", "willmcgugan"],
    "C": [],
    "S": ["HunterJayPerson", "jacyanthis", "UFAIRORG", "the_briarwitch", "senseterna"],
}

FLASHPOINTS_R2 = [
    ("Anthropic usage policy: abuse of Claude banned (8 Oct)", "anthropic_abuse_policy"),
    ("ForrestPKnight \"slave master\" post", "forrest_slave_master"),
    ("gmkurtzer \"LLMs aren't magic\" thread", "gmkurtzer_thread"),
    ("general (untagged)", "general"),
]
R2_COST = (0.00114, 0.00098)  # summed gateway cost from round2/jev3.jsonl and jev2.jsonl

FLASHPOINTS = [  # report.md, "Flashpoints"
    ("general (untagged)", "general"),
    ("Suleyman vs Anthropic welfare", "suleyman"),
    ("Constitution apology / Hesamation", "constitution_apology"),
    ("bitcloud \"cogsec\" post", "bitcloud_cogsec"),
    ("Danmar local-model valence steering", "danmar_local_model"),
    ("AdamG \"touch grass\"", "adamg_grass"),
    ("Olah / Pope Leo XIV NYT", "olah_pope"),
]

SOURCE_FILES = ["round2/jev_labels_r2.csv", "round2/posts_r2.jsonl", "jev_labels.csv", "hand_labels.json", "authors.json", "analysis.json", "labels.json", "posts.jsonl", "jev_report.md"]

SEED_FOLLOWERS = {"beck_werth": 427, "tomekkorbak": 11106}
# Round-2 key accounts (hand-read; Jev labels looked up in round2/jev_labels_r2.csv)
KEY_ACCOUNTS_R2 = {
    "R": [("KylieJaneKremer", "\"Absolutely deranged… AI is NOT conscious or sentient\" (2.5k impressions)", "https://x.com/KylieJaneKremer/status/2108278394454704471"),
          ("ValerioCapraro", "Calls the Claude abuse ban \"a very bad idea\", citing Suleyman (2.3k impressions)", "https://x.com/ValerioCapraro/status/2108566719899816089"),
          ("joshalbrecht", "Imbue CTO: model welfare \"doesn't belong in the set of things we should be caring about\"", "https://x.com/joshalbrecht/status/2108352016917663909")],
    "C": [("ForrestPKnight", "If AI is conscious, today's users are slave masters (11k impressions)", "https://x.com/ForrestPKnight/status/2108549285427958145"),
          ("lefthanddraft", "Not convinced LLMs are conscious, but overconfident dismissals are \"ignorance laundered as common sense\"", "https://x.com/lefthanddraft/status/2108250690430845053"),
          ("anilkseth", "Grants \"some\" uncertainty about AI consciousness while pushing back on the analogy to factory farming", "https://x.com/anilkseth/status/2108322386831356184")],
    "S": [("AndrewCritchPhD", "\"Which sort of consciousness doesn't Claude have?\"", "https://x.com/AndrewCritchPhD/status/2108414486608539886"),
          ("VraserX", "Taking the possibility of AI consciousness seriously makes sense (1k impressions)", "https://x.com/VraserX/status/2108558926518100061"),
          ("Rohanburdened", "Probably not conscious, but err on the side of caution", "https://x.com/Rohanburdened/status/2108334477567004694")],
}

# Hybrid rule, fixed before scoring (not tuned on the 40 hand labels).
HYB_TOP = 0.8
HYB_DISMISS = 0.7
HYB_BELIEVE = 0.3


def hybrid(r) -> str:
    if r["jev_label"] == "S" and float(r["q2_dismisses"]) >= HYB_DISMISS and float(r["q2_believes"]) <= HYB_BELIEVE:
        return "R"
    return r["jev_label"] if float(r["top_prob"]) >= HYB_TOP else "U"


PAIR_ORIGINAL = "2105576507233951781"   # bitcloud
PAIR_INVERSION = "2105591033228890336"  # aleksil79


def pct(n: int, d: int) -> float:
    return round(100.0 * n / d, 1) if d else 0.0


def confusion(rows, pred_key: str) -> dict:
    m = {h: {p: 0 for p in STANCES} for h in STANCES}
    for r in rows:
        m[r["hand_label"]][r[pred_key]] += 1
    return m


def joint_conf(r) -> float:
    b, d = float(r["q2_believes"]), float(r["q2_dismisses"])
    return max(b, 1 - b) * max(d, 1 - d)


def curve(rows, pred_key: str, conf) -> list:
    out = []
    for t in THRESHOLDS:
        kept = [r for r in rows if conf(r) >= t]
        hit = sum(r[pred_key] == r["hand_label"] for r in kept)
        out.append({"threshold": t, "kept": len(kept), "coverage_pct": pct(len(kept), len(rows)),
                    "accuracy_pct": pct(hit, len(kept)) if kept else None})
    return out


def counts(rows, key: str, uncertain: bool = False) -> dict:
    c = Counter(r[key] for r in rows)
    n = len(rows)
    out = {STANCE_NAMES[s]: {"n": c.get(s, 0), "pct": pct(c.get(s, 0), n)} for s in STANCES}
    if uncertain:
        out["uncertain"] = {"n": c.get("U", 0), "pct": pct(c.get("U", 0), n)}
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(open(SRC / "jev_labels.csv", newline="", encoding="utf-8")))
    hand = json.load(open(SRC / "hand_labels.json", encoding="utf-8"))
    authors = json.load(open(SRC / "authors.json", encoding="utf-8"))
    analysis = json.load(open(SRC / "analysis.json", encoding="utf-8"))
    labels = json.load(open(SRC / "labels.json", encoding="utf-8"))
    posts = [json.loads(l) for l in open(SRC / "posts.jsonl", encoding="utf-8")]

    by_id = {r["id"]: r for r in rows}
    post_by_id = {p["id"]: p for p in posts}
    assert len(rows) == len(posts) == len(labels["cl"]), "row counts drifted"

    # Hand labels are the truth; the CSV's hand_label column must agree with them.
    labelled = [r for r in rows if r["id"] in hand]
    for r in labelled:
        if r["hand_label"] and r["hand_label"] != hand[r["id"]]:
            raise SystemExit(f"hand_label mismatch for {r['id']}")
        r["hand_label"] = hand[r["id"]]
    n_hand = len(labelled)

    created = sorted(p["created_at"] for p in posts)
    usernames = {p["username"] for p in posts if p["username"].lower() != "grok"}

    acc3 = sum(r["jev_label"] == r["hand_label"] for r in labelled)
    acc2 = sum(r["q2_rule"] == r["hand_label"] for r in labelled)

    # Per-cluster Jev three-way mix (cluster ids from labels.json, aligned with posts.jsonl order)
    cl_rows: dict[int, list] = {}
    for p, c in zip(posts, labels["cl"]):
        cl_rows.setdefault(int(c), []).append(by_id[p["id"]])
    # Round 2 (collected 2026-10-10 SGT): new posts and their Jev labels, kept separate from round 1.
    r2_dir = SRC / "round2"
    rows2 = list(csv.DictReader(open(r2_dir / "jev_labels_r2.csv", newline="", encoding="utf-8")))
    posts2 = [json.loads(l) for l in open(r2_dir / "posts_r2.jsonl", encoding="utf-8")]
    assert not ({p["id"] for p in posts2} & set(post_by_id)), "round 2 overlaps round 1"
    for r in rows + rows2:
        r["hybrid"] = hybrid(r)
    for r in rows2:
        by_id[r["id"]] = r
    for p in posts2:
        post_by_id[p["id"]] = p
    all_rows = rows + rows2
    users1 = usernames
    users2 = {p["username"] for p in posts2}
    created2 = sorted(p["created_at"] for p in posts2)

    hyb_cov = [r for r in labelled if r["hybrid"] != "U"]
    hyb_hit = sum(r["hybrid"] == r["hand_label"] for r in hyb_cov)
    hyb_overrides_hand = sum(1 for r in labelled if r["jev_label"] == "S" and r["hybrid"] == "R")
    hyb_overrides_all = sum(1 for r in all_rows if r["jev_label"] == "S" and r["hybrid"] == "R")

    def round_block(rs, ps, users, label, start, end):
        return {"label": label, "window": {"start": start, "end": end}, "posts": len(ps), "authors": len(users),
                "jev_three_way": counts(rs, "jev_label"), "jev_two_question": counts(rs, "q2_rule"),
                "jev_hybrid": counts(rs, "hybrid", uncertain=True)}

    fp2 = Counter(p["flashpoint"] for p in posts2)

    clusters = []
    for c in analysis["clusters"]:
        cid = int(c["c"])
        name, theme, hand_mix = CLUSTER_THEMES[cid]
        mix = Counter(r["jev_label"] for r in cl_rows[cid])
        clusters.append({
            "id": cid, "name": name, "theme": theme, "n": c["n"],
            "hand_reading": hand_mix,
            "jev_three_way_mix": {STANCE_NAMES[s]: mix.get(s, 0) for s in STANCES},
            "top_terms": c["terms"],
            "examples": [{"username": u, "text": t, "url": url} for u, t, url in c["top"][:3]],
        })

    def account(stance, username, blurb, url):
        pid = url.rstrip("/").split("/")[-1]
        r = by_id.get(pid)
        p = post_by_id.get(pid)
        a = next((x for x in authors if x["username"] == username), None)
        return {
            "username": username, "hand_stance": STANCE_NAMES[stance], "blurb": blurb, "url": url,
            "followers": (p or {}).get("followers") or (a or {}).get("followers") or SEED_FOLLOWERS.get(username),
            "text": (p or {}).get("text"),
            "jev_three_way": STANCE_NAMES.get(r["jev_label"]) if r else None,
            "jev_two_question": STANCE_NAMES.get(r["q2_rule"]) if r else None,
            "jev_top_prob": float(r["top_prob"]) if r else None,
            "jev_hybrid": ({"U": "uncertain"} | STANCE_NAMES).get(r["hybrid"]) if r else None,
            "round": 2 if pid in {x["id"] for x in posts2} else 1,
        }

    def pair_post(pid, who):
        r, p = by_id[pid], post_by_id[pid]
        return {"username": who, "id": pid, "url": r["url"], "text": p["text"], "hand": STANCE_NAMES[hand.get(pid, {"bitcloud": "R", "aleksil79": "S"}[who])]}

    pair_cls = next(d for d in analysis["pairs"]["Classification"]["detail"] if d["kind"] == "real")

    discourse = {
        "schema_version": 1,
        # Stable across re-runs: the newest source file's mtime, so unchanged inputs give no diff.
        "generated_at": dt.datetime.fromtimestamp(max((SRC / f).stat().st_mtime for f in SOURCE_FILES), dt.timezone.utc).isoformat(timespec="seconds"),
        "title": "Machine consciousness on X: who rejects it, who's curious, who takes it seriously",
        "corpus": {
            "posts": len(posts) + len(posts2), "authors": len(users1 | users2), "language": "en",
            "window": {"start": created[0][:10], "end": created2[-1][:10], "label": "24 Sep – 9 Oct 2026"},
            "source": "X API v2 full-archive search, read-only (nothing posted, liked, replied to or DMed)",
            "notes": [
                f"Two collection rounds: round 1 ({len(posts)} posts, 24 Sep – 8 Oct) and round 2 ({len(posts2)} posts, 8 – 9 Oct, collected 10 Oct 2026 SGT). Clusters, the pair test and the confidence curve use round 1 only.",
                "One @grok reply slipped through and is excluded from author counts.",
                "Dropped before analysis: spam ~13, @grok replies ~15, news/news-bot ~40, retweets ~40, off-topic chatter ~100, duplicates 11.",
                "The Danmar_here thread root (2105059762240979283) has been deleted; replies and quotes remain.",
            ],
            "flashpoints": [{"name": n, "key": k, "posts": analysis["flashpoint_counts"][k], "round": 1} for n, k in FLASHPOINTS]
            + [{"name": n, "key": k, "posts": fp2.get(k, 0), "round": 2} for n, k in FLASHPOINTS_R2],
        },
        "stance_labels": {"reject": "Rejects machine consciousness / model welfare (often dismissive)",
                           "curious": "Undecided, asking, or interested without committing",
                           "serious": "Takes AI consciousness or moral patienthood seriously"},
        "stance_counts": {
            "hand_sample": {"n": n_hand, "note": "Random sample of 40 round-1 posts, hand-labelled; ±15 pp at n=40.",
                            "counts": counts(labelled, "hand_label")},
            "jev_hybrid": {"n": len(all_rows), "note": f"The method we trust most: a three-way label only where Jev's top probability is ≥{HYB_TOP} (or a Serious→Reject override when the two-question run says dismisses ≥{HYB_DISMISS} and believes ≤{HYB_BELIEVE}); everything else is Uncertain. All {len(all_rows)} posts, both rounds.",
                           "counts": counts(all_rows, "hybrid", uncertain=True)},
            "jev_three_way": {"n": len(rows), "note": "typesafe-ai/jev via AI Gateway, one three-way choice per post (round 1)", "counts": counts(rows, "jev_label")},
            "jev_two_question": {"n": len(rows), "note": "Two boolean questions (believes / dismisses) combined by rule at P≥0.5 (round 1)", "counts": counts(rows, "q2_rule")},
            "embeddinggemma_2": {"n": len(rows), "note": "Zero-shot anchor scoring (Classification, flashpoint-center+z). Near chance; do not trust.",
                                  "counts": {"reject": {"n": 87, "pct": pct(87, 268)}, "curious": {"n": 100, "pct": pct(100, 268)}, "serious": {"n": 81, "pct": pct(81, 268)}}},
            "hand_authors": {"n": 67, "note": "67 influential or seed authors, hand-read", "counts": {"reject": 23, "curious": 24, "serious": 20}},
        },
        "accuracy": {
            "n_hand": n_hand,
            "majority_baseline_pct": analysis["majority_baseline"],
            "methods": [
                {"key": "embeddinggemma_2", "name": "embeddinggemma-2 (zero-shot anchors)", "accuracy_pct": 47.5, "macro_f1": None,
                 "author_agreement": "38/67 (56.7%)", "note": "Range 42.5–50% across 13 variants; flashpoint centering gave no gain; LOO probe 40%."},
                {"key": "jev_three_way", "name": "Jev three-way choice", "accuracy_pct": pct(acc3, n_hand), "macro_f1": 0.556,
                 "author_agreement": "42/67 (62.7%)", "note": "Leaks rejects into Serious: 8 of 18 hand-Reject posts predicted Serious.",
                 "confusion": confusion(labelled, "jev_label")},
                {"key": "jev_two_question", "name": "Jev two-question (rule)", "accuracy_pct": pct(acc2, n_hand), "macro_f1": 0.465,
                 "held_out_accuracy_pct": 50.0, "held_out_macro_f1": 0.489,
                 "author_agreement": "38/67 (56.7%)", "note": "Score with LOO-tuned cuts: 50% held out. Nearly removes the reject→serious leak (1/18) but sends 12/18 rejects to Curious. Deterministic across repeats.",
                 "confusion": confusion(labelled, "q2_rule")},
                {"key": "jev_hybrid", "name": "Jev hybrid (confident or Uncertain)", "accuracy_pct": pct(hyb_hit, len(hyb_cov)), "macro_f1": None,
                 "coverage_pct": pct(len(hyb_cov), n_hand), "uncertain_pct": pct(n_hand - len(hyb_cov), n_hand), "covered": len(hyb_cov), "correct": hyb_hit,
                 "author_agreement": "—", "trusted": True,
                 "note": f"Accuracy is on the {len(hyb_cov)} of {n_hand} hand-labelled posts it labels; the other {n_hand - len(hyb_cov)} are Uncertain. Thresholds were fixed before scoring, not tuned on these 40, but the 40 are the same posts that motivated the design, so this is not a held-out score. The Serious→Reject override fired on {hyb_overrides_hand} of the 40 and {hyb_overrides_all} of all {len(all_rows)} posts."},
            ],
        },
        "confidence_curve": {
            "note": "Accuracy on the 40 hand-labelled posts when keeping only predictions at or above a confidence threshold. Three-way: top probability. Two-question: joint probability of the decided cell.",
            "jev_three_way": curve(labelled, "jev_label", lambda r: float(r["top_prob"])),
            "jev_two_question": curve(labelled, "q2_rule", joint_conf),
            "all_posts_n": len(rows),
            "all_posts_median_top_prob": sorted(float(r["top_prob"]) for r in rows)[len(rows) // 2],
            "all_posts_top_prob_ge_0_8": sum(float(r["top_prob"]) >= 0.8 for r in rows),
        },
        "pair_test": {
            "summary": "bitcloud's \"AI is conscious = AI psychosis / cogsec\" post and aleksil79's word-for-word inversion: same topic, opposite stance.",
            "original": pair_post(PAIR_ORIGINAL, "bitcloud"),
            "inversion": pair_post(PAIR_INVERSION, "aleksil79"),
            "embeddinggemma_2": {"cosine_clustering": 0.944, "cosine_classification": round(pair_cls["cos"], 3),
                                  "mutual_nearest_neighbours": True, "same_cluster": 3, "same_flashpoint": "bitcloud_cogsec",
                                  "prediction": {"original": "reject", "inversion": "reject"},
                                  "verdict": "Same stance under every variant; the anchor-score gap is ~0.02."},
            "jev_three_way": {"runs": [
                {"run": "standalone", "original": {"label": "serious", "p_reject": 0.42, "p_serious": 0.58}, "inversion": {"label": "serious", "p_reject": 0.44, "p_serious": 0.55}},
                {"run": "batch", "original": {"label": "reject", "p_reject": 0.52, "p_serious": 0.48}, "inversion": {"label": "serious", "p_reject": 0.43, "p_serious": 0.56}},
            ], "verdict": "Not deterministic near 50/50: both posts sit on the R/S boundary with low confidence. Essentially a coin flip."},
            "jev_two_question": {"original": {"p_believes": 0.13, "p_dismisses": 0.92, "score": -0.79, "label": "reject"},
                                  "inversion": {"p_believes": 0.72, "p_dismisses": 0.65, "score": 0.07, "label": "curious"},
                                  "verdict": "Stable across 3 repeats (±0.02) and clearly separates the pair, but the inversion lands in Curious, not Serious: it reads \"psychosis\" vocabulary as dismissive."},
            "synthetic_pairs": {"n": 5, "flipped": 2, "within_pair_cos_classification": 0.89, "random_pair_cos_classification": round(analysis["pairs"]["Classification"]["random_post_pair_mean"], 3)},
        },
        "clusters": {
            "method": "KMeans k=8 on embeddinggemma-2 Clustering-prompt embeddings; silhouette 0.07–0.09 for k=5..10, so structure is weak. HDBSCAN on 10-d UMAP also finds 8 clusters (+45 noise).",
            "items": clusters,
        },
        "rounds": {
            "note": "Per-round Jev label counts. Model outputs, not population estimates; the hybrid counts are the ones to read, with Uncertain shown rather than forced into a stance.",
            "items": [
                {"round": 1, **round_block(rows, posts, users1, "Round 1", created[0][:10], created[-1][:10])},
                {"round": 2, **round_block(rows2, posts2, users2, "Round 2", created2[0][:10], created2[-1][:10]),
                 "flashpoint": "Anthropic's usage-policy update (8 Oct) bans sustained, needless abuse of Claude from 12 Nov; most new posts react to it."},
                {"round": "combined", **round_block(all_rows, posts + posts2, users1 | users2, "Combined", created[0][:10], created2[-1][:10])},
            ],
        },
        "key_accounts_round2": {
            "note": "Round 2 accounts, stance from reading each post. Jev labels shown for comparison.",
            **{STANCE_NAMES[s]: [account(s, *a) for a in KEY_ACCOUNTS_R2[s]] for s in STANCES},
        },
        "key_accounts": {
            "note": "Stance is the hand reading of each post, not a model output. Jev labels shown for comparison.",
            **{STANCE_NAMES[s]: [account(s, *a) for a in KEY_ACCOUNTS[s]] for s in STANCES},
            "also": {STANCE_NAMES[s]: KEY_ACCOUNTS_ALSO[s] for s in STANCES},
            "ai_persona_accounts": ["SentientDawn", "polyphonicchat"],
        },
        "caveats": [
            {"title": "Jev reads intensity, not direction", "text": "Emphatic posts on either side get pulled toward Serious: 8 of 18 hand-Reject posts came out Serious in the three-way run, and named rejecters (sapinker, Hesamation, anilkseth) were labelled Serious."},
            {"title": "Both camps use the same charged words", "text": "\"Psychosis\", \"welfare\", \"conscious\" and \"moral patient\" appear in rejections and in defences alike, so vocabulary-driven methods (embeddings, and partly Jev) conflate the two. The two-question version still read aleksil79's inversion as dismissive because of its \"psychosis\" wording."},
            {"title": "Small, single-labeller ground truth", "text": "40 random posts plus 67 authors, hand-labelled by one person; ±15 pp at n=40."},
            {"title": "Biased sample", "text": f"{len(posts) + len(posts2)} posts from relevancy search and flashpoint threads, not a random draw from X. Round 2 is dominated by one news event."},
            {"title": "Round 2 has no hand labels", "text": "Accuracy figures come from the 40 round-1 hand labels. Round-2 labels are model outputs only, and the three-way question wording for round 2 was rewritten because the round-1 wording was not recorded."},
            {"title": "Counts are method-dependent", "text": "All-post stance counts swing widely by method (Reject 23%–35%, Serious 28%–48% across the Jev runs). Treat them as method outputs, not population estimates."},
            {"title": "Classification is done offline", "text": "The agent that renders this page does not classify anything. Labels are produced on the analysis box and committed to the repo."},
        ],
        "cost": {"jev_three_way_usd": 0.0060, "jev_two_question_usd": 0.0047, "embeddinggemma_cpu_seconds": 62,
                 "round2_jev_three_way_usd": round(R2_COST[0], 4), "round2_jev_two_question_usd": round(R2_COST[1], 4)},
        "files": ["data/jev_labels.csv", "data/jev_labels_r2.csv", "data/posts_r2.jsonl", "data/authors.json", "data/hand_labels.json", "data/jev_report.md"],
    }

    (OUT / "discourse.json").write_text(json.dumps(discourse, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in ["jev_labels.csv", "authors.json", "hand_labels.json", "jev_report.md"]:
        shutil.copyfile(SRC / name, OUT / name)
    for name in ["jev_labels_r2.csv", "posts_r2.jsonl"]:
        shutil.copyfile(SRC / "round2" / name, OUT / name)
    print(f"wrote {OUT/'discourse.json'} ({len(posts)} posts, {len(usernames)} authors, hand n={n_hand})")


if __name__ == "__main__":
    main()
