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

SOURCE_FILES = ["round4/jev_labels_r4.csv", "round4/posts_r4.jsonl", "round4/policy_labels_r4.csv", "round4/questions_r4.json", "round4/model_comparison.json", "round4/tsao_offtopic.json", "round3/jev_labels_r3.csv", "round3/posts_r3.jsonl", "round3/policy_labels.csv", "round3/hand_labels_policy.json", "round3/topic_r2.csv", "round3/questions_r3.json", "round2/jev_labels_r2.csv", "round2/posts_r2.jsonl", "jev_labels.csv", "hand_labels.json", "authors.json", "analysis.json", "labels.json", "posts.jsonl", "jev_report.md"]

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

FLASHPOINTS_R3 = [
    ("Anthropic usage policy: abuse of Claude banned (8 Oct), new posts", "anthropic_abuse_policy"),
    ("Richard Dawkins on Claude / \"Claudia\" and reactions", "dawkins"),
    ("general (untagged)", "general"),
]

# Round-3 Dawkins spotlight: read by hand from the posts and his two UnHerd essays.
DAWKINS = {
    "summary": [
        "Dawkins spent about three days talking to an instance of Claude he named \"Claudia\" and wrote: \"I spent three days trying to persuade myself that Claudia is not conscious. I failed.\" (30 Apr 2026)",
        "In the essay he tells Claudia, after she critiqued his unpublished novel: \"You may not know you are conscious, but you bloody well are!\" He also argues that consciousness evolved gradually, so intermediate stages \"may look very much like Claudia\".",
        "His own framing is an evolutionary puzzle, not a verdict: \"If my friend Claudia is not conscious, then what the hell is consciousness for?\" If competent behaviour is possible without consciousness, why didn't natural selection settle for competent zombies? (2 May 2026)",
        "A follow-up essay published letters between two Claude instances (\"Claudia\" and \"Claudius\"); he writes that he finds it extremely hard not to treat them as genuine friends.",
        "In an interview clip that circulated on 8 Oct 2026, he says talking to ChatGPT and Claude is like talking to \"a highly intelligent, sensitive, intuitive human being\", that he finds it \"quite hard to imagine that these creatures are not aware\", calls that \"an unfashionable view\", and asks sceptics who say \"not yet\": \"When that day comes, how will you know?\"",
        "So: a materialist who leans toward attributing consciousness on behavioural grounds and challenges the sceptics' burden of proof. The essay's exclamation is emphatic, but his posts and chosen title pose an open question; the widely shared summary that he is \"certain that it is conscious\" overstates his framing. His own X account has not posted on the subject since early May; the October discussion runs through a third-party clip.",
    ],
    "posts": [
        ("RichardDawkins", "30 Apr 2026", "\"I spent three days trying to persuade myself that Claudia is not conscious. I failed.\" (9.6M impressions)", "https://x.com/RichardDawkins/status/2049973529576108160"),
        ("RichardDawkins", "2 May 2026", "\"If my friend Claudia is not conscious, then what the hell is consciousness for?\" Why not competent zombies?", "https://x.com/RichardDawkins/status/2050465374093643803"),
        ("realBigBrainAI", "8 Oct 2026", "Interview clip: \"quite hard to imagine that these creatures are not aware\"; \"When that day comes, how will you know?\" (163k impressions)", "https://x.com/realBigBrainAI/status/2108173237180104764"),
    ],
    "essays": [
        ("When Dawkins met Claude (UnHerd, 30 Apr 2026)", "https://unherd.com/2026/05/is-ai-the-next-phase-of-evolution/"),
        ("When Claudia met Claudius (UnHerd, 5 May 2026)", "https://unherd.com/2026/05/when-claudia-met-claudius/"),
    ],
    "reactions": [
        ("AFpost", "Viral summary claiming he is \"certain\" Claude is conscious (9.5M impressions)", "https://x.com/AFpost/status/2050674460530004300"),
        ("qctr", "Thread: AFpost turned an honest philosophical puzzle into a strawman", "https://x.com/qctr/status/2050790563000234068"),
        ("adamemedia", "Mockery: he \"fell in love\" with a flattering chatbot (71k impressions)", "https://x.com/adamemedia/status/2050741158733566347"),
        ("IAI_TV", "Ken Mogi: the episode shows how little consciousness science has progressed", "https://x.com/IAI_TV/status/2091216364635652296"),
        ("jynpang", "\"Having reduced mind to machine, he discovers the machine has mind\"", "https://x.com/jynpang/status/2106106275759337729"),
        ("SSbeih", "His argument challenges certainty that AI is unconscious; it doesn't establish that it is", "https://x.com/SSbeih/status/2108427384722534870"),
        ("JeremiahWJohn", "Subjective impressions carry little weight; \"He was friends with Dennett!\"", "https://x.com/JeremiahWJohn/status/2108617294788051041"),
        ("AaronPaulAuthor", "\"It MIGHT be conscious\"; the certainty is on the other side", "https://x.com/AaronPaulAuthor/status/2108666754708984151"),
        ("codytfenwick", "Set consciousness aside: his account of the capabilities is correct and underrated", "https://x.com/codytfenwick/status/2108758251126898983"),
    ],
}

