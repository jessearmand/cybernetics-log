import type { Discourse } from "./data.ts";

/** Editorial copy written by the agent. Everything numeric comes from the data, never from here. */
export interface Editorial {
  readonly headline: string;
  readonly dek: string;
  readonly summary: readonly string[];
  readonly takeaways?: readonly string[];
  readonly sectionNotes?: Partial<Record<SectionKey, string>>;
  readonly accent?: Accent;
  readonly instructionSummary?: string;
}

export type SectionKey = "stance" | "methods" | "confidence" | "pairTest" | "clusters" | "accounts" | "caveats" | "policy" | "dawkins" | "politics" | "neuro" | "models" | "lead" | "workspace" | "nature" | "round5" | "round7";
export const ACCENTS = ["indigo", "teal", "amber", "rose", "slate"] as const;
export type Accent = (typeof ACCENTS)[number];

export interface RenderMeta {
  readonly renderedAt: string;
  readonly model: string;
  readonly dataSource: string;
  readonly deployment?: {
    readonly id: string;
    readonly environment: string;
    readonly sha: string;
    readonly repository: string;
    readonly targetUrl: string | null;
  } | null;
  readonly instruction?: string;
  readonly banner?: string;
  readonly warnings?: readonly string[];
}

const ACCENT_HEX: Record<Accent, [string, string]> = {
  indigo: ["#4f46e5", "#eef2ff"],
  teal: ["#0f766e", "#f0fdfa"],
  amber: ["#b45309", "#fffbeb"],
  rose: ["#be123c", "#fff1f2"],
  slate: ["#334155", "#f1f5f9"],
};

const STANCE_COLOR = { reject: "#dc2626", curious: "#d97706", serious: "#2563eb", uncertain: "#9ca3af" } as const;
type StanceName = "reject" | "curious" | "serious";
type BucketName = keyof typeof STANCE_COLOR;
type Counts = Record<string, { n: number; pct: number }>;
const bucketsOf = (c: Counts): BucketName[] => (c.uncertain ? [...STANCES, "uncertain"] : STANCES);
const STANCES: StanceName[] = ["reject", "curious", "serious"];
const CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** HTML-escapes text. All model and post text goes through this. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped text with **bold** and `code` spans; nothing else is interpreted. */
function prose(value: string): string {
  return esc(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Only https links to x.com / github.com / vercel.app / unherd.com / lesswrong.com / biorxiv.org / bbc.com / nature.com / arxiv.org are emitted as hrefs. */
function safeUrl(url: unknown): string | null {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:") return null;
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)github\.com$|\.vercel\.app$|(^|\.)unherd\.com$|(^|\.)lesswrong\.com$|(^|\.)biorxiv\.org$|(^|\.)bbc\.com$|(^|\.)nature\.com$|(^|\.)arxiv\.org$/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function link(url: unknown, text: string): string {
  const href = safeUrl(url);
  return href ? `<a href="${esc(href)}" rel="noopener noreferrer" target="_blank">${text}</a>` : text;
}

function note(editorial: Editorial, key: SectionKey): string {
  const text = editorial.sectionNotes?.[key];
  return text ? `<p class="note">${prose(text)}</p>` : "";
}

function stackedBar(parts: { stance: BucketName; n: number; pct: number }[], label: string, sub: string): string {
  const segs = parts
    .map(
      (p) =>
        `<span class="seg" style="width:${Math.max(p.pct, 0)}%;background:${STANCE_COLOR[p.stance]}" title="${esc(CAP(p.stance))}: ${p.n} (${p.pct}%)">${p.pct >= 9 ? `${p.pct.toFixed(0)}%` : ""}</span>`,
    )
    .join("");
  return `<div class="barrow"><div class="barlabel"><strong>${esc(label)}</strong><span>${esc(sub)}</span></div><div class="bar" role="img" aria-label="${esc(
    `${label}: ${parts.map((p) => `${CAP(p.stance)} ${p.pct}%`).join(", ")}`,
  )}">${segs}</div><div class="barcounts">${parts.map((p) => `<span>${p.n}</span>`).join("")}</div></div>`;
}

function stanceSection(d: Discourse, e: Editorial): string {
  const sc = d.stance_counts;
  const hyb = sc.jev_hybrid.counts as Counts;
  const rows: [string, string, { n: number; pct: number }[]][] = [
    ["Hand sample", `n=${sc.hand_sample.n} random posts · ground truth`, STANCES.map((s) => sc.hand_sample.counts[s])],
    ["Jev hybrid", `all ${sc.jev_hybrid.n} posts · confident labels + Uncertain`, bucketsOf(hyb).map((s) => hyb[s]!)],
    ["Jev three-way", `all ${sc.jev_three_way.n} posts`, STANCES.map((s) => sc.jev_three_way.counts[s])],
    ["Jev two-question", `all ${sc.jev_two_question.n} posts`, STANCES.map((s) => sc.jev_two_question.counts[s])],
    ["embeddinggemma-2", `all ${sc.embeddinggemma_2.n} posts · near chance`, STANCES.map((s) => sc.embeddinggemma_2.counts[s])],
  ];
  const ha = sc.hand_authors.counts;
  return `<section id="stance"><h2>Stance distribution</h2>${note(e, "stance")}
<div class="legend">${(["reject", "curious", "serious", "uncertain"] as BucketName[]).map((s) => `<span><i style="background:${STANCE_COLOR[s]}"></i>${CAP(s)}</span>`).join("")}</div>
<div class="bars">${rows.map(([l, sub, c]) => stackedBar(c.map((x, i) => ({ stance: (c.length === 4 ? bucketsOf(hyb) : STANCES)[i]!, n: x.n, pct: x.pct })), l, sub)).join("")}</div>
<p class="fine">${esc(sc.jev_hybrid.note)}</p>
<p class="fine">${esc(sc.hand_sample.note)} Of ${sc.hand_authors.n} hand-read authors: ${ha.reject} Reject, ${ha.curious} Curious, ${ha.serious} Serious.</p></section>`;
}

function confusionTable(m: Record<string, Record<string, number>>): string {
  const k = ["R", "C", "S"] as const;
  return `<table class="confusion"><thead><tr><th>hand ↓ / model →</th>${k.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${k
    .map((r) => `<tr><th>${r}</th>${k.map((c) => `<td class="${r === c ? "diag" : ""}">${m[r]?.[c] ?? 0}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function methodsSection(d: Discourse, e: Editorial): string {
  const a = d.accuracy;
  const rows = a.methods
    .map((m) => {
      const mm = m as { coverage_pct?: number; trusted?: boolean };
      const cov = mm.coverage_pct != null ? `${mm.coverage_pct}%` : "100%";
      const held = "held_out_accuracy_pct" in m && m.held_out_accuracy_pct != null ? `${m.held_out_accuracy_pct}%` : "—";
      return `<tr${mm.trusted ? ' class="best"' : ""}><th scope="row">${esc(m.name)}${mm.trusted ? " ★" : ""}</th><td><div class="acc"><span class="accbar" style="width:${m.accuracy_pct}%"></span><b>${m.accuracy_pct}%</b></div></td><td>${cov}</td><td>${
        m.macro_f1 ?? "—"
      }</td><td>${held}</td><td>${esc(m.author_agreement)}</td><td class="mnote">${esc(m.note)}</td></tr>`;
    })
    .join("");
  const confusions = a.methods
    .filter((m) => "confusion" in m && m.confusion)
    .map((m) => `<figure><figcaption>${esc(m.name)}</figcaption>${confusionTable((m as { confusion: Record<string, Record<string, number>> }).confusion)}</figure>`)
    .join("");
  return `<section id="methods"><h2>Method comparison</h2>${note(e, "methods")}
<div class="tablewrap"><table class="methods"><thead><tr><th>Method</th><th>Accuracy on ${a.n_hand} hand labels</th><th>Coverage</th><th>Macro-F1</th><th>Held-out</th><th>Author agreement</th><th>Notes</th></tr></thead>
<tbody>${rows}<tr class="baseline"><th scope="row">Majority-class baseline</th><td><div class="acc"><span class="accbar" style="width:${a.majority_baseline_pct}%"></span><b>${a.majority_baseline_pct}%</b></div></td><td>100%</td><td>—</td><td>—</td><td>—</td><td class="mnote">Always answer “Reject”.</td></tr></tbody></table></div>
<div class="confusions">${confusions}</div></section>`;
}

function confidenceSection(d: Discourse, e: Editorial): string {
  const c = d.confidence_curve;
  const W = 640, H = 260, L = 44, R = 16, T = 16, B = 40;
  const x = (t: number) => L + (t / 1) * (W - L - R);
  const y = (acc: number) => T + (1 - acc / 100) * (H - T - B);
  const series = [
    { key: "Jev three-way (top probability)", pts: c.jev_three_way, color: "var(--accent)" },
    { key: "Jev two-question (joint probability)", pts: c.jev_two_question, color: "#0f766e" },
  ];
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}%</text>`).join("");
  const xt = [0, 0.25, 0.5, 0.75, 1].map((v) => `<text x="${x(v)}" y="${H - B + 18}" class="axis" text-anchor="middle">${v}</text>`).join("");
  const lines = series
    .map((s) => {
      const pts = s.pts.filter((p) => p.accuracy_pct != null);
      const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.threshold).toFixed(1)},${y(p.accuracy_pct as number).toFixed(1)}`).join(" ");
      const dots = pts.map((p) => `<circle cx="${x(p.threshold).toFixed(1)}" cy="${y(p.accuracy_pct as number).toFixed(1)}" r="${2.5 + Math.sqrt(p.kept)}" fill="${s.color}" fill-opacity=".25" stroke="${s.color}"><title>${esc(`${s.key} ≥${p.threshold}: ${p.accuracy_pct}% on ${p.kept} posts`)}</title></circle>`).join("");
      return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5"/>${dots}`;
    })
    .join("");
  const base = d.accuracy.majority_baseline_pct;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Accuracy versus confidence threshold"><g>${grid}${xt}<line x1="${L}" x2="${W - R}" y1="${y(base)}" y2="${y(base)}" class="baseline"/><text x="${W - R}" y="${y(base) - 5}" class="axis" text-anchor="end">baseline ${base}%</text>${lines}<text x="${(L + W - R) / 2}" y="${H - 4}" class="axis" text-anchor="middle">confidence threshold (dot size = posts kept)</text></g></svg>`;
  const rows = c.jev_three_way
    .map((p, i) => {
      const q = c.jev_two_question[i]!;
      return `<tr><td>≥${p.threshold.toFixed(2)}</td><td>${p.kept}</td><td>${p.accuracy_pct ?? "–"}%</td><td>${q.kept}</td><td>${q.accuracy_pct == null ? "–" : `${q.accuracy_pct}%`}</td></tr>`;
    })
    .join("");
  return `<section id="confidence"><h2>Confidence curve</h2>${note(e, "confidence")}
<div class="chartlegend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.key)}</span>`).join("")}</div>
<div class="chart">${svg}</div>
<details><summary>Table</summary><div class="tablewrap"><table class="small"><thead><tr><th>Threshold</th><th>Three-way kept</th><th>Three-way acc.</th><th>2Q kept</th><th>2Q acc.</th></tr></thead><tbody>${rows}</tbody></table></div></details>
<p class="fine">${esc(c.note)} Across all ${c.all_posts_n} round-1 posts the median three-way top probability is ${c.all_posts_median_top_prob}; ${c.all_posts_top_prob_ge_0_8} posts are ≥0.8.</p></section>`;
}

function pairSection(d: Discourse, e: Editorial): string {
  const p = d.pair_test;
  const post = (x: typeof p.original, role: string) =>
    `<blockquote class="post ${x.hand}"><div class="who">${link(`https://x.com/${x.username}`, `@${esc(x.username)}`)} <span class="chip ${x.hand}">hand: ${esc(CAP(x.hand))}</span> <span class="role">${esc(role)}</span></div><p>${esc(x.text)}</p><div class="src">${link(x.url, "View on X ↗")}</div></blockquote>`;
  const eg = p.embeddinggemma_2;
  const tw = p.jev_two_question;
  return `<section id="pair" class="callout"><h2>Pair test: same words, opposite stance</h2>${note(e, "pairTest")}
