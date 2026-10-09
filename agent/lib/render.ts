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

export type SectionKey = "stance" | "methods" | "confidence" | "pairTest" | "clusters" | "accounts" | "caveats";
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

/** Only http(s) links to x.com / github.com / vercel.app are emitted as hrefs. */
function safeUrl(url: unknown): string | null {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:") return null;
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)github\.com$|\.vercel\.app$/.test(u.hostname)) return null;
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
  const ka = d.key_accounts_round2;
  const col = (s: StanceName) =>
    `<div class="acol ${s}"><h3><i style="background:${STANCE_COLOR[s]}"></i>${CAP(s)}</h3><ul>${ka[s]
      .map((a) => `<li>${link(a.url, `<b>@${esc(a.username)}</b>`)}<p>${esc(a.blurb)}</p><div class="chips">${a.jev_hybrid ? `<span class="chip">Jev hybrid: ${esc(CAP(a.jev_hybrid))}</span>` : ""}</div></li>`)
      .join("")}</ul></div>`;
  return `<section id="rounds"><h2>Rounds</h2><p class="fine">${esc(r.note)}</p><div class="bars">${rows}</div>
<div class="tablewrap"><table class="methods"><thead><tr><th>Round</th><th>Posts</th><th>3-way R</th><th>3-way C</th><th>3-way S</th><th>Hybrid R</th><th>Hybrid C</th><th>Hybrid S</th><th>Uncertain</th></tr></thead><tbody>${t3}</tbody></table></div>
${fl}<p class="fine">Round-2 flashpoints: ${fps}.</p><h3>Round 2 key accounts</h3><p class="fine">${esc(ka.note)}</p><div class="acols">${STANCES.map(col).join("")}</div></section>`;
}

function caveatsSection(d: Discourse, e: Editorial): string {
  return `<section id="caveats"><h2>Caveats</h2>${note(e, "caveats")}<ul class="caveats">${d.caveats.map((c) => `<li><b>${esc(c.title)}.</b> ${esc(c.text)}</li>`).join("")}</ul></section>`;
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
footer{padding:28px 0 60px;color:var(--muted);font-size:13px}footer dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px}footer dt{font-weight:600}footer dd{margin:0;word-break:break-word}
footer pre{white-space:pre-wrap;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12.5px}
code{font:13px ui-monospace,Menlo,monospace;background:var(--accent-soft);padding:0 4px;border-radius:4px}
`;

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
<div class="stats"><span><b>${d.corpus.posts}</b> English posts</span><span><b>${d.corpus.authors}</b> authors</span><span>${esc(d.corpus.window.label)}</span><span>${d.stance_counts.hand_sample.n} hand-labelled</span><span>${d.rounds.items.length - 1} rounds</span><span>${d.accuracy.methods.length} methods compared</span></div></div></header>
<div class="wrap"><nav class="toc"><a href="#stance">Stance</a><a href="#methods">Methods</a><a href="#rounds">Rounds</a><a href="#confidence">Confidence</a><a href="#pair">Pair test</a><a href="#clusters">Clusters</a><a href="#accounts">Accounts</a><a href="#caveats">Caveats</a></nav>
<section class="summary">${e.summary.map((p) => `<p>${prose(p)}</p>`).join("")}${takeaways}</section>
${stanceSection(d, e)}${methodsSection(d, e)}${roundsSection(d)}${confidenceSection(d, e)}${pairSection(d, e)}${clustersSection(d, e)}${accountsSection(d, e)}${caveatsSection(d, e)}
<footer><dl>
<dt>Corpus</dt><dd>${esc(d.corpus.source)}. ${d.corpus.notes.map(esc).join(" ")}</dd>
<dt>Classification</dt><dd>Done offline on the analysis box (embeddinggemma-2, Jev via AI Gateway, hand labels) and committed to the repo. The rendering agent only writes prose around the committed numbers.</dd>
<dt>Rendered</dt><dd>${esc(meta.renderedAt)} by ${esc(meta.model)} · data ${esc(meta.dataSource)}</dd>
${dep ? `<dt>Triggered by</dt><dd>GitHub deployment ${esc(dep.id)} (${esc(dep.environment)}) · commit ${link(commitUrl, `<code>${esc(dep.sha.slice(0, 7))}</code>`)}${dep.targetUrl ? ` · ${link(dep.targetUrl, "deployment")}` : ""}</dd>` : ""}
${e.instructionSummary ? `<dt>How the instruction was applied</dt><dd>${prose(e.instructionSummary)}</dd>` : ""}
${meta.instruction ? `<dt>Deployment instruction</dt><dd><details><summary>Show</summary><pre>${esc(meta.instruction)}</pre></details></dd>` : ""}
${warnings}
<dt>Source</dt><dd>${link("https://github.com/jessearmand/cybernetics-log", "github.com/jessearmand/cybernetics-log")}</dd>
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