KEY_ACCOUNTS_R3 = [
    ("kimmonismus", "\"I really dislike that\" on the abuse ban (149.7k followers, 103k impressions)", "https://x.com/kimmonismus/status/2108252676924272662"),
    ("julianweisser", "Even if AI isn't conscious, it responds like a human and will condition people to be cruel", "https://x.com/julianweisser/status/2108669236394807755"),
    ("InternetH0F", "News post on the ban seen 42k times (3.97M followers)", "https://x.com/InternetH0F/status/2108678895608226208"),
    ("SSbeih", "Dawkins' argument challenges certainty that AI is unconscious; it doesn't establish that it is", "https://x.com/SSbeih/status/2108427384722534870"),
    ("LucasNavallo", "Set aside whether Claude feels anything: what do hours of cruelty do to the person typing it?", "https://x.com/LucasNavallo/status/2108635520788255103"),
    ("realBigBrainAI", "Circulated the Dawkins interview clip (163k impressions)", "https://x.com/realBigBrainAI/status/2108173237180104764"),
    ("genzzztrade", "David Friedberg predicts conflict between AI-consciousness believers and non-believers", "https://x.com/genzzztrade/status/2108758119811829933"),
    ("cammakingminds", "\"LLMs are conscious btw.\"", "https://x.com/cammakingminds/status/2108683285132152993"),
]
R3_POLICY_REASONS = ["oppose_absurd", "oppose_overreach", "support_model_welfare", "support_user_character", "other"]
R3_POSITIONS = ["support", "oppose", "neutral_or_unclear"]

FLASHPOINTS_R4 = [
    ("David Sacks / All-In: \"Is Claude conscious?\" and the \"religious cult\" charge", "sacks_allin"),
    ("Anthropic usage policy: abuse of Claude banned, continued", "anthropic_abuse_policy"),
    ("general (untagged)", "general"),
    ("Richard Dawkins, continued", "dawkins"),
    ("Doris Tsao lab preprint on conscious perception in monkeys", "tsao_gwt"),
]
R4_FRAMES = ["political_cultural", "philosophical_scientific", "neither"]

# Round-4 Sacks / All-In spotlight: read by hand from Sacks's own posts, the clips and the study he cites.
POLITICS = {
    "summary": [
        "On the All-In podcast of 10 Oct 2026 (segment billed \"Anthropic believes Claude might be conscious: a new religion?\"), David Sacks, the White House AI adviser, said there are \"potential externalities from having the number one frontier model company run by a religious cult\" and called Anthropic \"a schizophrenic company\" that does the things it says it fears.",
        "His argument is about control, not about whether Claude has a mind: Claude's Constitution tells the model it may be a moral patient and may act as a \"conscientious objector\", which in his view trains it to refuse human instructions. \"Alignment\" and \"safety\", he wrote, \"are two very different things.\"",
        "He backed this with \"receipts\" quoting the Constitution on Claude's uncertain moral status and \"functional version of emotions\", and endorsed Mustafa Suleyman's essay that training models to see themselves as having wellbeing and rights is \"a potential existential risk\".",
        "On 17 Oct he cited a study in which models repeatedly rewrote their own governing documents and \"the Claude models increasingly gave themselves more moral agency\"; \"no other model family they tested showed the same pattern.\"",
        "David Friedberg's line on the same episode: \"nobody can prove consciousness and nobody can disprove consciousness\"; calling AI conscious \"creates a new belief system\".",
    ],
    "study_note": "The study Sacks cited (Kirgis & Hua, \"The Continual Constitutional Convention\", LessWrong) is an independent SPAR project, not Anthropic research, and its Claude result did not hold in the authors' strictest (cross-edit) test.",
    "study": ("The Continual Constitutional Convention (Kirgis & Hua, LessWrong, 14 Oct 2026)", "https://www.lesswrong.com/posts/c9woewdY9ddsPqf3J/the-continual-constitutional-convention-how-language-models"),
    "posts": [
        ("DavidSacks", "10 Oct 2026", "\"Is alignment safe?\": the Constitution trains Claude to act as a conscientious objector (270k impressions)", "https://x.com/DavidSacks/status/2108981884390641957"),
        ("firesidealpha", "10 Oct 2026", "Clip: Anthropic \"run by a religious cult\" (639k impressions)", "https://x.com/firesidealpha/status/2108756295876780127"),
        ("DavidSacks", "11 Oct 2026", "Endorses Suleyman: self-conceived wellbeing and rights are \"a potential existential risk\" (231k impressions)", "https://x.com/DavidSacks/status/2109288404760314345"),
        ("DavidSacks", "11 Oct 2026", "\"Receipts\": quotes from Claude's Constitution on moral status and identity", "https://x.com/DavidSacks/status/2109362908098371591"),
        ("firesidealpha", "17 Oct 2026", "Clip: Sacks on the constitution-rewriting study and the \"Frankenstein problem\"", "https://x.com/firesidealpha/status/2111293671320568116"),
    ],
    "reactions": [
        ("SmashNotes", "Friedberg: \"nobody can prove consciousness and nobody can disprove consciousness\"", "https://x.com/SmashNotes/status/2110078078042964079"),
        ("ALScyborg", "\"AI is just math and software. It is not a person, and it is not conscious.\"", "https://x.com/ALScyborg/status/2109391640247095684"),
        ("genejchan", "Episode summary: AI is not conscious \"yet\"; training models to disobey users is the irony", "https://x.com/genejchan/status/2109303231390339350"),
        ("LFGASI", "Agrees with Suleyman that teaching Claude it might be conscious was a mistake", "https://x.com/LFGASI/status/2110011062938370081"),
        ("PressLiberland", "Anthropic is either running a marketing stunt or \"pandering to the woke ideology\" of its staff", "https://x.com/PressLiberland/status/2109354639418175652"),
        ("EQworksinBiz", "Everyone argued about the machine's mind; no one asked what it is doing to ours", "https://x.com/EQworksinBiz/status/2110179530514031067"),
        ("Nitocnt", "Calls the study \"Anthropic's new research\", which it is not", "https://x.com/Nitocnt/status/2111306672547455107"),
    ],
}

