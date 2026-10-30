import type { Discourse } from "./data.ts";
import type { SectionKey } from "./render.ts";

/**
 * One analysis round in the log. Adding round 8 means appending an entry here
 * and a section renderer; layout and routing pick it up from `present`.
 */
export interface RoundDef {
  readonly n: number;
  /** Short date label for indexes and round headers. */
  readonly date: string;
  /** One-line summary shown on the home index and at the top of the round page. */
  readonly summary: string;
  /** Whether this round's data is in the committed discourse payload. */
  readonly present: (d: Discourse) => boolean;
}

const has = (d: Discourse, key: string): boolean => (d as Record<string, unknown>)[key] != null;

const roundItem = (d: Discourse, n: number) => d.rounds.items.find((it) => it.round === n);

/** Round catalog, newest last. Nav and indexes reverse this for descending order. */
export const ROUND_DEFS: readonly RoundDef[] = [
  {
    n: 1,
    date: "24 Sep – 8 Oct 2026",
    summary: "Baseline corpus: hand labels, Jev and embeddinggemma-2 stance, the pair test and eight topic clusters.",
    present: () => true,
  },
  {
    n: 2,
    date: "8 – 9 Oct 2026",
    summary: "Anthropic's usage-policy update dominates; 64 new posts, labelled with Jev.",
    present: (d) => !!roundItem(d, 2),
  },
  {
    n: 3,
    date: "to 10 Oct 2026",
    summary: "The abuse-policy fight continues, with a Richard Dawkins / “Claudia” spotlight and Jeff Sebo on the rule.",
    present: (d) => !!roundItem(d, 3),
  },
  {
    n: 4,
    date: "10 – 17 Oct 2026",
    summary: "Sacks / All-In “religious cult” fight, the Tsao lab preprint, and three decision models on the same hand labels.",
    present: (d) => !!roundItem(d, 4) || has(d, "politics_spotlight") || has(d, "model_comparison"),
  },
  {
    n: 5,
    date: "19 – 20 Oct 2026",
    summary: "Nature commentary and Anthropic's workspace paper; d1-ultra and Decider replace Jev on 69 posts.",
    present: (d) => has(d, "round5"),
  },
  {
    n: 6,
    date: "round-5 posts, re-labelled",
    summary: "Four-way stance with a reporting option, the new-disagreement hand check, and GPT-6 Luna on the same posts.",
    present: (d) => has(d, "round5") && !!(d as { round5?: { round6?: unknown } }).round5?.round6,
  },
  {
    n: 7,
    date: "8 – 28 Oct 2026",
    summary: "Four more decision models on the round 5/6 posts, and a fresh X set scored against Seeker labels.",
    present: (d) => has(d, "round7"),
  },
];

/**
 * Where each section note renders: a round number or the about page. Keep in
 * step with `roundBody` and `renderAboutPage` in render.ts (a test checks).
 */
export const SECTION_PAGES: Readonly<Record<SectionKey, number | "about">> = {
  stance: 1,
  confidence: 1,
  pairTest: 1,
  clusters: 1,
  accounts: 1,
  policy: 3,
  dawkins: 3,
  lead: 4,
  politics: 4,
  neuro: 4,
  models: 4,
  workspace: 5,
  nature: 5,
  round5: 5,
  round7: 7,
  methods: "about",
  caveats: "about",
};

export interface PageLayout {
  readonly path: string;
  readonly round: number | null;
  readonly date?: string;
  readonly summary?: string;
  /** Editorial fields shown on this page. */
  readonly editorial: readonly string[];
  /** Section notes shown on this page. */
  readonly section_notes: readonly SectionKey[];
}

/**
 * Which page shows which piece of editorial copy, for the agent. Headline,
 * dek, summary and takeaways appear only on `/`, which renders the latest round.
 */
export function siteLayout(d: Discourse): { latest_round: number; pages: PageLayout[] } {
  const rounds = listRounds(d);
  const latest = rounds[0]?.n ?? 1;
  // The round-6 section reuses the round5 note; the neuro aside only renders on data without lead_tsao.
  const shown = (k: SectionKey) => k !== "neuro" || !has(d, "lead_tsao");
  const notesFor = (where: number | "about"): SectionKey[] =>
    (Object.keys(SECTION_PAGES) as SectionKey[]).filter((k) => shown(k) && (SECTION_PAGES[k] === where || (where === 6 && k === "round5")));
  const latestDef = rounds[0];
  return {
    latest_round: latest,
    pages: [
      {
        path: "/",
        round: latest,
        date: latestDef?.date,
        summary: latestDef?.summary,
        editorial: ["headline", "dek", "summary", "takeaways"],
        section_notes: notesFor(latest),
      },
      ...rounds.map((r) => ({ path: roundPath(r.n), round: r.n, date: r.date, summary: r.summary, editorial: [], section_notes: notesFor(r.n) })),
      { path: aboutPath(), round: null, editorial: [], section_notes: notesFor("about") },
    ],
  };
}

/** Rounds present in this data, newest first. */
export function listRounds(d: Discourse): RoundDef[] {
  return ROUND_DEFS.filter((r) => r.present(d)).sort((a, b) => b.n - a.n);
}

/** Highest present round number, or 1. */
export function latestRound(d: Discourse): number {
  return listRounds(d)[0]?.n ?? 1;
}

export function roundDef(n: number): RoundDef | undefined {
  return ROUND_DEFS.find((r) => r.n === n);
}

export function roundPath(n: number): string {
  return `/rounds/${n}`;
}

export function aboutPath(): string {
  return "/about";
}

/** Blob / local filename for a site path. */
export function pathToStorageKey(pagePath: string): string {
  if (pagePath === "/") return "index.html";
  if (pagePath === "/about") return "about.html";
  const m = /^\/rounds\/(\d+)$/.exec(pagePath);
  if (m) return `rounds/${m[1]}.html`;
  throw new Error(`unknown site path: ${pagePath}`);
}

/** Parse a request pathname into a site path, or null when it should 404. */
export function matchSitePath(pathname: string, available: readonly number[]): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "/";
  if (path === "/about") return "/about";
  const m = /^\/rounds\/(\d+)$/.exec(path);
  if (!m) return null;
  const n = Number(m[1]);
  return available.includes(n) ? roundPath(n) : null;
}
