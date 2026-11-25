import type { Assertion, Page, Passage, Proposal } from "./types.js";
import { Index } from "./search.js";

export const MODEL = "claude-opus-5-5";
export const EFFORT = "medium";

export const SYSTEM = `You check a draft legal brief against the court record, one sentence at a time, for a litigation team.

You get one sentence from the brief, the record cite the brief gives for it (if any), and numbered passages from the record. Decide whether the passages support the sentence.

- supported: the passages state everything the sentence asserts, including every number, date, name and qualifier. Paraphrase is fine; a stronger claim than the record makes is not.
- partly_supported: the passages support the core of the sentence, but a detail is wrong or overstated (a number, a date, a party, a share, "all" where the record says "most", a finding the court did not make).
- not_supported: nothing in the passages supports the sentence, or the passages say the opposite.

Rules:
- Use only the passages given. Do not rely on what you know about the case.
- For every passage you rely on, copy a quote of 8 to 40 words exactly as it appears in that passage, character for character. Do not fix typos, change punctuation or join text from two passages. Code will reject any quote it cannot find word for word.
- If the brief's cite does not point at the passages that support the sentence, still judge support on the passages; code checks the cite.
- discrepancy: for partly_supported or not_supported, say in one sentence what the record says instead, with its number or words. Empty when supported.
- suggested_text: for partly_supported, rewrite the sentence so the record supports it, keeping the brief's wording where you can. Empty otherwise.
- note: one short line a reviewing lawyer can act on.`;

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "support", "discrepancy", "suggested_text", "note"],
  properties: {
    verdict: { type: "string", enum: ["supported", "partly_supported", "not_supported"] },
    support: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["passage_id", "quote"],
        properties: { passage_id: { type: "string" }, quote: { type: "string" } },
      },
    },
    discrepancy: { type: "string" },
    suggested_text: { type: "string" },
    note: { type: "string" },
  },
} as const;

/** The passages the model is shown: the best BM25 matches, plus every passage on the pages the brief cites. */
export function candidates(a: Assertion, index: Index, k = 8, cap = 12): Passage[] {
  const picked = new Map<string, Passage>();
  for (const p of index.passages) if (a.cite?.includes(p.page)) picked.set(p.id, p);
  for (const { passage } of index.search(a.text, k)) {
    if (picked.size >= cap) break;
    picked.set(passage.id, passage);
  }
  return [...picked.values()].slice(0, cap).sort((x, y) => x.page - y.page || x.id.localeCompare(y.id));
}

export function userPrompt(a: Assertion, shown: Passage[]): string {
  const lines = [
    `Sentence from the brief: ${a.text}`,
    `Brief's cite: ${a.citeText ?? "none"}`,
    "",
    "Passages from the record (Memorandum Opinion, cited as Op. at <page>):",
    ...shown.map((p) => `[${p.id}] (Op. at ${p.page}) ${p.text}`),
  ];
  return lines.join("\n");
}

export interface ModelReply {
  proposal: Proposal | null;
  stop_reason: string;
  cost_usd: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
}

export type Proposer = (a: Assertion, shown: Passage[]) => Promise<ModelReply>;

/** Price per token for the cost line on the demo (USD per 1M tokens, input / output). */
const PRICE = { input: 4, output: 20 };

/** The live model step. Imported lazily so tests and replays need no key. */
export async function claudeProposer(): Promise<Proposer> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  return async (a, shown) => {
    const t0 = Date.now();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: "user", content: userPrompt(a, shown) }],
    });
    const latency_ms = Date.now() - t0;
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let proposal: Proposal | null = null;
    if (res.stop_reason === "end_turn") {
      try {
        proposal = JSON.parse(text) as Proposal;
      } catch {
        proposal = null;
      }
    }
    const u = res.usage;
    const input = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    return {
      proposal,
      stop_reason: res.stop_reason ?? "unknown",
      cost_usd: (input * PRICE.input + u.output_tokens * PRICE.output) / 1e6,
      latency_ms,
      input_tokens: input,
      output_tokens: u.output_tokens,
    };
  };
}

export function pageMap(pages: Page[]): Map<number, Page> {
  return new Map(pages.map((p) => [p.page, p]));
}