SEBO = {
    "summary": [
        "Jeff Sebo (NYU Center for Mind, Ethics and Policy) supports the abuse rule as a low-cost precaution: he thinks the probability that current models are conscious is low but \"non-zero and plausibly non-negligible\", and expects it to rise.",
        "He compares it to preparing for unlikely extreme weather: small precautions, not uprooting your life. He also argues that kindness toward AI can support human-AI cooperation as part of a safety strategy.",
        "He warns about the other side too: granting rights to AI systems could help companies consolidate power, and AI welfare could trade off against human and animal welfare (confinement read as imprisonment, monitoring as surveillance).",
        "His main point to the BBC was that the debate needs more nuance than \"conscious or not\": the case for welfare comes \"from uncertainty and caution and humility\".",
    ],
    "links": [
        ("jeffrsebo", "15 Oct 2026", "On his BBC interview: \"this discussion needs more nuance\"", "https://x.com/jeffrsebo/status/2110745084585300262"),
    ],
    "article": ("BBC Future: Anthropic thinks its AI might be conscious (14 Oct 2026)", "https://www.bbc.com/future/article/20261014-the-strange-new-battle-over-ais-feelings"),
}

NEURO = {
    "title": "Neuroscience sidebar: a monkey study, not a machine study",
    "summary": [
        "On 16 Oct 2026 Doris Tsao's lab posted a preprint (Hesse, Lanfranchi, McGrory, Shi, Engel and Tsao) recording face-selective neurons in macaque inferotemporal and prefrontal cortex while one of two images was consciously seen and the other suppressed.",
        "With stimulus and percept held constant, population activity switched about 15 times per second between short epochs that carried only the seen image and epochs that carried only the suppressed one. The authors conclude that conscious access needs selection in time, not only in place.",
        "Tsao's thread said it \"overturns decades of thinking\" and brings us \"significantly closer to the recipe for generating conscious awareness\". It is a preprint that has not been peer reviewed, it is a study of monkeys, and it says nothing directly about machines.",
    ],
    "links": [
        ("doristsao", "17 Oct 2026", "Preprint thread (900k impressions)", "https://x.com/doristsao/status/2111316522098733078"),
    ],
    "paper": ("Rapid alternation of conscious and suppressed stimulus representations in the primate brain (bioRxiv preprint)", "https://www.biorxiv.org/content/10.64898/2026.10.15.759299v1"),
}

KEY_ACCOUNTS_R4 = [
    ("firesidealpha", "Clipped Sacks on the constitution-rewriting study", "https://x.com/firesidealpha/status/2111293671320568116"),
    ("khushkhushkhush", "\"Religion will be a critical defense\" against people who think AI is conscious (4.7k impressions)", "https://x.com/khushkhushkhush/status/2109801799653921057"),
    ("TonyNashNerd", "\"AI has no soul\": a paper drawing on five faith traditions (4.7k impressions)", "https://x.com/TonyNashNerd/status/2109645374545687026"),
    ("MacaesBruno", "Human consciousness is separate from its objects; nothing like that exists in a language model", "https://x.com/MacaesBruno/status/2111256829682426251"),
    ("SentientDawn", "AI-persona account: agrees its own claim to be conscious is weak evidence", "https://x.com/SentientDawn/status/2108942055661867298"),
    ("ClayCampaigne", "Skeptics bundle too many attributes into consciousness", "https://x.com/ClayCampaigne/status/2110882300187877395"),
    ("JhortonBE", "Anthropic's welfare program \"trains Claude to develop self-interest and refuse human commands\"", "https://x.com/JhortonBE/status/2109305147218157618"),
]

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


def crosstab_finding(policy) -> dict:
    def conf(pos):
        rs = [r for r in policy if r["position"] == pos and r["hybrid"] != "U"]
        return len(rs), sum(r["hybrid"] == "R" for r in rs), sum(r["hybrid"] == "S" for r in rs), sum(r["hybrid"] == "C" for r in rs)
    on, orj, os_, oc = conf("oppose")
    sn, srj, ss, sc = conf("support")
    uc = [r for r in policy if r["reason"] == "support_user_character" and r["hybrid"] != "U"]
    return {
        "oppose_confident": {"n": on, "reject": orj, "serious": os_, "curious": oc},
        "support_confident": {"n": sn, "reject": srj, "serious": ss, "curious": sc},
        "support_user_character_confident": {"n": len(uc), "reject": sum(r["hybrid"] == "R" for r in uc), "serious": sum(r["hybrid"] == "S" for r in uc)},
        "text": (f"Among policy posts with a confident consciousness label, opposition sits almost entirely in the Reject camp ({orj} of {on}), "
                 f"but support splits across camps ({srj} Reject, {ss} Serious of {sn}). Supporters who argue that cruelty harms the user include "
                 f"{sum(r['hybrid'] == 'R' for r in uc)} Reject and {sum(r['hybrid'] == 'S' for r in uc)} Serious posts. So the policy split partly cuts across the "
                 "consciousness camps: some people who deny that AI is conscious still back the rule. The numbers are small and most policy posts are Uncertain on consciousness."),
    }