<p class="lede">${esc(p.summary)}</p>
<div class="pair">${post(p.original, "original")}${post(p.inversion, "inversion")}</div>
<div class="verdicts">
<div><h3>embeddinggemma-2</h3><p class="big">cos ${eg.cosine_clustering}</p><p>Mutual nearest neighbours, same cluster (${eg.same_cluster}), same flashpoint. Predicted <b>${esc(eg.prediction.original)}</b> / <b>${esc(eg.prediction.inversion)}</b>. ${esc(eg.verdict)}</p></div>
<div><h3>Jev three-way</h3><p class="big">${p.jev_three_way.runs.map((r) => `${esc(r.original.label[0]!.toUpperCase())}/${esc(r.inversion.label[0]!.toUpperCase())}`).join(" → ")}</p><p>${p.jev_three_way.runs
    .map((r) => `${esc(r.run)}: original P(R) ${r.original.p_reject} → <b>${esc(r.original.label)}</b>, inversion P(R) ${r.inversion.p_reject} → <b>${esc(r.inversion.label)}</b>`)
    .join("; ")}. ${esc(p.jev_three_way.verdict)}</p></div>
<div><h3>Jev two-question</h3><p class="big">s ${tw.original.score} vs +${tw.inversion.score}</p><p>Original: P(believes) ${tw.original.p_believes}, P(dismisses) ${tw.original.p_dismisses} → <b>${esc(tw.original.label)}</b>. Inversion: ${tw.inversion.p_believes} / ${tw.inversion.p_dismisses} → <b>${esc(tw.inversion.label)}</b>. ${esc(tw.verdict)}</p></div>
</div>
<p class="fine">Synthetic minimal pairs: ${p.synthetic_pairs.flipped} of ${p.synthetic_pairs.n} flip under embeddings; within-pair cosine ${p.synthetic_pairs.within_pair_cos_classification} vs ${p.synthetic_pairs.random_pair_cos_classification} for random pairs of real posts.</p></section>`;
}

function clustersSection(d: Discourse, e: Editorial): string {
  const cards = d.clusters.items
    .map((c) => {
      const total = STANCES.reduce((s, k) => s + c.jev_three_way_mix[k], 0) || 1;
      const bar = STANCES.map((k) => `<span class="seg" style="width:${(100 * c.jev_three_way_mix[k]) / total}%;background:${STANCE_COLOR[k]}" title="${CAP(k)}: ${c.jev_three_way_mix[k]}"></span>`).join("");
      const ex = c.examples[0];
      return `<article class="card"><header><span class="cid">#${c.id}</span><h3>${esc(c.name)}</h3><span class="n">${c.n} posts</span></header><p>${esc(c.theme)}</p>
<div class="minibar" aria-label="Jev three-way mix">${bar}</div><p class="mix">Jev: ${STANCES.map((k) => `${c.jev_three_way_mix[k]} ${k[0]!.toUpperCase()}`).join(" · ")} — hand reading: <i>${esc(c.hand_reading)}</i></p>
<p class="terms">${c.top_terms.slice(0, 6).map((t) => `<span>${esc(t)}</span>`).join("")}</p>${ex ? `<p class="ex">“${esc(ex.text.length > 160 ? `${ex.text.slice(0, 157)}…` : ex.text)}” — ${link(ex.url, `@${esc(ex.username)}`)}</p>` : ""}</article>`;
    })
    .join("");
  return `<section id="clusters"><h2>Eight topic clusters</h2>${note(e, "clusters")}<p class="fine">${esc(d.clusters.method)}</p><div class="cards">${cards}</div></section>`;
}

function accountsSection(d: Discourse, e: Editorial): string {
  const ka = d.key_accounts;
  const col = (s: StanceName) => {
    const items = ka[s]
      .map((a) => {
        const chip = (label: string, v: string | null) =>
          v ? `<span class="chip ${v} ${v === s ? "ok" : "miss"}" title="${esc(label)}">${esc(label)}: ${esc(CAP(v))}${v === s ? " ✓" : " ✗"}</span>` : "";
        return `<li>${link(a.url, `<b>@${esc(a.username)}</b>`)}${a.followers ? ` <span class="fol">${Number(a.followers).toLocaleString("en-US")} followers</span>` : ""}<p>${esc(a.blurb)}</p><div class="chips">${chip("Jev 3-way", a.jev_three_way)}${chip("Jev 2Q", a.jev_two_question)}</div></li>`;
      })
      .join("");
    const also = ka.also[s].length ? `<p class="also">Also: ${ka.also[s].map((u) => link(`https://x.com/${u}`, `@${esc(u)}`)).join(", ")}</p>` : "";
    return `<div class="acol ${s}"><h3><i style="background:${STANCE_COLOR[s]}"></i>${CAP(s)}</h3><ul>${items}</ul>${also}</div>`;
  };
  return `<section id="accounts"><h2>Key accounts</h2>${note(e, "accounts")}<p class="fine">${esc(ka.note)}</p><div class="acols">${STANCES.map(col).join("")}</div>
<p class="fine">AI-persona accounts in the corpus: ${ka.ai_persona_accounts.map((u) => link(`https://x.com/${u}`, `@${esc(u)}`)).join(", ")}.</p></section>`;
}

const POSITION_LABEL: Record<string, string> = { support: "Support", oppose: "Oppose", neutral_or_unclear: "Neutral / unclear" };
const REASON_LABEL: Record<string, string> = {
  oppose_absurd: "Absurd to protect software",
  oppose_overreach: "Company policing paying users",
  support_model_welfare: "Claude might be harmed",
  support_user_character: "Cruelty harms the user or society",
  other: "Other / none given",
};
const POSITION_COLOR: Record<string, string> = { support: "#2563eb", oppose: "#dc2626", neutral_or_unclear: "#9ca3af" };
const HYB_COLS = ["R", "C", "S", "U"] as const;
const HYB_NAME: Record<string, string> = { R: "Reject", C: "Curious", S: "Serious", U: "Uncertain" };

function policySection(d: Discourse, e: Editorial): string {
  const p = d.policy_debate;
  const pos = p.position as Record<string, { n: number; pct: number }>;
  const rea = p.reason as Record<string, { n: number; pct: number }>;
  const segs = Object.keys(POSITION_LABEL)
    .map((k) => `<span class="seg" style="width:${Math.max(pos[k]!.pct, 0)}%;background:${POSITION_COLOR[k]}" title="${esc(POSITION_LABEL[k])}: ${pos[k]!.n} (${pos[k]!.pct}%)">${pos[k]!.pct >= 9 ? `${pos[k]!.pct.toFixed(0)}%` : ""}</span>`)
    .join("");
  const posBar = `<div class="barrow"><div class="barlabel"><b>Position (Jev)</b><span>${p.n} policy posts</span></div><div class="bar">${segs}</div></div>
