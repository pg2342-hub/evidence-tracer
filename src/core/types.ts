/** Shared shapes. A record is a court document split into pages; a brief is a list of assertions. */

export interface Page {
  page: number; // ECF page number (the "Page N of M" stamp), which is how the brief cites the record
  text: string;
}

export interface Passage {
  id: string; // p045-2: page 45, second passage on that page
  page: number;
  text: string;
}

export interface Assertion {
  id: string; // s01, s02, ... in brief order
  paragraph: number;
  text: string; // the sentence without its citation
  cite: number[] | null; // pages the brief cites, null when the sentence has no cite
  citeText: string | null; // the citation as written, e.g. "Op. at 45-46"
}

export type Verdict = "supported" | "partly_supported" | "not_supported";

/** What the model proposes for one assertion (validated against SCHEMA in tracer.ts). */
export interface Proposal {
  verdict: Verdict;
  support: { passage_id: string; quote: string }[];
  discrepancy: string; // what the record says differently, empty when supported
  suggested_text: string; // corrected sentence, empty when supported as written
  note: string; // one line for the reviewing lawyer
}

/** What the reviewer sees after code has checked the proposal. */
export type Status =
  | "supported" // record supports it and the brief's cite points at the support
  | "cite_fix" // record supports it, but the cite is missing or points elsewhere
  | "needs_fix" // record supports part of it; a detail is wrong or overstated
  | "unsupported" // nothing in the record supports it
  | "needs_review"; // the model's support did not check out; a person has to look

export interface Link {
  passage_id: string;
  page: number;
  quote: string;
}

export interface Traced {
  id: string;
  status: Status;
  proposal: Proposal | null; // null when the model call failed or was refused
  links: Link[]; // quotes code found word for word on the cited page
  dropped: { passage_id: string; quote: string; why: string }[]; // quotes code could not find
  cite: { written: number[] | null; support_pages: number[]; ok: boolean; suggested: string | null };
  candidates: string[]; // passage ids the model was shown
  guard: string[]; // why code changed the model's verdict, if it did
  meta: { model: string; cost_usd: number; latency_ms: number; input_tokens: number; output_tokens: number };
}