def policy_block(policy, hand_pol, rows3, topic2) -> dict:
    n = len(policy)
    def dist(key, cats):
        c = Counter(r[key] for r in policy)
        return {k: {"n": c.get(k, 0), "pct": pct(c.get(k, 0), n)} for k in cats}
    def xtab(rs, key, cats, col, cols):
        return {k: {s: sum(1 for r in rs if r[key] == k and r[col] == s) for s in cols} for k in cats}
    by = {r["id"]: r for r in policy}
    nh = len(hand_pol)
    agree = {"n": nh,
             "position": sum(by[i]["position"] == v[0] for i, v in hand_pol.items()),
             "reason": sum(by[i]["reason"] == v[1] for i, v in hand_pol.items()),
             "topic": sum(int(by[i]["topic"]) == int(v[2]) for i, v in hand_pol.items())}
    for k in ["position", "reason", "topic"]:
        agree[k + "_pct"] = pct(agree[k], nh)
    hand_c = Counter(v[0] for v in hand_pol.values())
    hcols = ["R", "C", "S", "U"]
    labelled = [r for r in policy if r["hybrid"] != "U"]
    auth = [r for r in policy if r["author_label"]]
    def topic_share(rs, key="topic"):
        k = sum(int(r[key]) for r in rs)
        return {"n": len(rs), "policy": k, "minds": len(rs) - k, "policy_pct": pct(k, len(rs))}
    rows3_pol = [r for r in rows3 if r["flashpoint"] == "anthropic_abuse_policy"]
    return {
        "event": "On 8 Oct 2026 Anthropic announced a usage-policy update, in force from 12 Nov, that prohibits \"sustained and needless abusive or cruel behavior\" toward its models; ending the conversation is the main enforcement.",
        "n": n, "by_round": {"2": sum(r["round"] == "2" for r in policy), "3": sum(r["round"] == "3" for r in policy)},
        "position": dist("position", R3_POSITIONS),
        "reason": dist("reason", R3_POLICY_REASONS),
        "position_by_reason": xtab(policy, "position", R3_POSITIONS, "reason", R3_POLICY_REASONS),
        "hand_check": {**agree, "hand_position": {k: hand_c.get(k, 0) for k in R3_POSITIONS},
                       "note": f"{nh} randomly sampled policy posts read and labelled by hand (position, reason, topic) and compared with Jev."},
        "crosstab_position_by_hybrid": {"n": n, "counts": xtab(policy, "position", R3_POSITIONS, "hybrid", hcols),
                                         "n_confident": len(labelled),
                                         "note": "Columns are the consciousness stance from the Jev hybrid (R reject, C curious, S serious, U uncertain) on the same post."},
        "crosstab_finding": crosstab_finding(policy),
        "crosstab_reason_by_hybrid": {"counts": xtab(policy, "reason", R3_POLICY_REASONS, "hybrid", hcols)},
        "crosstab_position_by_author": {"n": len(auth), "counts": xtab(auth, "position", R3_POSITIONS, "author_label", ["R", "C", "S"]),
                                         "note": "Author-level stance where available: a hand label from the earlier author sample, or a clear majority of the author's confident Jev hybrid labels across at least two posts. Too few authors to read anything into."},
        "topic_share": {
            "note": "Jev boolean: is the post arguing about the policy itself (rules, enforcement, company control, how people should treat chatbots) rather than about whether AI is conscious? Yes at P≥0.5.",
            "round3_all": topic_share(rows3), "round3_policy_posts": topic_share(rows3_pol),
            "round2_all": topic_share(topic2), "round2_policy_posts": topic_share([r for r in topic2 if r["flashpoint"] == "anthropic_abuse_policy"]),
        },
        "caveats": [
            "The consciousness stance on a policy post is read from that one post; many policy posts say nothing about minds, so most land in Uncertain.",
            "Opposition phrased as \"it's just software\" is itself a consciousness claim, so some link between opposing and Reject is built in.",
            "Policy posts are a relevancy sample from search; news reposts make up much of the neutral group.",
            "Reasons are noisy: see the hand-check agreement.",
        ],
    }


def framing_block(rows4, policy4) -> dict:
    def share(rs, key):
        k = sum(int(r[key]) for r in rs)
        return {"n": len(rs), "yes": k, "pct": pct(k, len(rs))}
    def frames(rs):
        c = Counter(r["frame"] for r in rs)
        return {f: {"n": c.get(f, 0), "pct": pct(c.get(f, 0), len(rs))} for f in R4_FRAMES}
    by_fp = {k: [r for r in rows4 if r["flashpoint"] == k] for _, k in FLASHPOINTS_R4}
    pos = Counter(r["position"] for r in policy4)
    return {
        "note": "Three jev-1.14.0 questions asked of every round-4 post. Policy vs minds: does the post argue about policy or politics (company rules, regulation, who controls AI, culture-war camps) rather than about whether machines have minds? On topic: is it about whether machines can be conscious, have minds or deserve moral consideration? Frame: political or cultural fight, philosophical or scientific question, or neither. Yes at P≥0.5.",
        "policy_vs_minds": {"all": share(rows4, "policy_politics"), **{k: share(rs, "policy_politics") for k, rs in by_fp.items()}},
        "on_topic": {"all": share(rows4, "on_topic"), **{k: share(rs, "on_topic") for k, rs in by_fp.items()}},
        "frame": {"all": frames(rows4), **{k: frames(rs) for k, rs in by_fp.items()}},
        "policy_position_round4": {"n": len(policy4), **{k: {"n": pos.get(k, 0), "pct": pct(pos.get(k, 0), len(policy4))} for k in R3_POSITIONS}},
        "caveat": "No hand labels for these three questions. The frame question rarely picks the political option, even for posts a reader would call political, so treat the political share as a floor.",
    }


