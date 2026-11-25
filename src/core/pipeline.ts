import { guard } from "./guard.js";
import { toPassages } from "./record.js";
import { Index } from "./search.js";
import { candidates, MODEL, pageMap, type Proposer } from "./tracer.js";
import type { Assertion, Page, Traced } from "./types.js";

export interface Record_ {
  pages: Page[];
  index: Index;
  byPage: Map<number, Page>;
}

export function loadRecord(pages: Page[]): Record_ {
  return { pages, index: new Index(toPassages(pages)), byPage: pageMap(pages) };
}

/** One sentence in, one checked proposal out. */
export async function traceOne(a: Assertion, rec: Record_, propose: Proposer): Promise<Traced> {
  const shown = candidates(a, rec.index);
  const reply = await propose(a, shown);
  return guard(a, shown, reply, rec.byPage, MODEL);
}

/** The whole brief, a few sentences at a time. */
export async function traceBrief(brief: Assertion[], rec: Record_, propose: Proposer, concurrency = 4): Promise<Traced[]> {
  const out: Traced[] = new Array(brief.length);
  let next = 0;
  const worker = async () => {
    while (next < brief.length) {
      const i = next++;
      out[i] = await traceOne(brief[i], rec, propose);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

/**
 * The shortcut the gate must block: take the best keyword match, call the sentence supported when the
 * match scores above a cutoff, and cite that page. No model, no reading.
 */
export function keywordBaseline(a: Assertion, rec: Record_, cutoff = 12): Traced {
  const [top] = rec.index.search(a.text, 1);
  const hit = top && top.score >= cutoff;
  const page = hit ? top.passage.page : null;
  const citeOk = !!(page && a.cite?.includes(page));
  const quote = hit ? top.passage.text.split(" ").slice(0, 30).join(" ") : "";
  return {
    id: a.id,
    status: hit ? (citeOk ? "supported" : "cite_fix") : "unsupported",
    proposal: hit
      ? { verdict: "supported", support: [{ passage_id: top.passage.id, quote }], discrepancy: "", suggested_text: "", note: "" }
      : { verdict: "not_supported", support: [], discrepancy: "", suggested_text: "", note: "" },
    links: hit ? [{ passage_id: top.passage.id, page: top.passage.page, quote }] : [],
    dropped: [],
    cite: { written: a.cite, support_pages: page ? [page] : [], ok: citeOk, suggested: page && !citeOk ? `Op. at ${page}` : null },
    candidates: top ? [top.passage.id] : [],
    guard: [],
    meta: { model: "keyword cutoff", cost_usd: 0, latency_ms: 0, input_tokens: 0, output_tokens: 0 },
  };
}