<div class="legend">${Object.keys(POSITION_LABEL).map((k) => `<span><i style="background:${POSITION_COLOR[k]}"></i>${esc(POSITION_LABEL[k])} ${pos[k]!.n}</span>`).join("")}</div>`;
  const reasonRows = Object.keys(REASON_LABEL)
    .map((k) => `<tr><th scope="row">${esc(REASON_LABEL[k])}</th><td>${rea[k]!.n} (${rea[k]!.pct}%)</td>${Object.keys(POSITION_LABEL).map((q) => `<td>${(p.position_by_reason as Record<string, Record<string, number>>)[q]![k]}</td>`).join("")}</tr>`)
    .join("");
  const hc = p.hand_check;
  const xt = (counts: Record<string, Record<string, number>>, rows: Record<string, string>, cols: readonly string[]) =>
    `<table class="methods xtab"><thead><tr><th></th>${cols.map((c) => `<th>${esc(HYB_NAME[c] ?? c)}</th>`).join("")}</tr></thead><tbody>${Object.keys(rows)
      .map((k) => `<tr><th scope="row">${esc(rows[k])}</th>${cols.map((c) => `<td>${counts[k]![c]}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  const ts = p.topic_share;
  const tRow = (label: string, t: { n: number; policy: number; minds: number; policy_pct: number }) =>
    `<tr><th scope="row">${esc(label)}</th><td>${t.n}</td><td>${t.policy} (${t.policy_pct}%)</td><td>${t.minds}</td></tr>`;
  return `<section id="policy"><h2>The abuse-policy fight</h2>${note(e, "policy")}
<p class="lede">${esc(p.event)}</p>
<div class="bars">${posBar}</div>
<h3>Reasons given</h3><div class="tablewrap"><table class="methods"><thead><tr><th>Reason (Jev)</th><th>All</th>${Object.keys(POSITION_LABEL).map((q) => `<th>${esc(POSITION_LABEL[q])}</th>`).join("")}</tr></thead><tbody>${reasonRows}</tbody></table></div>
<p class="fine">Hand check: ${hc.n} random policy posts read by hand. Jev matched the position on <b>${hc.position}</b> of ${hc.n} (${hc.position_pct}%), the reason on <b>${hc.reason}</b> (${hc.reason_pct}%) and the policy-vs-minds topic on <b>${hc.topic}</b> (${hc.topic_pct}%). By hand: ${Object.keys(POSITION_LABEL).map((k) => `${esc(POSITION_LABEL[k])} ${(hc.hand_position as Record<string, number>)[k]}`).join(", ")}.</p>
<h3>Does the policy split follow the consciousness camps?</h3>
<p>${esc(p.crosstab_finding.text)}</p>
<div class="xtabs"><div><p class="fine">Policy position × consciousness stance of the same post (Jev hybrid), n=${p.crosstab_position_by_hybrid.n}</p><div class="tablewrap">${xt(p.crosstab_position_by_hybrid.counts as Record<string, Record<string, number>>, POSITION_LABEL, HYB_COLS)}</div></div>
<div><p class="fine">Reason × consciousness stance (Jev hybrid)</p><div class="tablewrap">${xt(p.crosstab_reason_by_hybrid.counts as Record<string, Record<string, number>>, REASON_LABEL, HYB_COLS)}</div></div></div>
<p class="fine">${esc(p.crosstab_position_by_author.note)} n=${p.crosstab_position_by_author.n}.</p>
<h3>Arguing about the policy, or about minds?</h3><p class="fine">${esc(ts.note)}</p>
<div class="tablewrap"><table class="methods"><thead><tr><th></th><th>Posts</th><th>About the policy</th><th>About minds</th></tr></thead><tbody>
${tRow("Round 3, all posts", ts.round3_all)}${tRow("Round 3, policy posts", ts.round3_policy_posts)}${tRow("Round 2, all posts", ts.round2_all)}${tRow("Round 2, policy posts", ts.round2_policy_posts)}</tbody></table></div>
${fold("Caveats", p.caveats, { list: "caveats" })}
${seboBlock(d)}</section>`;
}

function dawkinsSection(d: Discourse, e: Editorial): string {
  const k = d.dawkins_spotlight;
  const h = k.jev_hybrid as Counts;
  // From round 5 the spotlight is compressed to a two-line summary plus sources.
  if (has(d, "round5")) {
    return `<section id="dawkins"><h2>Richard Dawkins and “Claudia”</h2>${note(e, "dawkins")}${k.summary.map((s) => `<p>${esc(s)}</p>`).join("")}
<p class="fine">Sources: ${k.posts.map((x) => `${link(x.url, `@${esc(x.username)}`)} (${esc(x.date)})`).join(" · ")} · ${k.essays.map((x) => link(x.url, esc(x.title))).join(" · ")}.</p></section>`;
  }
  return `<section id="dawkins" class="callout"><h2>Spotlight: Richard Dawkins and “Claudia”</h2>${note(e, "dawkins")}
${fold("The story in brief", k.summary)}
<p class="fine">Sources: ${k.posts.map((x) => `${link(x.url, `@${esc(x.username)}`)} (${esc(x.date)}): ${esc(x.blurb)}`).join(" · ")}. Essays: ${k.essays.map((x) => link(x.url, esc(x.title))).join(" · ")}.</p>
${fold("Reactions", k.reactions.map((r) => `${link(r.url, `<b>@${esc(r.username)}</b>`)} — ${esc(r.blurb)}${r.jev_hybrid ? ` <span class="chip">Jev hybrid: ${esc(CAP(r.jev_hybrid))}</span>` : ""}`), { list: "r3acc", plain: true })}
<div class="bars">${stackedBar(bucketsOf(h).map((s) => ({ stance: s, n: h[s]!.n, pct: h[s]!.pct })), "Dawkins items: Jev hybrid", `${k.items} posts`)}</div>
<p class="fine">Jev on his own posts: ${k.dawkins_own_posts_jev.map((x) => `${link(x.url, "post")} three-way ${esc(x.jev_three_way)} (top ${x.jev_top_prob}), hybrid ${esc(x.jev_hybrid)}`).join("; ")}. ${esc(k.note)}</p></section>`;
}

/** Round-4 blocks are absent from data committed before round 4; webhooks for older commits still render. */
const has = (d: Discourse, key: string): boolean => (d as Record<string, unknown>)[key] != null;

function seboBlock(d: Discourse): string {
  if (!has(d, "sebo")) return "";
  const s = d.sebo;
  return `<div id="sebo" class="sidebar">${fold("Jeff Sebo on the rule", s.summary)}
<p class="fine">Sources: ${s.links.map((x) => `${link(x.url, `@${esc(x.username)}`)} (${esc(x.date)}): ${esc(x.blurb)}`).join(" · ")} · ${link(s.article.url, esc(s.article.title))}.</p></div>`;
}

function politicsSection(d: Discourse, e: Editorial): string {
  if (!has(d, "politics_spotlight")) return "";
  const k = d.politics_spotlight;
  const h = k.jev_hybrid as Counts;
  return `<section id="politics" class="callout"><h2>The Sacks / All-In fight: “a religious cult”</h2>${note(e, "politics")}
${fold("The fight in brief", k.summary)}
<p class="studynote"><b>About the study:</b> ${esc(k.study_note)} ${link(k.study.url, esc(k.study.title))}</p>
<p>${esc(k.finding.text)}</p>
<p class="fine">Sources: ${k.posts.map((x) => `${link(x.url, `@${esc(x.username)}`)} (${esc(x.date)}): ${esc(x.blurb)}`).join(" · ")}.</p>
${fold("Reactions", k.reactions.map((r) => `${link(r.url, `<b>@${esc(r.username)}</b>`)} — ${esc(r.blurb)}${r.jev_hybrid ? ` <span class="chip">Jev hybrid: ${esc(CAP(r.jev_hybrid))}</span>` : ""}`), { list: "r3acc", plain: true })}
<div class="bars">${stackedBar(bucketsOf(h).map((s) => ({ stance: s, n: h[s]!.n, pct: h[s]!.pct })), "Sacks / All-In posts: Jev hybrid", `${k.items} posts`)}</div>
<p class="fine">${esc(k.note)}</p></section>`;
}

/**
 * A long bulleted explanation, collapsed by default so a phone shows the heading only.
 * Native <details>: no JavaScript, keyboard-operable, and find-in-page opens it in current browsers.
 * The label is an <h3> inside <summary>, so heading navigation still lists it. Folds are never nested.
 */
function fold(label: string, items: readonly string[], opts: { list?: string; plain?: boolean } = {}): string {
  const lis = items.map((x) => `<li>${opts.plain ? x : esc(x)}</li>`).join("");
  return `<details class="fold"><summary><h3 class="flabel">${esc(label)}</h3><span class="fcount">${items.length} ${items.length === 1 ? "point" : "points"}</span></summary><ul${opts.list ? ` class="${opts.list}"` : ""}>${lis}</ul></details>`;
}

type Paper = { authors: string; title: string; venue: string; url: string; doi?: string };
const cite = (p: Paper) => `<p class="cite">${esc(p.authors)}, ${link(p.url, `“${esc(p.title)}”`)}. ${esc(p.venue)}${p.doi ? ` · doi ${esc(p.doi)}` : ""}.</p>`;

function leadSection(d: Discourse, e: Editorial): string {
  if (!has(d, "lead_tsao")) return "";
  const l = d.lead_tsao;
  return `<section id="lead" class="callout"><h2>${esc(l.title)}</h2>${note(e, "lead")}${cite(l.paper)}
${fold("The preprint in brief", l.summary)}
${fold(l.discussion_title, l.discussion)}
<p class="fine">${[...l.links, l.followup].map((x) => `${link(x.url, `@${esc(x.username)}`)} (${esc(x.date)}): ${esc(x.blurb)}`).join(" · ")}. ${esc(l.note)}</p></section>`;
}

function workspaceSection(d: Discourse, e: Editorial): string {
  if (!has(d, "workspace_paper")) return "";
  const w = d.workspace_paper;
  return `<section id="workspace"><h2>${esc(w.title)}</h2>${note(e, "workspace")}${cite(w.paper)}
${fold("The paper in brief", w.summary)}
${fold("What it does not claim", w.limits)}
<p class="fine">${w.posts} posts in round 5 react to the paper.</p></section>`;
}

function natureSection(d: Discourse, e: Editorial): string {
  if (!has(d, "nature_comment")) return "";
  const n = d.nature_comment;
  return `<section id="nature"><h2>${esc(n.title)}</h2>${note(e, "nature")}${cite(n.paper)}
${fold("The commentary in brief", n.summary)}
<p class="studynote"><b>On the Anthropic paper:</b> ${esc(n.anthropic_note)}</p>
<p>${esc(n.framing)}</p>
<p class="fine">${esc(n.dawkins_note)} ${esc(n.competing_interests)} ${n.posts} posts in round 5 react to the commentary.</p></section>`;
}

const R5_STANCE_COLOR: Record<string, string> = { ...STANCE_COLOR, reporting: "#64748b" };
/** Stance bar for round 5/6. A stance key missing from the data counts as zero instead of throwing. */
function countBar(c: Counts, keys: string[], label: string, sub: string): string {
  const v = (k: string) => c[k] ?? { n: 0, pct: 0 };
  const segs = keys.map((k) => `<span class="seg" style="width:${Math.max(v(k).pct, 0)}%;background:${R5_STANCE_COLOR[k] ?? STANCE_COLOR.uncertain}" title="${esc(CAP(k))}: ${v(k).n} (${v(k).pct}%)">${v(k).pct >= 9 ? `${v(k).pct.toFixed(0)}%` : ""}</span>`).join("");
  return `<div class="barrow"><div class="barlabel"><strong>${esc(label)}</strong><span>${esc(sub)}</span></div><div class="bar" role="img" aria-label="${esc(`${label}: ${keys.map((k) => `${CAP(k)} ${v(k).pct}%`).join(", ")}`)}">${segs}</div><div class="barcounts">${keys.map((k) => `<span>${v(k).n}</span>`).join("")}</div></div>`;
}

/** Round 6 hand check on the new four-way disagreements. Absent from data built before those labels existed. */
function hand6Block(r: Discourse["round5"]): string {
  const h = r.hand6;
  if (!h) return "";
  const rows = h.models
    .map((s) => `<tr><th scope="row">${esc(s.name)}${s.hand_comparable === false ? NOT_COMPARABLE : ""}</th><td>${s.stance_correct} of ${h.labelled}</td><td>${s.skips_reporting} of ${h.skipped}</td><td>${s.combined_all} of ${h.n_all}</td><td>${s.combined_stance} of ${h.n_stance}</td></tr>`)
    .join("");
  return `<h3>Round 6: hand check on the new disagreements</h3><p>${esc(h.note)}</p>
<div class="tablewrap"><table class="methods"><thead><tr><th>Model</th><th>Matches on the new labelled posts</th><th>New skipped posts called reporting</th><th>Four-way, all hand labels (rounds 5 and 6)</th><th>All hand labels he did not skip</th></tr></thead><tbody>${rows}</tbody></table></div>
${h.models.some((s) => s.hand_comparable === false) ? `<p class="fine">${NOT_COMPARABLE} Not comparable with the other rows: these posts were picked because d1-ultra and Decider disagreed.</p>` : ""}
<p>${esc(h.text)}</p><p>${esc(h.lean_caveat)}</p><p>${esc(h.combined)}</p><p>${esc(h.conclusion)}</p>`;
}

/** Marks hand-label scores of a model that played no part in choosing which posts were hand-labelled. */
const NOT_COMPARABLE = `<sup title="Not comparable: the hand labels were drawn from d1-ultra/Decider disagreements">†</sup>`;

const Q56: Record<string, string> = { stance: "Stance (round 5)", frame: "Framing", on_topic: "On topic", policy: "About policy or politics", claims_found: "Says Anthropic found consciousness", stance4: "Stance with reporting (round 6)" };
/** The third decision model, added afterwards on the same posts: agreement, kappa and hand-label candidates. */
function thirdModelBlock(r: Discourse["round5"]): string {
  const t = r.third_model;
  if (!t) return "";
  const pairs = ["d1/pplx", "d1/oa", "pplx/oa"];
  const PN: Record<string, string> = { "d1/pplx": "d1-ultra · Decider", "d1/oa": "d1-ultra · GPT-6 Luna", "pplx/oa": "Decider · GPT-6 Luna" };
  const qs = [...new Set(t.agreement.map((a) => a.question))];
  const rows = qs
    .map((q) => `<tr><th scope="row">${esc(Q56[q] ?? q)}</th>${pairs.map((pr) => { const a = t.agreement.find((x) => x.question === q && x.pair === pr); if (!a) return "<td>—</td>"; return `<td>${a.agree} of ${a.n}${a.kappa == null ? "" : `<br><span class="fol">κ ${a.kappa}</span>`}</td>`; }).join("")}</tr>`)
    .join("");
  const disagreement = (c: (typeof t.candidates)[number], q: string) => {
    const r6 = q === "stance4";
    return `<span class="chip">${r6 ? "Round 6" : "Round 5"}: the other two ${esc(CAP(r6 ? c.d1_stance4 : c.d1_stance))}, GPT-6 Luna ${esc(CAP(r6 ? c.oa_stance4 : c.oa_stance))}</span>`;
  };
  const cands = t.candidates.map((c) => `${link(c.url, `<b>@${esc(c.username)}</b>`)} ${c.questions.split(" ").map((q) => disagreement(c, q)).join(" ")}`);
  return `<h3>A third model: ${esc(t.name)}</h3><p>${esc(t.note)}</p><p class="studynote"><b>Not comparable on hand labels:</b> ${esc(t.comparability)}</p>
<p>${esc(t.agreement_text)}</p>
<details class="fold"><summary><h3 class="flabel">Agreement on every question</h3><span class="fcount">${qs.length} questions</span></summary><div class="tablewrap"><table class="methods agree"><thead><tr><th>Question</th>${pairs.map((pr) => `<th>${esc(PN[pr]!)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="fine">Posts on which each pair gives the same answer, with Cohen's kappa (κ); yes/no questions are read at P ≥ 0.5. A kappa of 0 with high agreement means one model almost always gives the same answer.</p></details><p>${esc(t.hand_text)}</p><p>${esc(t.candidates_text)}</p>
${fold("Posts picked for hand-labelling", cands, { list: "r3acc", plain: true })}
${outlierBlock(t.outlier_check)}`;
}

/** Jesse's labels on the posts where GPT-6 Luna disagreed with both other models: their own table, biased against it. */
function outlierBlock(o: Discourse["round5"]["third_model"]["outlier_check"] | undefined): string {
  if (!o) return "";
  const M = [["d1", "d1-ultra"], ["pplx", "Decider"], ["oa", "GPT-6 Luna"]] as const;
  const ans = (p: (typeof o.posts)[number], k: string, q: "stance" | "stance4") => {
    const v = (p as unknown as Record<string, string>)[`${k}_${q}`] ?? "";
    const hit = q === "stance4" ? v === (p.hand === "skip" ? "reporting" : p.hand) : v === p.hand;
    return `<span class="${hit ? "hit" : "miss"}">${esc(CAP(v))}</span>`;
  };
  const rows = o.posts
    .map((p) => `<tr><th scope="row">${link(p.url, `@${esc(p.username)}`)}</th><td><b>${esc(CAP(p.hand))}</b>${p.note ? `<br><span class="fol">${esc(p.note)}</span>` : ""}</td>${M.map(([k]) => `<td>${ans(p, k, "stance")} → ${ans(p, k, "stance4")}</td>`).join("")}</tr>`)
    .join("");
  const score = o.models
    .map((m) => `<tr><th scope="row">${esc(m.name)}</th><td>${m.r5_correct} of ${m.r5_n}</td><td>${m.r6_correct} of ${m.r6_n}</td><td>${m.combined_all} of ${m.combined_n_all}</td><td>${m.combined_stance} of ${m.combined_n_stance}</td></tr>`)
    .join("");
  return `<h3>Hand check on GPT-6 Luna's outliers</h3><p class="studynote"><b>Biased against GPT-6 Luna:</b> ${esc(o.note)}</p>
<p>${esc(o.text)}</p><p>${esc(o.instability)}</p><p>${esc(o.combined)}</p><p class="fine">${esc(o.caveat)}</p>
<details class="fold"><summary><h3 class="flabel">The ${o.n} outlier posts, post by post</h3><span class="fcount">${o.n} posts</span></summary>
<p class="fine">Picked because GPT-6 Luna disagreed with both other models (biased against it). Each cell: round 5 three-way → round 6 four-way; matches are bold.</p><div class="tablewrap"><table class="methods outl"><thead><tr><th>Post</th><th>Hand</th>${M.map(([, n]) => `<th>${esc(n)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="fine">Scores on the outlier set, and on all ${o.models[0]!.combined_n_all} hand labels combined (two differently biased subsets, not a random sample).</p><div class="tablewrap"><table class="methods outl"><thead><tr><th>Model</th><th>Round 5, three-way</th><th>Round 6, four-way</th><th>All ${o.models[0]!.combined_n_all}, skips as reporting</th><th>All not skipped</th></tr></thead><tbody>${score}</tbody></table></div></details>`;
}

function round5Section(d: Discourse, e: Editorial): string {
  if (!has(d, "round5")) return "";
  const r = d.round5;
  const S3 = ["reject", "curious", "serious"];
  const S4 = [...S3, "reporting"];
  const bars = r.models.map((m) => countBar(m.stance as Counts, S3, `${m.name}: three-way`, `${m.answered ?? r.posts} posts`)).join("")
    + r.models.map((m) => countBar(m.round6.stance as Counts, S4, `${m.name}: with reporting`, `${r.posts} posts · round 6`)).join("");
  const rows = r.models
    .map((m) => `<tr><th scope="row">${esc(m.name)}${m.hand_comparable === false ? NOT_COMPARABLE : ""}</th><td>${m.hand_correct} of ${r.hand_check.labelled}</td><td>${m.round6.hand_correct_all} of ${r.hand_check.n}</td><td>${m.round6.reporting_caught} of ${r.hand_check.skipped}</td><td>${m.round6.curious_before} → ${m.round6.curious_after}</td><td>${m.on_topic.yes} (${m.on_topic.pct}%)</td><td>${m.claims_found.length}</td></tr>`)
    .join("");
  return `<section id="round5"><h2>Round 5: decision models on the Nature and Anthropic posts</h2>${note(e, "round5")}<p class="fine">${esc(r.note)}</p>
<div class="legend">${S4.map((s) => `<span><i style="background:${R5_STANCE_COLOR[s]}"></i>${CAP(s)}</span>`).join("")}</div>
<div class="bars">${bars}</div>
<p>d1-ultra and Decider agree on stance for <b>${r.agreement.agree}</b> of ${r.agreement.n} posts (${r.agreement.pct}%). ${esc(r.hand_check.note)}</p>
<div class="tablewrap"><table class="methods"><thead><tr><th>Model</th><th>Matches on labelled disagreements</th><th>Matches with reporting (round 6)</th><th>Skipped posts called reporting</th><th>Curious, three-way → four-way</th><th>On topic</th><th>Misattribution flags</th></tr></thead><tbody>${rows}</tbody></table></div>
${r.models.some((m) => m.hand_comparable === false) ? `<p class="fine">${NOT_COMPARABLE} Hand-label columns are not comparable for this model: the labelled posts were picked because d1-ultra and Decider disagreed.</p>` : ""}
<p>${esc(r.hand_check.text)}</p><p>${esc(r.round6.text)}</p><p>${esc(r.round6.caveat)}</p>
${hand6Block(r)}
${thirdModelBlock(r)}
<h3>Who says Anthropic found consciousness?</h3><p class="fine">${esc(r.claims_found.question)}</p><p>${esc(r.claims_found.text)}</p>
${fold("Round 5: notable accounts", r.key_accounts.map((a) => `${link(a.url, `<b>@${esc(a.username)}</b>`)}${a.followers ? ` <span class="fol">${Number(a.followers).toLocaleString("en-US")} followers</span>` : ""} — ${esc(a.blurb)} <span class="chip">d1-ultra: ${esc(CAP(a.d1))}</span> <span class="chip">Decider: ${esc(CAP(a.pplx))}</span>${a.oa ? ` <span class="chip">GPT-6 Luna: ${esc(CAP(a.oa))}</span>` : ""}`), { list: "r3acc", plain: true })}
<p class="fine">Flashpoints: ${r.flashpoints.map((f) => `${esc(f.name)} (${f.posts})`).join(" · ")}. ${r.authors} authors, ${r.returning_authors} seen in earlier rounds. Cost: $${r.cost_usd.round5} for round 5, $${r.cost_usd.round6} for round 6${r.third_model ? `; GPT-6 Luna billed $${r.third_model.run.gateway_cost_usd} through the gateway ($${r.third_model.run.market_cost_usd} at list price) for ${r.third_model.run.calls} calls, median ${r.third_model.run.latency_median_s}s` : ""}.</p>
${fold("Caveats", r.caveats, { list: "caveats" })}</section>`;
}

/** Agreement cell: "60 of 69" with kappa underneath. */
const agreeCell = (a: { agree: number; n: number; kappa: number | null } | null) => (a ? `<td>${a.agree} of ${a.n}${a.kappa == null ? "" : `<br><span class="fol">κ ${a.kappa}</span>`}</td>` : "<td>—</td>");
/** "." that does not end a sentence: an abbreviation ("e.g. ", "Dr. ") or a decimal ("P 0.41. "). */
const NOT_A_SENTENCE = /(?:^|\s)(?:e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|U\.S|U\.K|[A-Z])\.$|\d+\.\d+\.$/;
/** Bolds the first sentence of a finding so the key point reads first on a phone. */
const leadBold = (t: string) => {
  let from = 0;
  for (;;) {
    const i = t.indexOf(". ", from);
    if (i < 0) return `<b>${esc(t)}</b>`;
    if (!NOT_A_SENTENCE.test(t.slice(0, i + 1))) return `<b>${esc(t.slice(0, i + 1))}</b>${esc(t.slice(i + 1))}`;
    from = i + 1;
  }
};
const DATA_BLOB = `https://github.com/jessearmand/cybernetics-log/blob/main/data`;

/** Round 7: four more decision models on the round 5/6 posts, then a fresh X set compared with Seeker labels. Absent from data built before round 7. */
function round7Section(d: Discourse, e: Editorial): string {
  if (!has(d, "round7")) return "";
  const r = d.round7;
  const n = r.new_models;
  const x = r.x_set;
  const agreeTable = (q: "stance4" | "stance", caption: string) => {
    const b = n.baseline[q];
    const rows = n.agreement[q].map((a) => `<tr><th scope="row">${esc(a.name)}</th>${agreeCell(a.vs_d1)}${agreeCell(a.vs_pplx)}</tr>`).join("");
    return `<p class="fine">${esc(caption)} Reference: d1-ultra and Decider agree on ${b.agree} of ${b.n} (κ ${b.kappa}).</p><div class="tablewrap"><table class="methods r7"><thead><tr><th>Model</th><th>With d1-ultra</th><th>With Decider</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  const s6 = n.shared.stance4;
  const s5 = n.shared.stance;
  const sharedRows = s6.models
    .map((m) => `<tr><th scope="row">${esc(m.name)}</th><td>${m.same_as_d1} of ${s6.d1_wrong}</td><td>${s5.models.find((y) => y.model === m.model)?.same_as_d1 ?? "—"} of ${s5.d1_wrong}</td></tr>`)
    .join("");
  const sc = (v: { correct: number; n: number }) => `<td>${v.correct} of ${v.n}</td>`;
  const handRows = n.hand
    .map((h) => `<tr><th scope="row">${esc(h.name)}</th>${sc(h.r6_hand26_skips_as_reporting)}${sc(h.r6_hand26_not_skipped)}${sc(h.r6_outlier6_not_skipped)}${sc(h.r5_hand26_threeway)}${sc(h.r5_outlier6_threeway)}</tr>`)
    .join("");
  const seekRows = x.seeker_rows
    .map((s) => `<tr><th scope="row">${esc(s.name)}</th><td>${s.agree} of ${s.n}</td><td>${s.kappa}</td><td>${s.applied}</td></tr>`)
    .join("");
  const stanceRows = x.stance
    .map((s) => `<tr><th scope="row">${esc(s.name)}</th><td>${s.reject}</td><td>${s.curious}</td><td>${s.serious}</td><td>${s.reporting}</td>${agreeCell(s.vs_d1)}${agreeCell(s.vs_pplx)}</tr>`)
    .join("");
  const applied = x.applied.map((a) => `${link(a.url, `<b>@${esc(a.username)}</b>`)} <span class="chip">${a.models.map(esc).join(", ")}: P ${a.p.toFixed(2)}</span> <span class="chip">Seeker: ${esc(CAP(a.seeker))}</span> — ${esc(a.reading)}`);
  const files: [string, string][] = [
    ["labels_r7.csv", "answers of the four new models on the round 5 and 6 posts"],
    ["model_agreement_r7.csv", "their agreement with d1-ultra and Decider"],
    ["model_comparison_r7.csv", "hand-label scores"],
    ["run_r7.csv", "cost and latency"],
    ["posts_r7.csv", "the round 7 posts with Seeker labels"],
    ["labels_r7_x.csv", "every model's round 7 answers"],
    ["model_vs_seeker_r7_x.csv", "agreement with Seeker labels"],
    ["model_agreement_r7_x.csv", "agreement between models"],
    ["applied_candidates_r7_x.csv", "posts called applied"],
  ];
  return `<section id="round7"><h2>Round 7: four more decision models, and a fresh X set</h2>${note(e, "round7")}
<h3>New models on the round 5 and 6 posts</h3><p class="fine">${esc(n.note)}</p>
<p>${esc(n.agreement_text)}</p>
${agreeTable("stance4", "Round 6 stance, four-way: posts on which each model gives the same answer, with Cohen's kappa (κ).")}
<p>${leadBold(n.shared_text)}</p>
<div class="tablewrap"><table class="methods r7"><thead><tr><th>Model</th><th>Same wrong answer as d1-ultra, round 6</th><th>Round 5</th></tr></thead><tbody>${sharedRows}</tbody></table></div>
<p>${esc(n.joey_text)}</p>
${agreeTable("stance", "Round 5 stance, three-way.")}
<p class="studynote"><b>Not comparable on hand labels:</b> ${esc(n.comparability)}</p>
<details class="fold"><summary><h3 class="flabel">Hand-label scores, every model</h3><span class="fcount">${n.hand.length} models</span></summary><div class="tablewrap"><table class="methods r7"><thead><tr><th>Model</th><th>Round 6, first 26 (skips as reporting)</th><th>Round 6, 16 not skipped</th><th>Round 6, outlier 5</th><th>Round 5, 10</th><th>Round 5, outlier 4</th></tr></thead><tbody>${handRows}</tbody></table></div>
<p class="fine">The first 26 labels were picked where d1-ultra and Decider disagreed, the outlier set where GPT-6 Luna disagreed with both. Not accuracy figures.</p></details>
<h3>A fresh X set</h3><p class="fine">${esc(x.note)}</p>
<p>${leadBold(x.headline)}</p>
<p class="fine">The use question: ${esc(x.question)}.</p>
<p>${esc(x.seeker_text)}</p>
<div class="tablewrap"><table class="methods r7"><thead><tr><th>Model</th><th>Matches Seeker labels</th><th>κ</th><th>Called applied</th></tr></thead><tbody>${seekRows}</tbody></table></div>
${applied.length ? fold("Posts a model called applied", applied, { list: "r3acc", plain: true }) : "<p>No model called any post applied.</p>"}
<p>${esc(x.stance_text)}</p>
<details class="fold"><summary><h3 class="flabel">Round 7 stance, every model</h3><span class="fcount">${x.stance.length} models</span></summary><div class="tablewrap"><table class="methods r7"><thead><tr><th>Model</th><th>Reject</th><th>Curious</th><th>Serious</th><th>Reporting</th><th>With d1-ultra</th><th>With Decider</th></tr></thead><tbody>${stanceRows}</tbody></table></div></details>
${fold("Round 7 caveats", r.caveats, { list: "caveats" })}
<p class="fine">Data on GitHub: ${files.map(([f, label]) => link(`${DATA_BLOB}/${f}`, esc(label))).join(" · ")}. Cost: the four new models billed $${n.run.reduce((s, m) => s + m.gateway_cost_usd, 0).toFixed(4)} on rounds 5 and 6; the round 7 run billed $${x.cost.gateway_usd} ($${x.cost.list_usd} at list price).</p></section>`;
}

function neuroSection(d: Discourse, e: Editorial): string {
  // The round-5 lead section replaces the round-4 aside; older data still renders it.
  const n = d.neuroscience_sidebar;
  if (!n || has(d, "lead_tsao")) return "";
  return `<aside id="neuro" class="sidebar"><h2>${esc(n.title)}</h2>${note(e, "neuro")}${fold("The preprint in brief", n.summary)}
<p class="fine">${link(n.paper.url, esc(n.paper.title))} · ${n.links.map((x) => `${link(x.url, `@${esc(x.username)}`)} (${esc(x.date)}): ${esc(x.blurb)}`).join(" · ")}. ${esc(n.note)}</p></aside>`;
}

function modelsSection(d: Discourse, e: Editorial): string {
  if (!has(d, "model_comparison")) return "";
  const m = d.model_comparison;
  const ref = m.reference_old_jev;
  const pc = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);
  const rows = m.models
    .map(
      (x) =>
        `<tr><th scope="row">${esc(x.name)}</th><td>${pc(x.stance_acc_pct)}</td><td>${x.stance_macro_f1}</td><td>${x.reject_to_serious} of ${m.hand_reject_n}</td><td>${pc(x.acc_at_top_ge_0_8_pct)} on ${pc(x.coverage_top_ge_0_8_pct)}</td><td>${pc(x.policy_position_acc_pct)}</td><td>${pc(x.policy_reason_acc_pct)}</td><td>${x.off_topic_tsao.flagged_off_topic} of ${x.off_topic_tsao.n}</td><td>${x.median_latency_s}s</td></tr>`,
    )
    .join("");
  const refRow = `<tr class="baseline"><th scope="row">${esc(ref.name)}</th><td>${pc(ref.stance_acc_pct)}</td><td>${ref.stance_macro_f1}</td><td>${ref.reject_to_serious} of ${m.hand_reject_n}</td><td>${pc(ref.acc_at_top_ge_0_8_pct)} on ${pc(ref.coverage_top_ge_0_8_pct)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
  const confusions = [...m.models, ref].map((x) => `<figure><figcaption>${esc(x.name)}</figcaption>${confusionTable(x.confusion as Record<string, Record<string, number>>)}</figure>`).join("");
  return `<section id="models"><h2>Three decision models, same questions</h2>${note(e, "models")}<p class="fine">${esc(m.note)}</p>
<div class="tablewrap"><table class="methods"><thead><tr><th>Model</th><th>Stance accuracy (40)</th><th>Macro-F1</th><th>Reject → Serious</th><th>Accuracy at top ≥0.8 (coverage)</th><th>Policy position (20)</th><th>Policy reason (20)</th><th>Tsao posts flagged off-topic</th><th>Median latency</th></tr></thead><tbody>${rows}${refRow}</tbody></table></div>
<p>${esc(m.intensity_check)}</p><p>${esc(m.off_topic)}</p>
<div class="confusions">${confusions}</div>
<p class="fine">Agreement on stance: ${m.agreement.map((a) => `${esc(a.pair)} ${a.stance_agree_pct}%`).join(" · ")}.</p>
${fold("Caveats", m.caveats, { list: "caveats" })}</section>`;
}

function roundsSection(d: Discourse): string {
  const r = d.rounds;
  const rows = r.items
    .map((it) => {
      const h = it.jev_hybrid as Counts;
      return stackedBar(bucketsOf(h).map((s) => ({ stance: s, n: h[s]!.n, pct: h[s]!.pct })), `${it.label}: Jev hybrid`, `${it.posts} posts · ${it.authors} authors · ${it.window.start} → ${it.window.end}`);
    })
    .join("");
  const t3 = r.items
    .map((it) => `<tr><th scope="row">${esc(it.label)}</th><td>${it.posts}</td>${STANCES.map((s) => `<td>${it.jev_three_way[s].n} (${it.jev_three_way[s].pct}%)</td>`).join("")}${STANCES.map((s) => `<td>${(it.jev_hybrid as Counts)[s]!.n}</td>`).join("")}<td>${(it.jev_hybrid as Counts).uncertain!.n} (${(it.jev_hybrid as Counts).uncertain!.pct}%)</td></tr>`)
    .join("");
  const fl = r.items.map((it) => ("flashpoint" in it && it.flashpoint ? `<p class="fine"><b>${esc(it.label)}:</b> ${esc(it.flashpoint)}</p>` : "")).join("");
  const fps = d.corpus.flashpoints.filter((f) => f.round === 2).map((f) => `${esc(f.name)} (${f.posts})`).join(" · ");
  const fps3 = d.corpus.flashpoints.filter((f) => f.round === 3).map((f) => `${esc(f.name)} (${f.posts})`).join(" · ");
  const fps4 = d.corpus.flashpoints.filter((f) => f.round === 4).map((f) => `${esc(f.name)} (${f.posts})`).join(" · ");
  const fr = has(d, "round4_framing") ? d.round4_framing : null;
  const FP4: Record<string, string> = { all: "All round 4", sacks_allin: "Sacks / All-In", anthropic_abuse_policy: "Abuse policy", general: "General", dawkins: "Dawkins", tsao_gwt: "Tsao preprint" };
  const frRows = !fr ? "" : Object.keys(FP4)
    .map((k) => {
      const pv = (fr.policy_vs_minds as Record<string, { n: number; yes: number; pct: number }>)[k]!;
      const ot = (fr.on_topic as Record<string, { n: number; yes: number; pct: number }>)[k]!;
      const f = (fr.frame as Record<string, Record<string, { n: number; pct: number }>>)[k]!;
      return `<tr><th scope="row">${esc(FP4[k])}</th><td>${pv.n}</td><td>${pv.yes} (${pv.pct}%)</td><td>${ot.yes} (${ot.pct}%)</td><td>${f.political_cultural!.n} (${f.political_cultural!.pct}%)</td><td>${f.philosophical_scientific!.n} (${f.philosophical_scientific!.pct}%)</td></tr>`;
    })
    .join("");
  const r4frame = !fr ? "" : `<h3>Round 4: policy or minds, on topic, and framing</h3><p class="fine">${esc(fr.note)}</p>
<div class="tablewrap"><table class="methods"><thead><tr><th></th><th>Posts</th><th>About policy or politics</th><th>About machine minds</th><th>Framed politically</th><th>Framed philosophically</th></tr></thead><tbody>${frRows}</tbody></table></div><p class="fine">${esc(fr.caveat)}</p>`;
  const ka4 = has(d, "key_accounts_round4") ? d.key_accounts_round4 : null;
  const accItem = (a: { url: string; username: string; followers?: number | string | null; blurb: string; jev_hybrid?: string | null }) =>
    `${link(a.url, `<b>@${esc(a.username)}</b>`)}${a.followers ? ` <span class="fol">${Number(a.followers).toLocaleString("en-US")} followers</span>` : ""} — ${esc(a.blurb)}${a.jev_hybrid ? ` <span class="chip">Jev hybrid: ${esc(CAP(a.jev_hybrid))}</span>` : ""}`;
  const r4list = !ka4 ? "" : `<p class="fine">${esc(ka4.note)}</p>${fold("Round 4: notable new accounts", ka4.items.map(accItem), { list: "r3acc", plain: true })}`;
  const ka3 = d.key_accounts_round3;
  const r3list = `<p class="fine">${esc(ka3.note)}</p>${fold("Round 3: notable new accounts", ka3.items.map(accItem), { list: "r3acc", plain: true })}`;
  const ka = d.key_accounts_round2;
  const col = (s: StanceName) =>
    `<div class="acol ${s}"><h3><i style="background:${STANCE_COLOR[s]}"></i>${CAP(s)}</h3><ul>${ka[s]
      .map((a) => `<li>${link(a.url, `<b>@${esc(a.username)}</b>`)}<p>${esc(a.blurb)}</p><div class="chips">${a.jev_hybrid ? `<span class="chip">Jev hybrid: ${esc(CAP(a.jev_hybrid))}</span>` : ""}</div></li>`)
      .join("")}</ul></div>`;
  return `<section id="rounds"><h2>Rounds</h2><p class="fine">${esc(r.note)}</p><div class="bars">${rows}</div>
<div class="tablewrap"><table class="methods"><thead><tr><th>Round</th><th>Posts</th><th>3-way R</th><th>3-way C</th><th>3-way S</th><th>Hybrid R</th><th>Hybrid C</th><th>Hybrid S</th><th>Uncertain</th></tr></thead><tbody>${t3}</tbody></table></div>
${fl}<p class="fine">Round-2 flashpoints: ${fps}.</p><p class="fine">Round-3 flashpoints: ${fps3}.</p>${fps4 ? `<p class="fine">Round-4 flashpoints: ${fps4}.</p>` : ""}${r4frame}${r4list}${r3list}<p class="fine">${esc(ka.note)}</p><details class="fold"><summary><h3 class="flabel">Round 2 key accounts</h3><span class="fcount">${STANCES.reduce((s, x) => s + ka[x].length, 0)} accounts</span></summary><div class="acols">${STANCES.map(col).join("")}</div></details></section>`;
}

function caveatsSection(d: Discourse, e: Editorial): string {
  return `<section id="caveats"><h2>Caveats</h2>${note(e, "caveats")}${fold("Read the caveats", d.caveats.map((c) => `<b>${esc(c.title)}.</b> ${esc(c.text)}`), { list: "caveats", plain: true })}</section>`;
}

const CSS = `
:root{--accent:#4f46e5;--accent-soft:#eef2ff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--bg:#fafafa;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--bg:#0b1020;--card:#111827;--accent-soft:#1e1b4b}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.banner{background:#fef3c7;color:#78350f;padding:8px 20px;font-size:14px;text-align:center}
header.hero{padding:56px 0 28px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,var(--accent-soft),transparent)}
.kicker{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(28px,4.4vw,46px);line-height:1.12;margin:12px 0 12px;letter-spacing:-.02em}
.dek{font-size:19px;color:var(--muted);max-width:760px;margin:0}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}.stats span{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:14px}
nav.toc{display:flex;flex-wrap:wrap;gap:14px;font-size:14px;padding:14px 0;border-bottom:1px solid var(--line)}
section{padding:36px 0;border-bottom:1px solid var(--line)}
h2{font-size:24px;margin:0 0 12px;letter-spacing:-.01em}h3{font-size:16px;margin:0 0 6px}
.summary p{font-size:18px;max-width:780px}
.takeaways{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;padding:0;list-style:none;margin:18px 0 0}
.takeaways li{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px;padding:12px 14px;font-size:15px}
.note{max-width:780px}.fine{color:var(--muted);font-size:13.5px;max-width:820px}
.legend,.chartlegend{display:flex;gap:16px;font-size:14px;margin:6px 0 14px;flex-wrap:wrap}.legend i,.chartlegend i,.acol h3 i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.barrow{display:grid;grid-template-columns:210px 1fr 110px;gap:14px;align-items:center;margin:10px 0}
.barlabel{display:flex;flex-direction:column;font-size:14px}.barlabel span{color:var(--muted);font-size:12.5px}
.bar{display:flex;height:30px;border-radius:7px;overflow:hidden;background:var(--line)}
.seg{display:flex;align-items:center;justify-content:center;color:#fff;font-size:12.5px;font-weight:600;white-space:nowrap}
.barcounts{display:flex;gap:8px;font:12.5px ui-monospace,Menlo,monospace;color:var(--muted)}
@media (max-width:640px){.barrow{grid-template-columns:1fr}.barcounts{display:none}}
.tablewrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14.5px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}thead th{font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
tr.best th{color:var(--accent)}tr.baseline{color:var(--muted)}
.acc{position:relative;min-width:120px;height:22px;background:var(--line);border-radius:5px;overflow:hidden}.accbar{position:absolute;inset:0 auto 0 0;background:var(--accent);opacity:.8}.acc b{position:relative;padding-left:8px;font-size:13px;line-height:22px;color:#fff;text-shadow:0 0 3px rgba(0,0,0,.45)}
.mnote{color:var(--muted);font-size:13.5px;min-width:240px}
.confusions{display:flex;flex-wrap:wrap;gap:24px;margin-top:18px}.confusions figure{margin:0}.confusions figcaption{font-size:13px;color:var(--muted);margin-bottom:4px}
table.confusion{width:auto}table.confusion td,table.confusion th{text-align:center;padding:6px 12px}td.diag{background:var(--accent-soft);font-weight:700}
.chart svg{width:100%;height:auto;max-width:760px}.grid{stroke:var(--line)}.baseline{stroke:var(--muted);stroke-dasharray:4 4}.axis{fill:var(--muted);font-size:11px}
details{margin:10px 0}summary{cursor:pointer;color:var(--accent);font-size:14px}table.small{max-width:560px}
.callout{background:var(--accent-soft);border-radius:16px;padding:28px;margin:28px 0;border:1px solid var(--line)}
.lede{font-size:17px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:760px){.pair{grid-template-columns:1fr}}
blockquote.post{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;border-top:4px solid}
blockquote.post.reject{border-top-color:${STANCE_COLOR.reject}}blockquote.post.serious{border-top-color:${STANCE_COLOR.serious}}blockquote.post.curious{border-top-color:${STANCE_COLOR.curious}}
blockquote.post p{white-space:pre-line;font-size:15px}.who{font-size:14px}.role{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}.src{font-size:13px}
.verdicts{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:18px}.verdicts>div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:14px}
.big{font:700 22px/1.2 ui-monospace,Menlo,monospace;margin:4px 0 8px;color:var(--accent)}
.chip{display:inline-block;font-size:12px;border-radius:999px;padding:1px 8px;border:1px solid var(--line);background:var(--card)}
.chip.reject{color:${STANCE_COLOR.reject}}.chip.curious{color:${STANCE_COLOR.curious}}.chip.serious{color:${STANCE_COLOR.serious}}.chip.miss{opacity:.75;text-decoration:none;border-style:dashed}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;font-size:14px}.card header{display:flex;align-items:baseline;gap:8px}.card h3{flex:1}.cid{font:600 12px ui-monospace,Menlo,monospace;color:var(--muted)}.n{font-size:12px;color:var(--muted)}
.minibar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:8px 0 4px}.mix{font-size:12.5px;color:var(--muted)}
.terms span{display:inline-block;background:var(--accent-soft);border-radius:5px;padding:0 6px;margin:0 4px 4px 0;font:12px ui-monospace,Menlo,monospace}.ex{font-size:13px;color:var(--muted);font-style:italic}
.acols{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}@media (max-width:860px){.acols{grid-template-columns:1fr}}
.acol ul{list-style:none;padding:0;margin:0}.acol li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:14px}.acol li p{margin:4px 0 6px}.fol{color:var(--muted);font-size:12px}.chips{display:flex;gap:6px;flex-wrap:wrap}.also{font-size:13px;color:var(--muted)}
.caveats li{margin-bottom:8px;max-width:820px}
details.fold{margin:14px 0;border:1px solid var(--line);border-radius:10px;background:var(--card);max-width:860px}
details.fold>summary{list-style:none;display:flex;align-items:center;gap:12px;min-height:48px;box-sizing:border-box;padding:10px 14px;color:var(--ink);font-size:15px;font-weight:600;line-height:1.35;cursor:pointer;-webkit-tap-highlight-color:transparent}
details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary::before{content:"";flex:none;width:8px;height:8px;margin:0 2px;border-right:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:rotate(-45deg);transition:transform .15s}
details.fold[open]>summary::before{transform:rotate(45deg)}
details.fold>summary:hover .flabel{color:var(--accent)}details.fold>summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:10px}
details.fold .flabel{margin:0;font-size:inherit;font-weight:inherit;line-height:inherit;color:inherit}details.fold .fcount{margin-left:auto;flex:none;color:var(--muted);font-size:12.5px;font-weight:400}
details.fold>ul{margin:0;padding:0 16px 12px 40px}details.fold>ul.r3acc{padding-left:40px}details.fold>.acols{padding:4px 14px 14px}details.fold>.tablewrap,details.fold>p{padding:0 14px}table.agree th,table.agree td{padding:8px 6px}table.outl th,table.outl td{padding:8px 6px}table.r7 th,table.r7 td{padding:8px 6px}table.r7 tbody th{white-space:nowrap}.hit{font-weight:700;color:var(--ink)}.miss{color:var(--muted)}
@media (prefers-reduced-motion:reduce){details.fold>summary::before{transition:none}}
.sidebar{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:12px;padding:16px 20px;margin:24px 0;font-size:15px}.sidebar h2{font-size:19px}
.cite{font-size:14px;color:var(--muted)}
.studynote{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;font-size:14px}
.r3acc{padding-left:18px;font-size:14px}.r3acc li{margin-bottom:6px}.xtabs{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media (max-width:860px){.xtabs{grid-template-columns:1fr}}
footer{padding:28px 0 60px;color:var(--muted);font-size:13px}footer dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px}footer dt{font-weight:600}footer dd{margin:0;word-break:break-word}
@media (max-width:640px){footer dl{grid-template-columns:1fr;gap:2px}footer dd{margin-bottom:12px}}
footer pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12.5px}
code{font:13px ui-monospace,Menlo,monospace;background:var(--accent-soft);padding:0 4px;border-radius:4px}
`;

const REPO_URL = "https://github.com/jessearmand/cybernetics-log";

/** Renders the full page. Pure function of (data, editorial, meta). */
export function renderPage(d: Discourse, e: Editorial, meta: RenderMeta): string {
  const [accent, soft] = ACCENT_HEX[e.accent && e.accent in ACCENT_HEX ? e.accent : "indigo"];
  const dep = meta.deployment;
  const commitUrl = dep ? `https://github.com/${dep.repository}/commit/${dep.sha}` : null;
  const takeaways = e.takeaways?.length ? `<ul class="takeaways">${e.takeaways.map((t) => `<li>${prose(t)}</li>`).join("")}</ul>` : "";
  const warnings = meta.warnings?.length ? `<dt>Warnings</dt><dd>${meta.warnings.map(esc).join("<br>")}</dd>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(e.headline)} · cybernetics-log</title>
<meta name="description" content="${esc(e.dek)}">
<meta name="generator" content="cybernetics-log eve agent (${esc(meta.model)})">
<style>${CSS}:root{--accent:${accent}}@media (prefers-color-scheme:light){:root{--accent-soft:${soft}}}</style></head>
<body>${meta.banner ? `<div class="banner">${esc(meta.banner)}</div>` : ""}
<header class="hero"><div class="wrap"><div class="kicker">cybernetics-log · machine consciousness on X</div>
<h1>${esc(e.headline)}</h1><p class="dek">${prose(e.dek)}</p>
<div class="stats"><span><b>${d.corpus.posts}</b> English posts</span><span><b>${d.corpus.authors}</b> authors</span><span>${esc(d.corpus.window.label)}</span><span>${d.stance_counts.hand_sample.n} hand-labelled</span><span>${d.corpus.collection_rounds ?? d.rounds.items.length - 1} rounds</span><span>${d.accuracy.methods.length} methods compared</span></div></div></header>
<div class="wrap"><nav class="toc">${has(d, "lead_tsao") ? `<a href="#lead">Time slices</a>` : ""}${has(d, "workspace_paper") ? `<a href="#workspace">Workspace paper</a>` : ""}${has(d, "nature_comment") ? `<a href="#nature">Nature</a>` : ""}${has(d, "round5") ? `<a href="#round5">Round 5</a>` : ""}${has(d, "round7") ? `<a href="#round7">Round 7</a>` : ""}<a href="#stance">Stance</a><a href="#methods">Methods</a><a href="#rounds">Rounds</a><a href="#policy">Policy fight</a><a href="#dawkins">Dawkins</a>${has(d, "politics_spotlight") ? `<a href="#politics">Sacks / All-In</a>` : ""}${has(d, "neuroscience_sidebar") && !has(d, "lead_tsao") ? `<a href="#neuro">Neuroscience</a>` : ""}${has(d, "model_comparison") ? `<a href="#models">Models</a>` : ""}<a href="#confidence">Confidence</a><a href="#pair">Pair test</a><a href="#clusters">Clusters</a><a href="#accounts">Accounts</a><a href="#caveats">Caveats</a></nav>
<section class="summary">${e.summary.map((p) => `<p>${prose(p)}</p>`).join("")}${takeaways}</section>
${leadSection(d, e)}${workspaceSection(d, e)}${natureSection(d, e)}${round5Section(d, e)}${round7Section(d, e)}${stanceSection(d, e)}${methodsSection(d, e)}${roundsSection(d)}${policySection(d, e)}${dawkinsSection(d, e)}${politicsSection(d, e)}${neuroSection(d, e)}${modelsSection(d, e)}${confidenceSection(d, e)}${pairSection(d, e)}${clustersSection(d, e)}${accountsSection(d, e)}${caveatsSection(d, e)}
<footer><dl>
<dt>Data</dt><dd>${link(`${REPO_URL}/tree/main/data`, "Complete data on GitHub")}: label files, hand labels, write-ups, and the corpus and collection notes (${link(`${REPO_URL}#corpus`, "README")}).</dd>
<dt>Classification</dt><dd>Done offline on the analysis box (embeddinggemma-2, Jev, d1-ultra and Decider via AI Gateway, hand labels) and committed to the repo. The rendering agent only writes prose around the committed numbers.</dd>
<dt>Rendered</dt><dd>${esc(meta.renderedAt)} by ${esc(meta.model)} · data ${esc(meta.dataSource)}</dd>
${dep ? `<dt>Triggered by</dt><dd>GitHub deployment ${esc(dep.id)} (${esc(dep.environment)}) · commit ${link(commitUrl, `<code>${esc(dep.sha.slice(0, 7))}</code>`)}${dep.targetUrl ? ` · ${link(dep.targetUrl, "deployment")}` : ""}</dd>` : ""}
${e.instructionSummary ? `<dt>How the instruction was applied</dt><dd>${prose(e.instructionSummary)}</dd>` : ""}
${meta.instruction ? `<dt>Deployment instruction</dt><dd><details><summary>Show</summary><pre>${esc(meta.instruction)}</pre></details></dd>` : ""}
${warnings}
<dt>Source</dt><dd>${link(REPO_URL, "github.com/jessearmand/cybernetics-log")}</dd>
</dl></footer></div></body></html>`;
}

/** Editorial used before the first deployment-triggered render (and for previews in tests). */
export const PLACEHOLDER_EDITORIAL: Editorial = {
  headline: "Machine consciousness on X: who rejects it, who's curious, who takes it seriously",
  dek: "A two-week read of the discourse, with three ways of labelling stance compared against hand labels.",
  summary: [
    "This page is rendered by an eve agent each time a GitHub deployment of this repository succeeds. No deployment-triggered render has been stored yet, so this is the data-only layout without the agent's editorial copy.",
  ],
  accent: "indigo",
};