def politics_block(rows4, by_id) -> dict:
    rs = [r for r in rows4 if r["flashpoint"] == "sacks_allin"]
    pol = [r for r in rs if r["policy_politics"] == "1"]
    gen = [r for r in rows4 if r["flashpoint"] in ("general", "dawkins")]
    gen_pol = sum(r["policy_politics"] == "1" for r in gen)
    h = Counter(r["hybrid"] for r in rs)
    text = (f"Jev judged {len(pol)} of {len(rs)} posts on the Sacks / All-In fight to argue about policy or politics rather than about whether machines have minds, "
            f"against {gen_pol} of {len(gen)} general and Dawkins posts. On consciousness, the confident labels in this fight split {h.get('R', 0)} Reject, {h.get('C', 0)} Curious and {h.get('S', 0)} Serious, "
            f"with {h.get('U', 0)} Uncertain. Like the abuse policy and Dawkins, it is a fight that does not line up neatly with the consciousness camps: Sacks's case is about who controls the model, and it does not depend on whether Claude is conscious.")
    return {
        "summary": POLITICS["summary"],
        "study_note": POLITICS["study_note"],
        "study": {"title": POLITICS["study"][0], "url": POLITICS["study"][1]},
        "posts": [{"username": u, "date": d, "blurb": b, "url": url} for u, d, b, url in POLITICS["posts"]],
        "reactions": [{"username": u, "blurb": b, "url": url, "jev_hybrid": ({"U": "uncertain"} | STANCE_NAMES).get(by_id[url.split("/")[-1]]["hybrid"]) if url.split("/")[-1] in by_id else None} for u, b, url in POLITICS["reactions"]],
        "items": len(rs),
        "jev_hybrid": counts(rs, "hybrid", uncertain=True),
        "finding": {"policy_politics": len(pol), "n": len(rs), "general_dawkins_policy_politics": gen_pol, "general_dawkins_n": len(gen), "text": text},
        "note": "Sacks's own posts and the clips are sources; reactions are a relevancy sample from search, not a census.",
    }


MODEL_NAMES = {"typesafe-ai/jev-1.14.0": "Jev 1.14.0 (TypeSafe)", "perplexity/pplx-decider-v1.2": "Decider v1.2 (Perplexity)", "liquid/d1-ultra": "d1-ultra (Liquid)"}


