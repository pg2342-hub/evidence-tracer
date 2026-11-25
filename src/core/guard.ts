import { formatCite } from "./brief.js";
import { quoteOnPage } from "./record.js";
import type { Assertion, Link, Page, Passage, Status, Traced } from "./types.js";
import type { ModelReply } from "./tracer.js";

/**
 * Code decides what the reviewer sees. The model proposes; nothing here trusts it:
 * - a quote counts only if it is on the page of the passage it names, word for word;
 * - "supported" with no quote that checks out becomes needs_review;
 * - the cite is right when at least one quote that checked out is on a page the brief cites. The opinion
 *   restates many facts, so quotes from other pages are kept as corroboration, listed after the cited ones.
 * Every status is still a proposal for a lawyer to accept, fix or reject.
 */
export function guard(a: Assertion, shown: Passage[], reply: ModelReply, pages: Map<number, Page>, model: string): Traced {
  const byId = new Map(shown.map((p) => [p.id, p]));
  const links: Link[] = [];
  const dropped: Traced["dropped"] = [];
  const notes: string[] = [];
  const p = reply.proposal;

  for (const s of p?.support ?? []) {
    const passage = byId.get(s.passage_id);
    if (!passage) {
      dropped.push({ ...s, why: "names a passage the model was not shown" });
    } else if (!quoteOnPage(s.quote, pages.get(passage.page))) {
      dropped.push({ ...s, why: `quote not found on Op. at ${passage.page}` });
    } else {
      links.push({ passage_id: s.passage_id, page: passage.page, quote: s.quote });
    }
  }

  const onCite = (pg: number) => !!a.cite?.includes(pg);
  // The model lists its main support first; a suggested cite points there, and the rest read as see-also.
  const primary = links[0]?.page;
  links.sort((x, y) => Number(onCite(y.page)) - Number(onCite(x.page)) || x.page - y.page);
  const supportPages = [...new Set(links.map((l) => l.page))].sort((x, y) => x - y);
  const citeOk = supportPages.some(onCite);
  let status: Status;
  if (!p) {
    status = "needs_review";
    notes.push(`no usable answer from the model (${reply.stop_reason})`);
  } else if (p.verdict === "not_supported") {
    status = "unsupported";
  } else if (links.length === 0) {
    status = "needs_review";
    notes.push(`model said ${p.verdict.replace("_", " ")} but none of its quotes were found in the record`);
  } else if (p.verdict === "partly_supported") {
    status = "needs_fix";
  } else {
    status = citeOk ? "supported" : "cite_fix";
  }
  if (dropped.length && links.length) notes.push(`${dropped.length} quote(s) dropped: not found word for word`);

  return {
    id: a.id,
    status,
    proposal: p,
    links,
    dropped,
    cite: {
      written: a.cite,
      support_pages: supportPages,
      ok: citeOk,
      suggested: primary !== undefined && !citeOk ? formatCite([primary]) : null,
    },
    candidates: shown.map((s) => s.id),
    guard: notes,
    meta: {
      model,
      cost_usd: reply.cost_usd,
      latency_ms: reply.latency_ms,
      input_tokens: reply.input_tokens,
      output_tokens: reply.output_tokens,
    },
  };
}
