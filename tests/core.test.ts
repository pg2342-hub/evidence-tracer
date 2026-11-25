import { describe, expect, it } from "vitest";
import { formatCite, parseBrief, parseCite } from "../src/core/brief.js";
import { guard } from "../src/core/guard.js";
import { keywordBaseline, loadRecord, traceOne } from "../src/core/pipeline.js";
import { quoteOnPage, toPassages } from "../src/core/record.js";
import { Tape } from "../src/core/tape.js";
import { candidates, type ModelReply } from "../src/core/tracer.js";
import type { Page, Proposal } from "../src/core/types.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PAGES: Page[] = [
  { page: 1, text: "Case 1:20-cv-03010-APM Document 1033 Filed 08/05/24 Page 1 of 3\n\nMEMORANDUM OPINION\nThe court finds for the plaintiffs." },
  {
    page: 2,
    text: "Case 1:20-cv-03010-APM Document 1033 Filed 08/05/24 Page 2 of 3\nIn 2021, Google paid out a total of $26.3 billion in revenue share under these con-\ntracts, an expense listed in its financial statements as “traffic acquisition costs.”",
  },
  { page: 3, text: "Neeva shut down in May 2023 and was acquired by Snowflake Inc., an enterprise data company." },
];
const rec = loadRecord(PAGES);

const reply = (p: Proposal | null, stop = "end_turn"): ModelReply => ({
  proposal: p,
  stop_reason: stop,
  cost_usd: 0.01,
  latency_ms: 100,
  input_tokens: 10,
  output_tokens: 10,
});
const brief = parseBrief(
  [
    "# heading",
    "In 2021, Google paid $26.3 billion in revenue share. (Op. at 2.)",
    "Neeva was acquired by Microsoft. (Op. at 2-3.)",
    "",
    "Neeva shut down in May 2023.",
  ].join("\n"),
);

describe("brief", () => {
  it("parses one sentence per line with its cite and paragraph", () => {
    expect(brief.map((a) => [a.id, a.paragraph, a.cite])).toEqual([
      ["s01", 1, [2]],
      ["s02", 1, [2, 3]],
      ["s03", 2, null],
    ]);
    expect(brief[0].text).toBe("In 2021, Google paid $26.3 billion in revenue share.");
  });
  it("round-trips cites", () => {
    expect(parseCite("Op. at 45-47, 112")).toEqual([45, 46, 47, 112]);
    expect(formatCite([112, 46, 45, 47])).toBe("Op. at 45-47, 112");
  });
});

describe("record", () => {
  it("drops the ECF stamp and keeps one page per passage", () => {
    const ps = toPassages(PAGES);
    expect(ps.every((p) => !p.text.includes("Document 1033"))).toBe(true);
    expect(new Set(ps.map((p) => p.page))).toEqual(new Set([1, 2, 3]));
  });
  it("matches quotes across line-break hyphens and curly quotes, and rejects altered ones", () => {
    expect(quoteOnPage("paid out a total of $26.3 billion in revenue share under these contracts", PAGES[1])).toBe(true);
    expect(quoteOnPage('listed in its financial statements as "traffic acquisition costs."', PAGES[1])).toBe(true);
    expect(quoteOnPage("paid out a total of $25 billion in revenue share", PAGES[1])).toBe(false);
    expect(quoteOnPage("revenue share", PAGES[1])).toBe(false); // too short to prove anything
    expect(quoteOnPage("In 2021, Google paid out ... traffic acquisition costs", PAGES[1])).toBe(true);
  });
  it("always shows the model the pages the brief cites", () => {
    expect(candidates(brief[1], rec.index).some((p) => p.page === 3)).toBe(true);
  });
});

describe("guard", () => {
  const shown = (i: number) => candidates(brief[i], rec.index);
  const pid = (page: number) => rec.index.passages.find((p) => p.page === page)!.id;

  it("keeps a supported sentence with a real quote on the cited page", () => {
    const t = guard(brief[0], shown(0), reply({ verdict: "supported", support: [{ passage_id: pid(2), quote: "Google paid out a total of $26.3 billion in revenue share" }], discrepancy: "", suggested_text: "", note: "" }), rec.byPage, "m");
    expect(t.status).toBe("supported");
    expect(t.cite.ok).toBe(true);
  });
  it("downgrades 'supported' to needs_review when the quote is not in the record", () => {
    const t = guard(brief[0], shown(0), reply({ verdict: "supported", support: [{ passage_id: pid(2), quote: "Google paid a total of $26.3 billion to its partners in 2021" }], discrepancy: "", suggested_text: "", note: "" }), rec.byPage, "m");
    expect(t.status).toBe("needs_review");
    expect(t.dropped).toHaveLength(1);
  });
  it("rejects a quote that names a passage the model was not shown", () => {
    const t = guard(brief[0], shown(0), reply({ verdict: "supported", support: [{ passage_id: "p999-1", quote: "Google paid out a total of $26.3 billion in revenue share" }], discrepancy: "", suggested_text: "", note: "" }), rec.byPage, "m");
    expect(t.status).toBe("needs_review");
  });
  it("flags a missing cite and suggests the support page", () => {
    const t = guard(brief[2], shown(2), reply({ verdict: "supported", support: [{ passage_id: pid(3), quote: "Neeva shut down in May 2023 and was acquired" }], discrepancy: "", suggested_text: "", note: "" }), rec.byPage, "m");
    expect(t.status).toBe("cite_fix");
    expect(t.cite.suggested).toBe("Op. at 3");
  });
  it("sends a wrong detail to needs_fix with the record's fact", () => {
    const t = guard(brief[1], shown(1), reply({ verdict: "partly_supported", support: [{ passage_id: pid(3), quote: "was acquired by Snowflake Inc., an enterprise data company" }], discrepancy: "The record says Snowflake acquired Neeva.", suggested_text: "Neeva was acquired by Snowflake.", note: "" }), rec.byPage, "m");
    expect(t.status).toBe("needs_fix");
  });
  it("never trusts a refused or unparsable reply", () => {
    expect(guard(brief[0], shown(0), reply(null, "refusal"), rec.byPage, "m").status).toBe("needs_review");
  });
});

describe("tape and baseline", () => {
  it("replays recorded replies in order, keyed by input", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tape-"));
    const tape = new Tape(join(dir, "t.jsonl"), { v: 1 });
    let n = 0;
    const live = tape.recording(async () => reply({ verdict: "not_supported", support: [], discrepancy: `call ${++n}`, suggested_text: "", note: "" }));
    await traceOne(brief[0], rec, live);
    await traceOne(brief[0], rec, live);
    const replay = new Tape(join(dir, "t.jsonl"), { v: 1 }).replaying();
    expect((await traceOne(brief[0], rec, replay)).proposal?.discrepancy).toBe("call 1");
    expect((await traceOne(brief[0], rec, replay)).proposal?.discrepancy).toBe("call 2");
    await expect(traceOne(brief[0], rec, replay)).rejects.toThrow(/no recording left/);
    await expect(traceOne(brief[0], rec, new Tape(join(dir, "t.jsonl"), { v: 2 }).replaying())).rejects.toThrow();
  });
  it("the keyword cutoff calls a changed-detail sentence supported (the shortcut the gate must block)", () => {
    expect(keywordBaseline(brief[1], rec, 0.1).status).not.toBe("unsupported");
  });
});