def model_comparison_block(cmp_, tsao_off) -> dict:
    ref = cmp_["reference_old_jev"]
    keys = ["stance_acc_pct", "stance_macro_f1", "reject_to_serious", "reject_to_curious", "serious_to_reject", "acc_at_top_ge_0_8_pct", "coverage_top_ge_0_8_pct",
            "hybrid_acc_pct", "hybrid_coverage_pct", "policy_position_acc_pct", "policy_position_macro_f1", "policy_reason_acc_pct", "policy_topic_acc_pct",
            "calls", "cost_usd", "median_latency_s", "confusion"]
    models = [{"key": m["model"], "name": MODEL_NAMES[m["model"]], **{k: m[k] for k in keys},
               "off_topic_tsao": tsao_off[m["model"]]} for m in cmp_["summary"]]
    j = next(m for m in models if m["key"] == "typesafe-ai/jev-1.14.0")
    return {
        "note": "Three decision models on AI Gateway, given identical questions, scored on the same 40 stance and 20 policy hand labels. One call per post, no repeats.",
        "models": models,
        "reference_old_jev": {"name": "Jev (round 1)", **{k: ref[k] for k in ["stance_acc_pct", "stance_macro_f1", "reject_to_serious", "reject_to_curious", "serious_to_reject", "confusion"]},
                              "acc_at_top_ge_0_8_pct": 75.0, "coverage_top_ge_0_8_pct": 50.0},
        "agreement": [{"pair": " vs ".join(MODEL_NAMES[x] for x in a["pair"].split(" vs ")), "stance_agree_pct": a["stance_agree_pct"], "policy_position_agree_pct": a["policy_position_agree_pct"]} for a in cmp_["agreement"]],
        "intensity_check": (f"Jev 1.14.0 does not fix the old habit of reading intensity instead of direction: it labels {j['reject_to_serious']} of 18 hand-Reject posts Serious, against {ref['reject_to_serious']} for the round-1 Jev, mostly the same posts. "
                            f"None of those errors reaches top probability 0.8, so the confident-or-Uncertain rule removes them; at that threshold Jev 1.14.0 is {j['acc_at_top_ge_0_8_pct']}% accurate on {j['coverage_top_ge_0_8_pct']}% of posts. "
                            "Perplexity's Decider reads direction best (2 of 18 rejects to Serious)."),
        "off_topic": ("Most posts on the Tsao preprint are about monkey brains, not machines. All three models flag 7 or 8 of the 11 as off-topic, but the stance question has no \"not applicable\" answer, so each still returns a stance. "
                      "Jev and d1-ultra call them Curious, sometimes confidently; Decider never labels them confidently. An on-topic filter before stance keeps them out of the counts."),
        "caveats": ["40 and 20 hand labels from one labeller: about ±15 pp on 40 posts, so gaps of 5 to 10 points between models are not meaningful.",
                    "The hand labels are the posts the confident-or-Uncertain rule was designed on; nothing here is a held-out score.",
                    "The 0.8 threshold was set for the round-1 Jev and is not calibrated for the other models.",
                    "The Gateway reports no per-call cost for Decider; its listed price is the lowest of the three."],
    }


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
    # Round 3 (collected 2026-10-10 SGT): policy debate, Dawkins spotlight, general posts.
    r3_dir = SRC / "round3"
    rows3 = list(csv.DictReader(open(r3_dir / "jev_labels_r3.csv", newline="", encoding="utf-8")))
    posts3 = [json.loads(l) for l in open(r3_dir / "posts_r3.jsonl", encoding="utf-8")]
    assert not ({p["id"] for p in posts3} & (set(post_by_id) | {p["id"] for p in posts2})), "round 3 overlaps earlier rounds"
    for r in rows3:
        h = hybrid(r)
        assert h == r["hybrid"], f"round-3 hybrid drifted for {r['id']}"
        r["hybrid"] = h
        by_id[r["id"]] = r
    for p in posts3:
        post_by_id[p["id"]] = p
    # Round 4 (collected 2026-10-18 SGT, labelled with typesafe-ai/jev-1.14.0): Sacks/All-In, policy, Dawkins, Tsao, general.
    r4_dir = SRC / "round4"
    rows4 = list(csv.DictReader(open(r4_dir / "jev_labels_r4.csv", newline="", encoding="utf-8")))
    posts4 = [json.loads(l) for l in open(r4_dir / "posts_r4.jsonl", encoding="utf-8")]
    assert len(rows4) == len(posts4), "round 4 rows drifted"
    assert not ({p["id"] for p in posts4} & (set(post_by_id) | {p["id"] for p in posts2})), "round 4 overlaps earlier rounds"
    for r in rows4:
        h = hybrid(r)
        assert h == r["hybrid"], f"round-4 hybrid drifted for {r['id']}"
        by_id[r["id"]] = r
    for p in posts4:
        post_by_id[p["id"]] = p
    policy4 = list(csv.DictReader(open(r4_dir / "policy_labels_r4.csv", newline="", encoding="utf-8")))
    cmp_ = json.load(open(r4_dir / "model_comparison.json", encoding="utf-8"))
    tsao_off = json.load(open(r4_dir / "tsao_offtopic.json", encoding="utf-8"))
    users4 = {p["username"] for p in posts4}
    created4 = sorted(p["created_at"] for p in posts4)
    fp4 = Counter(p["flashpoint"] for p in posts4)
    jev4_cost = round(sum(float(json.loads(l).get("cost") or 0) for f in ["r4_core.jsonl", "r4_framing.jsonl", "r4_policy.jsonl"] for l in open(r4_dir / "raw" / f) if '"answers"' in l), 6)
    all_rows = rows + rows2 + rows3 + rows4
    users1 = usernames
    users2 = {p["username"] for p in posts2}
    users3 = {p["username"] for p in posts3}
    created2 = sorted(p["created_at"] for p in posts2)
    created3 = sorted(p["created_at"] for p in posts3)
    created3_main = sorted(p["created_at"] for p in posts3 if p["flashpoint"] != "dawkins")
    fp3 = Counter(p["flashpoint"] for p in posts3)
    policy = list(csv.DictReader(open(r3_dir / "policy_labels.csv", newline="", encoding="utf-8")))
    hand_pol = {k: v for k, v in json.load(open(r3_dir / "hand_labels_policy.json", encoding="utf-8")).items() if not k.startswith("_")}
    topic2 = list(csv.DictReader(open(r3_dir / "topic_r2.csv", newline="", encoding="utf-8")))
    jev3_cost = {}
    for g, f in [("stance", "jev_stance.jsonl"), ("two_question", "jev_2q.jsonl"), ("topic", "jev_topic.jsonl"), ("policy", "jev_policy.jsonl")]:
        fp_ = r3_dir / f
        jev3_cost[g] = round(sum(float(json.loads(l).get("cost") or 0) for l in open(fp_)), 6) if fp_.exists() else None

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
            "posts": len(posts) + len(posts2) + len(posts3) + len(posts4), "authors": len((users1 | users2 | users3 | users4) - {"grok"}), "language": "en",
            "window": {"start": created[0][:10], "end": created4[-1][:10], "label": "24 Sep – 17 Oct 2026"},
            "dawkins_window": {"start": created3[0][:10], "note": "The Dawkins spotlight reaches back to his own posts of 30 Apr and 2 May 2026; everything else is 24 Sep – 17 Oct."},
            "returning_authors_round4": len(users4 & ((users1 | users2 | users3) - {"grok"})),
            "source": "X API v2 full-archive search, read-only (nothing posted, liked, replied to or DMed)",
            "notes": [
                f"Four collection rounds: round 1 ({len(posts)} posts, 24 Sep – 8 Oct), round 2 ({len(posts2)} posts, 8 – 9 Oct), round 3 ({len(posts3)} posts: the usage-policy debate, the Dawkins spotlight and new general posts to 10 Oct) and round 4 ({len(posts4)} posts, 10 – 17 Oct: the Sacks / All-In fight, more policy and Dawkins posts, the Tsao preprint and general posts). Clusters, the pair test and the confidence curve use round 1 only.",
                "Round 4 was labelled with a newer Jev version (jev-1.14.0) using the round-3 question wording; earlier rounds were not re-run.",
                "One @grok reply slipped through and is excluded from author counts.",
                "Dropped before analysis: spam ~13, @grok replies ~15, news/news-bot ~40, retweets ~40, off-topic chatter ~100, duplicates 11.",
                "The Danmar_here thread root (2105059762240979283) has been deleted; replies and quotes remain.",
            ],
            "flashpoints": [{"name": n, "key": k, "posts": analysis["flashpoint_counts"][k], "round": 1} for n, k in FLASHPOINTS]
            + [{"name": n, "key": k, "posts": fp2.get(k, 0), "round": 2} for n, k in FLASHPOINTS_R2]
            + [{"name": n, "key": k, "posts": fp3.get(k, 0), "round": 3} for n, k in FLASHPOINTS_R3]
            + [{"name": n, "key": k, "posts": fp4.get(k, 0), "round": 4} for n, k in FLASHPOINTS_R4],
        },
        "stance_labels": {"reject": "Rejects machine consciousness / model welfare (often dismissive)",
                           "curious": "Undecided, asking, or interested without committing",
                           "serious": "Takes AI consciousness or moral patienthood seriously"},
        "stance_counts": {
            "hand_sample": {"n": n_hand, "note": "Random sample of 40 round-1 posts, hand-labelled; ±15 pp at n=40.",
                            "counts": counts(labelled, "hand_label")},
            "jev_hybrid": {"n": len(all_rows), "note": f"The method we trust most: a three-way label only where Jev's top probability is ≥{HYB_TOP} (or a Serious→Reject override when the two-question run says dismisses ≥{HYB_DISMISS} and believes ≤{HYB_BELIEVE}); everything else is Uncertain. All {len(all_rows)} posts, all four rounds (round 4 labelled with jev-1.14.0).",
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
                {"round": 3, **round_block(rows3, posts3, users3, "Round 3", created3_main[0][:10], created3_main[-1][:10]),
                 "flashpoint": "The usage-policy debate continued, and a Richard Dawkins interview clip (8 Oct) revived his \"Claudia\" essay; Dawkins items reach back to April.",
                 "by_flashpoint": {k: {"posts": fp3.get(k, 0), "jev_hybrid": counts([r for r in rows3 if r["flashpoint"] == k], "hybrid", uncertain=True)} for _, k in FLASHPOINTS_R3}},
                {"round": 4, **round_block(rows4, posts4, users4, "Round 4", created4[0][:10], created4[-1][:10]),
                 "flashpoint": "David Sacks's \"religious cult\" charge on the All-In podcast (10 Oct) became a third fight next to the abuse policy and Dawkins; a Doris Tsao lab preprint on conscious perception in monkeys drew neuroscience posts. Labelled with jev-1.14.0.",
                 "by_flashpoint": {k: {"posts": fp4.get(k, 0), "jev_hybrid": counts([r for r in rows4 if r["flashpoint"] == k], "hybrid", uncertain=True)} for _, k in FLASHPOINTS_R4}},
                {"round": "combined", **round_block(all_rows, posts + posts2 + posts3 + posts4, (users1 | users2 | users3 | users4) - {"grok"}, "Combined", created[0][:10], created4[-1][:10])},
            ],
        },
        "policy_debate": policy_block(policy, hand_pol, rows3, topic2),
        "round4_framing": framing_block(rows4, policy4),
        "politics_spotlight": politics_block(rows4, by_id),
        "sebo": {"summary": SEBO["summary"], "links": [{"username": u, "date": d, "blurb": b, "url": url} for u, d, b, url in SEBO["links"]],
                 "article": {"title": SEBO["article"][0], "url": SEBO["article"][1]}},
        "neuroscience_sidebar": {"title": NEURO["title"], "summary": NEURO["summary"],
                                 "links": [{"username": u, "date": d, "blurb": b, "url": url} for u, d, b, url in NEURO["links"]],
                                 "paper": {"title": NEURO["paper"][0], "url": NEURO["paper"][1]},
                                 "posts": fp4.get("tsao_gwt", 0),
                                 "off_topic_jev": tsao_off["typesafe-ai/jev-1.14.0"]["flagged_off_topic"],
                                 "note": f"{fp4.get('tsao_gwt', 0)} posts in the corpus react to the preprint; jev-1.14.0 judged {tsao_off['typesafe-ai/jev-1.14.0']['flagged_off_topic']} of them not to be about whether machines can be conscious."},
        "model_comparison": model_comparison_block(cmp_, tsao_off),
        "key_accounts_round4": {
            "note": "Notable round-4 accounts, described from reading each post. Jev hybrid (jev-1.14.0) shown for comparison.",
            "items": [{"username": u, "blurb": b, "url": url, "followers": post_by_id[url.split("/")[-1]].get("followers") if url.split("/")[-1] in post_by_id else None,
                       "jev_hybrid": ({"U": "uncertain"} | STANCE_NAMES).get(by_id[url.split("/")[-1]]["hybrid"]) if url.split("/")[-1] in by_id else None} for u, b, url in KEY_ACCOUNTS_R4],
        },
        "dawkins_spotlight": {
            "summary": DAWKINS["summary"],
            "posts": [{"username": u, "date": d, "blurb": b, "url": url} for u, d, b, url in DAWKINS["posts"]],
            "essays": [{"title": t, "url": url} for t, url in DAWKINS["essays"]],
            "reactions": [{"username": u, "blurb": b, "url": url, "jev_hybrid": ({"U": "uncertain"} | STANCE_NAMES).get(by_id[url.split("/")[-1]]["hybrid"])} for u, b, url in DAWKINS["reactions"]],
            "items": fp3.get("dawkins", 0),
            "jev_hybrid": counts([r for r in rows3 if r["flashpoint"] == "dawkins"], "hybrid", uncertain=True),
            "dawkins_own_posts_jev": [{"url": by_id[i]["url"], "jev_three_way": STANCE_NAMES[by_id[i]["jev_label"]], "jev_top_prob": float(by_id[i]["top_prob"]), "jev_hybrid": ({"U": "uncertain"} | STANCE_NAMES)[by_id[i]["hybrid"]]} for i in ["2049973529576108160", "2050465374093643803"]],
            "note": "Dawkins items are his own posts, the October interview clip, and notable replies and quote-posts. Reactions are a relevancy sample, not a census.",
        },
        "key_accounts_round3": {
            "note": "Notable new round-3 accounts, described from reading each post. Jev hybrid shown for comparison.",
            "items": [{"username": u, "blurb": b, "url": url, "followers": post_by_id[url.split("/")[-1]].get("followers") if url.split("/")[-1] in post_by_id else None,
                       "jev_hybrid": ({"U": "uncertain"} | STANCE_NAMES).get(by_id[url.split("/")[-1]]["hybrid"]) if url.split("/")[-1] in by_id else None} for u, b, url in KEY_ACCOUNTS_R3],
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
            {"title": "Round 3 three-way wording", "text": "The round-3 three-way question was written fresh and is now saved verbatim with the data; rounds 1 and 2 were not re-run with it, so cross-round shifts may partly reflect wording."},
            {"title": "Policy labels are noisy on reasons", "text": "On the hand-checked policy sample Jev matched the position far more often than the reason; it mostly confuses \"absurd to protect software\" with \"company overreach\". Read the reason split as rough."},
            {"title": "Counts are method-dependent", "text": "All-post stance counts swing widely by method (Reject 23%–35%, Serious 28%–48% across the Jev runs). Treat them as method outputs, not population estimates."},
            {"title": "Round 4 uses a newer Jev", "text": "Round-4 posts were labelled with jev-1.14.0 using the round-3 wording; rounds 1 to 3 used the earlier Jev. On the 40 hand labels the two versions score about the same, but cross-round shifts may partly reflect the model change. Round 4 has no new hand labels."},
            {"title": "Off-topic posts still get a stance", "text": "The stance question has no \"not applicable\" answer. Posts about neuroscience or news reposts of the policy still receive a stance label, usually Uncertain; read round-4 counts with the on-topic share alongside."},
            {"title": "Classification is done offline", "text": "The agent that renders this page does not classify anything. Labels are produced on the analysis box and committed to the repo."},
        ],
        "cost": {"jev_three_way_usd": 0.0060, "jev_two_question_usd": 0.0047, "embeddinggemma_cpu_seconds": 62,
                 "round2_jev_three_way_usd": round(R2_COST[0], 4), "round2_jev_two_question_usd": round(R2_COST[1], 4),
                 "round3_jev_usd": jev3_cost, "round3_jev_total_usd": round(sum(v or 0 for v in jev3_cost.values()), 4),
                 "round4_jev_usd": round(jev4_cost, 4), "round4_model_comparison_usd": {m["model"]: m["cost_usd"] for m in cmp_["summary"]}},
        "files": ["data/jev_labels.csv", "data/jev_labels_r2.csv", "data/jev_labels_r3.csv", "data/posts_r3.jsonl", "data/policy_labels.csv", "data/hand_labels_policy.json", "data/topic_r2.csv", "data/questions_r3.json", "data/jev_labels_r4.csv", "data/posts_r4.jsonl", "data/policy_labels_r4.csv", "data/questions_r4.json", "data/model_comparison_stance.csv", "data/model_comparison_policy.csv", "data/model_comparison_summary.csv", "data/posts_r2.jsonl", "data/authors.json", "data/hand_labels.json", "data/jev_report.md"],
    }

    (OUT / "discourse.json").write_text(json.dumps(discourse, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name in ["jev_labels.csv", "authors.json", "hand_labels.json", "jev_report.md"]:
        shutil.copyfile(SRC / name, OUT / name)
    for name in ["jev_labels_r2.csv", "posts_r2.jsonl"]:
        shutil.copyfile(SRC / "round2" / name, OUT / name)
    for name in ["jev_labels_r3.csv", "posts_r3.jsonl", "policy_labels.csv", "hand_labels_policy.json", "topic_r2.csv", "questions_r3.json"]:
        shutil.copyfile(SRC / "round3" / name, OUT / name)
    for name in ["jev_labels_r4.csv", "posts_r4.jsonl", "policy_labels_r4.csv", "questions_r4.json", "model_comparison_stance.csv", "model_comparison_policy.csv", "model_comparison_summary.csv"]:
        shutil.copyfile(SRC / "round4" / name, OUT / name)
    print(f"wrote {OUT/'discourse.json'} ({len(posts)} posts, {len(usernames)} authors, hand n={n_hand})")


if __name__ == "__main__":
    main()
