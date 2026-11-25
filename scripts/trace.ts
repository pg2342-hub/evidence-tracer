/**
 * Trace the draft brief against the record.
 *
 *   npx tsx scripts/trace.ts --runs 3            replay the recorded model replies (no key), write out/runs.json
 *   npx tsx scripts/trace.ts --live --runs 3     call Claude now, append every reply to recordings/tracer.jsonl
 *   npx tsx scripts/trace.ts --baseline          the keyword-cutoff shortcut, write out/baseline.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseBrief } from "../src/core/brief.js";
import { keywordBaseline, loadRecord, traceBrief } from "../src/core/pipeline.js";
import { Tape } from "../src/core/tape.js";
import { claudeProposer, EFFORT, MODEL, SCHEMA, SYSTEM } from "../src/core/tracer.js";
import type { Page } from "../src/core/types.js";

export const PATHS = {
  pages: "data/record/google-search-opinion/pages.json",
  brief: "data/brief/statement_of_facts.md",
  tape: "recordings/tracer.jsonl",
};

export const FINGERPRINT = { model: MODEL, effort: EFFORT, system: SYSTEM, schema: SCHEMA };

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const runs = Number(args[args.indexOf("--runs") + 1] || 1) || 1;

const pages = JSON.parse(readFileSync(PATHS.pages, "utf8")) as Page[];
const rec = loadRecord(pages);
const brief = parseBrief(readFileSync(PATHS.brief, "utf8"));
mkdirSync("out", { recursive: true });

if (flag("--baseline")) {
  const out = brief.map((a) => keywordBaseline(a, rec));
  writeFileSync("out/baseline.json", JSON.stringify({ runs: [out] }, null, 1));
  console.log(`baseline: ${out.length} sentences -> out/baseline.json`);
} else {
  const tape = new Tape(PATHS.tape, FINGERPRINT);
  const propose = flag("--live") ? tape.recording(await claudeProposer()) : tape.replaying();
  const all = [];
  for (let r = 1; r <= runs; r++) {
    const t0 = Date.now();
    const out = await traceBrief(brief, rec, propose);
    all.push(out);
    const cost = out.reduce((n, t) => n + t.meta.cost_usd, 0);
    const counts = out.reduce<Record<string, number>>((m, t) => ((m[t.status] = (m[t.status] ?? 0) + 1), m), {});
    console.log(`run ${r}: ${JSON.stringify(counts)}  $${cost.toFixed(3)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  writeFileSync("out/runs.json", JSON.stringify({ model: MODEL, effort: EFFORT, runs: all }, null, 1));
  console.log(`${runs} run(s) x ${brief.length} sentences -> out/runs.json`);
}
