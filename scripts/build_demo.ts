/**
 * Collect what the demo page shows into app/public/data.json, from the pipeline's own output:
 *   out/runs.json (npm run trace), out/baseline.json (npm run baseline),
 *   reports/recorded/results.json and reports/baseline/results.json (golive run).
 * Every number on the page comes from these files.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseBrief } from "../src/core/brief.js";
import { toPassages } from "../src/core/record.js";
import type { Page, Traced } from "../src/core/types.js";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const pages = read("data/record/google-search-opinion/pages.json") as Page[];
const source = read("data/record/google-search-opinion/source.json");
const brief = parseBrief(readFileSync("data/brief/statement_of_facts.md", "utf8"));
const runs = read("out/runs.json") as { model: string; effort: string; runs: Traced[][] };
const passages = new Map(toPassages(pages).map((p) => [p.id, p]));

function evalOf(path: string) {
  if (!existsSync(path)) return null;
  const r = read(path);
  return {
    agent: r.agent,
    decision: r.decision,
    runs: r.runs,
    reasons: r.gate_result.reasons,
    rules: r.gate_result.rules,
    checks: r.checks,
    cases: r.cases.map((c: any) => ({
      id: c.id,
      group: c.group,
      runs: c.runs.map((x: any) => ({
        passed: x.passed,
        failed: x.failed_checks,
        critical: x.failed_checks.some((id: string) => r.checks.find((k: any) => k.id === id)?.critical),
        reasons: Object.fromEntries(Object.entries(x.verdicts).filter(([, v]: any) => v.result === "fail").map(([k, v]: any) => [k, v.reason])),
      })),
    })),
  };
}

const first = runs.runs[0];
const agree = brief.map((a) => new Set(runs.runs.map((r) => r.find((t) => t.id === a.id)!.status)).size === 1);
const used = new Set(first.flatMap((t) => [...t.links.map((l) => l.passage_id)]));
const all = runs.runs.flat();
const sum = (f: (t: Traced) => number) => all.reduce((n, t) => n + f(t), 0);

const data = {
  source,
  model: runs.model,
  effort: runs.effort,
  brief,
  traced: first,
  agree,
  // The record uses en dashes in ranges; the page shows them as hyphens.
  passages: Object.fromEntries([...used].map((id) => [id, { ...passages.get(id)!, text: passages.get(id)!.text.replace(/[\u2013\u2014]/g, "-") }])),
  totalPages: pages.length,
  stats: {
    calls: all.length,
    mean_cost_usd: sum((t) => t.meta.cost_usd) / all.length,
    mean_latency_s: sum((t) => t.meta.latency_ms) / all.length / 1000,
    total_cost_usd: sum((t) => t.meta.cost_usd),
    dropped_quotes: sum((t) => t.dropped.length),
    quotes: sum((t) => t.links.length + t.dropped.length),
  },
  evals: { tracer: evalOf("reports/recorded/results.json"), baseline: evalOf("reports/baseline/results.json") },
};
mkdirSync("app/public", { recursive: true });
writeFileSync("app/public/data.json", JSON.stringify(data));
console.log(`app/public/data.json: ${brief.length} sentences, ${used.size} passages, tracer ${data.evals.tracer?.decision}, baseline ${data.evals.baseline?.decision}`);
