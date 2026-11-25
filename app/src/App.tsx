import { useMemo, useState } from "react";
import type { Assertion, Status, Traced } from "../../src/core/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = {
  source: { title: string; url: string; pages: number };
  model: string;
  effort: string;
  brief: Assertion[];
  traced: Traced[];
  agree: boolean[];
  passages: Record<string, { id: string; page: number; text: string }>;
  totalPages: number;
  stats: { calls: number; mean_cost_usd: number; mean_latency_s: number; total_cost_usd: number; dropped_quotes: number; quotes: number };
  evals: { tracer: any; baseline: any };
};

const LABEL: Record<Status, string> = {
  supported: "SUPPORTED",
  cite_fix: "FIX THE CITE",
  needs_fix: "FIX THE SENTENCE",
  unsupported: "NOT IN THE RECORD",
  needs_review: "NEEDS A LOOK",
};
const PLAIN: Record<Status, string> = {
  supported: "Supported",
  cite_fix: "Cite fix",
  needs_fix: "Sentence fix",
  unsupported: "Not in record",
  needs_review: "Needs a look",
};
const GROUP: Record<string, string> = {
  supported: "Supported, cite right",
  wrong_pin: "Supported, wrong page cited",
  no_cite: "Supported, no cite",
  wrong_detail: "Detail differs from the record",
  not_in_record: "Not in the record",
};
type Decision = { action: "accept" | "edit" | "reject"; text?: string };

export function App({ data }: { data: Data }) {
  const byId = useMemo(() => new Map(data.traced.map((t) => [t.id, t])), [data]);
  const first = data.traced.find((t) => t.status === "needs_fix")?.id ?? data.brief[0].id;
  const [sel, setSel] = useState(first);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [log, setLog] = useState<Record<string, Decision>>({});
  const a = data.brief.find((b) => b.id === sel)!;
  const t = byId.get(sel)!;

  const counts = data.traced.reduce<Record<string, number>>((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {});
  const paras = data.brief.reduce<Assertion[][]>((ps, s) => ((ps[s.paragraph - 1] ??= []).push(s), ps), []);
  const choose = (id: string) => {
    setSel(id);
    document.getElementById("work")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const exportLog = () => {
    const rows = data.brief.map((b) => ({ id: b.id, sentence: b.text, cite: b.citeText, status: byId.get(b.id)!.status, decision: log[b.id] ?? null }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const el = document.createElement("a");
    el.href = url;
    el.download = "review-log.json";
    el.click();
    URL.revokeObjectURL(url);
  };

  const tr = data.evals.tracer;
  const bl = data.evals.baseline;
  const falseSupport = bl ? bl.cases.filter((c: any) => c.runs[0].failed.includes("no_false_support")).length : 0;
  return (
    <>
      <div className="head">
        <h1>Evidence tracer</h1>
        <p className="lead">
          Checks every sentence of a draft brief against the court record. Each sentence comes back linked to the page that supports it, with the
          words quoted, or flagged: a wrong number, a cite to the wrong page, or a fact the record does not contain. A lawyer accepts, edits or
          rejects each one. Here it runs on a 40-sentence statement of facts against the {data.totalPages}-page opinion in <i>United States v. Google</i>.
        </p>
      </div>

      <section className="work" id="work" aria-label="Review workspace">
        <div className="pane">
          <div className="ph">
            <h2>Draft statement of facts</h2>
            <p>Select a sentence to review it</p>
          </div>
          <div className="seg" role="radiogroup" aria-label="Show sentences">
            {(["all", "supported", "cite_fix", "needs_fix", "unsupported"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}>
                {k === "all" ? "All" : PLAIN[k]}&nbsp; <span>{k === "all" ? data.brief.length : (counts[k] ?? 0)}</span>
              </button>
            ))}
          </div>
          <div className="brief">
            {paras.map((p, i) => (
              <p className="para" key={i}>
                {p.map((s) => {
                  const st = byId.get(s.id)!.status;
                  return (
                    <span key={s.id}>
                      <button
                        type="button"
                        className={`sent${s.id === sel ? " on" : ""}${filter !== "all" && st !== filter ? " dim" : ""}`}
                        onClick={() => setSel(s.id)}
                        aria-pressed={s.id === sel}
                        aria-label={`${s.id}, ${PLAIN[st]}: ${s.text}`}
                      >
                        <i className={`mk ${st}`} aria-hidden="true" />
                        {s.text} {s.citeText ? <span className="ct">({s.citeText}.)</span> : null}
                        {log[s.id] ? <span className="ct"> [{log[s.id].action}]</span> : null}
                      </button>{" "}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
          <div className="slegend" aria-hidden="true">
            {(Object.keys(PLAIN) as Status[]).filter((k) => counts[k]).map((k) => (
              <span key={k}>
                <i className={`mk ${k}`} />
                {PLAIN[k]}
              </span>
            ))}
          </div>
        </div>

        <div className="pane det" aria-live="polite">
          <div className="ph">
            <h2>Review</h2>
            <p>
              {a.id} · {a.citeText ? `brief cites ${a.citeText}` : "no cite in the brief"}
            </p>
          </div>
          <span className={`badge ${t.status}`}>{LABEL[t.status]}</span>
          <h3>{a.text}</h3>
          <Detail t={t} data={data} />
          <Actions key={sel} id={sel} t={t} log={log} setLog={setLog} />
          <div className="foot">
            <span>
              Reviewed {Object.keys(log).length} of {data.brief.length}. Decisions stay in this browser tab.
            </span>
            <button className="btn" type="button" onClick={exportLog}>
              Export review log
            </button>
          </div>
        </div>
      </section>

      {tr && bl ? <Verdict tr={tr} bl={bl} onPick={choose} sel={sel} /> : null}

      <div className="layout">
        <div className="content">
          <h2 id="why">Why it matters</h2>
          <p className="point">
            A brief that cites the record wrong costs credibility with the court, and checking every sentence by hand is slow work on a {data.totalPages}-page
            opinion. A tool that does it has one job it must never get wrong: calling a sentence supported when the record says something else.
            Here code holds that line. A link counts only if the quote is found word for word on the cited page; a keyword match that cannot read
            the sentence called {falseSupport} wrong sentences supported and is blocked by the same gate.
          </p>

          <h2 id="map">Where each sentence lands in the record</h2>
          <p className="point">
            One row per sentence. The ring is the page the brief cites; the filled mark is the page where the quote was found. A line between them is a
            cite to fix.
          </p>
          <RecordMap data={data} onPick={choose} sel={sel} />

          <h2 id="every">Every sentence</h2>
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Sentence</th>
                  <th>Hand label</th>
                  <th>Status</th>
                  <th>All 3 runs agree</th>
                </tr>
              </thead>
              <tbody>
                {data.brief.map((s, i) => {
                  const g = tr?.cases.find((c: any) => c.id === s.id)?.group;
                  return (
                    <tr key={s.id}>
                      <td className="n">{s.id}</td>
                      <td>
                        <button type="button" className="sent" onClick={() => choose(s.id)}>
                          {s.text}
                        </button>
                      </td>
                      <td>{g ? GROUP[g] : ""}</td>
                      <td>
                        <i className={`mk ${byId.get(s.id)!.status}`} aria-hidden="true" />
                        {PLAIN[byId.get(s.id)!.status]}
                      </td>
                      <td>{data.agree[i] ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 id="how">How it works</h2>
          <ol className="steps">
            <li>The opinion is split into passages of about 140 words that never cross a page, so every passage has one pin cite.</li>
            <li>For each sentence, keyword search picks the closest passages, and every passage on the pages the brief cites is added.</li>
            <li>
              Claude ({data.model}, {data.effort} effort) reads the sentence and those passages and proposes supported, partly supported or not
              supported, with exact quotes, what the record says instead, and a corrected sentence.
            </li>
            <li>
              Code checks each quote word for word against the page. A quote it cannot find is dropped, and a "supported" left with no quote goes to a
              person. It then compares the pages of the quotes with the brief's cite.
            </li>
            <li>Nothing is changed in the brief. Every status is a proposal a lawyer accepts, edits or rejects, and the log exports.</li>
          </ol>
        </div>

        <aside className="side" aria-label="About this build">
          <nav aria-label="On this page">
            <a href="#work">Review workspace</a>
            <a href="#gate">Gate</a>
            <a href="#why">Why it matters</a>
            <a href="#map">Record map</a>
            <a href="#every">Every sentence</a>
            <a href="#how">How it works</a>
          </nav>
          <div>
            <h3>Data</h3>
            <p>
              The record is public: the Memorandum Opinion in <i>United States v. Google LLC</i>, No. 20-cv-3010 (D.D.C. Aug. 5, 2024), ECF No. 1033,
              286 pages, from the RECAP archive. Cites use the ECF page stamp. The 40-sentence brief was written for this build: most sentences restate
              the opinion; 10 have a changed detail, 4 state facts the opinion does not contain, and 9 have a missing or wrong cite. Each is labeled by
              hand.
            </p>
          </div>
          <div>
            <h3>Cost</h3>
            <p>
              {data.stats.calls} live Claude calls over 3 runs: mean ${data.stats.mean_cost_usd.toFixed(3)} and {data.stats.mean_latency_s.toFixed(1)} s
              per sentence. Quotes dropped by code: {data.stats.dropped_quotes} of {data.stats.quotes}.
            </p>
          </div>
          <div>
            <h3>Run it yourself</h3>
            <p>Node 22. Replays the recorded run with no key.</p>
            <pre>{"npm ci\nnpm test\nnpm run trace"}</pre>
          </div>
          <div>
            <a className="pill" href="https://github.com/pg2342-hub/evidence-tracer">
              Code on GitHub
            </a>
          </div>
        </aside>
      </div>
    </>
  );
}

function Detail({ t, data }: { t: Traced; data: Data }) {
  const p = t.proposal;
  return (
    <>
      {t.links.length ? <p className="lbl">THE RECORD SAYS</p> : null}
      {t.links.map((l, i) => {
        const text = data.passages[l.passage_id]?.text ?? l.quote;
        return (
          <blockquote key={i}>
            <Highlight text={text} quote={l.quote} />
            <cite>Op. at {l.page}</cite>
          </blockquote>
        );
      })}
      {t.status === "cite_fix" && t.cite.suggested ? (
        <>
          <p className="lbl">CITE</p>
          <p className="txt fix">
            {t.cite.written ? `The brief cites Op. at ${t.cite.written.join(", ")}; the support is at ` : "No cite in the brief; the support is at "}
            <b>{t.cite.suggested}</b>.
          </p>
        </>
      ) : null}
      {p?.discrepancy ? (
        <>
          <p className="lbl">{t.status === "unsupported" ? "WHAT THE RECORD SHOWS" : "WHAT DIFFERS"}</p>
          <p className="txt">{p.discrepancy}</p>
        </>
      ) : null}
      {p?.suggested_text && t.status === "needs_fix" ? (
        <>
          <p className="lbl">PROPOSED SENTENCE</p>
          <p className="txt fix">
            {p.suggested_text} {t.cite.support_pages.length ? <span className="ct">(Op. at {t.cite.support_pages.join(", ")}.)</span> : null}
          </p>
        </>
      ) : null}
      {t.guard.length ? <p className="note">Code: {t.guard.join("; ")}.</p> : null}
      {p?.note ? <p className="note">{p.note}</p> : null}
    </>
  );
}

function Highlight({ text, quote }: { text: string; quote: string }) {
  const n = (s: string) => s.toLowerCase().replace(/[“”"]/g, '"').replace(/[‘’']/g, "'").replace(/\s+/g, " ");
  const at = n(text).indexOf(n(quote).replace(/^\.\.\.\s*|\s*\.\.\.$/g, ""));
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + quote.length)}</mark>
      {text.slice(at + quote.length)}
    </>
  );
}

function Actions({ id, t, log, setLog }: { id: string; t: Traced; log: Record<string, Decision>; setLog: (f: any) => void }) {
  const cur = log[id];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(cur?.text ?? t.proposal?.suggested_text ?? "");
  const set = (d: Decision) => setLog((m: Record<string, Decision>) => ({ ...m, [id]: d }));
  const acceptLabel = t.status === "supported" ? "Accept" : t.status === "unsupported" ? "Accept: cut or find support" : "Accept the fix";
  return (
    <div className="acts">
      <button type="button" aria-pressed={cur?.action === "accept"} onClick={() => set({ action: "accept" })}>
        {acceptLabel}
      </button>
      <button type="button" aria-pressed={cur?.action === "edit" || editing} onClick={() => setEditing(true)}>
        Edit
      </button>
      <button type="button" aria-pressed={cur?.action === "reject"} onClick={() => set({ action: "reject" })}>
        Reject
      </button>
      {editing ? (
        <>
          <textarea aria-label="Your version of the sentence" value={text} onChange={(e) => setText(e.target.value)} />
          <button
            type="button"
            onClick={() => {
              set({ action: "edit", text });
              setEditing(false);
            }}
          >
            Save edit
          </button>
        </>
      ) : null}
    </div>
  );
}

function Verdict({ tr, bl, onPick, sel }: { tr: any; bl: any; onPick: (id: string) => void; sel: string }) {
  const row = (ev: any, who: string, what: string) => {
    const r1 = ev.cases.map((c: any) => ({ id: c.id, ...c.runs[0] }));
    const passed = r1.filter((c: any) => c.passed).length;
    const crit = r1.filter((c: any) => c.critical).length;
    const held = ev.runs > 1 ? ` Same gate on all ${ev.runs} runs.` : "";
    const cls = ev.decision === "go" ? "go" : ev.decision === "partial" ? "partial" : "nogo";
    return (
      <div className="vrow">
        <div className="vwho">
          <b>{who}</b>
          <span>
            {what}
            {held}
          </span>
        </div>
        <div className="strip" role="group" aria-label={`${who}: every sentence`}>
          {r1.map((c: any) => (
            <button
              type="button"
              key={c.id}
              className={`cell ${c.passed ? "pass" : c.critical ? "crit" : "fail"}${c.id === sel ? " lit" : ""}`}
              title={`${c.id}: ${c.passed ? "passed" : Object.values(c.reasons).join("; ")}`}
              aria-label={`${who} ${c.id} ${c.passed ? "passed" : c.critical ? "critical error" : "failed"}`}
              onClick={() => onPick(c.id)}
            />
          ))}
        </div>
        <div className="vscore">
          <b>{passed}</b>
          <span>
            of 40 passed
            <br />
            {crit} critical
          </span>
        </div>
        <span className={`gate ${cls}`}>{ev.decision.toUpperCase()}</span>
      </div>
    );
  };
  return (
    <section className="verdict" id="gate" aria-labelledby="verdict-h">
      <div className="vhead">
        <h2 id="verdict-h">Same 40 sentences, same gate</h2>
        <p>
          Gate: <b>no wrong sentence shown as supported, every quote on its page, 36 of 40 right</b>
        </p>
      </div>
      {row(tr, "Claude + code checks", "This build, run 1 of 3 shown.")}
      {row(bl, "Keyword cutoff", "Best keyword match above a cutoff counts as support.")}
      <div className="legend">
        <span>
          <i className="pass" />
          Right status, page and fix
        </span>
        <span>
          <i className="fail" />
          Wrong status or page
        </span>
        <span>
          <i className="crit" />
          Wrong sentence shown as supported
        </span>
        <span>Select a square to review that sentence.</span>
      </div>
    </section>
  );
}

function RecordMap({ data, onPick, sel }: { data: Data; onPick: (id: string) => void; sel: string }) {
  const W = 760,
    L = 44,
    R = 12,
    row = 13,
    top = 22,
    H = top + data.brief.length * row + 26;
  const x = (p: number) => L + ((p - 1) / (data.totalPages - 1)) * (W - L - R);
  const byId = new Map(data.traced.map((t) => [t.id, t]));
  return (
    <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="For each sentence, the page the brief cites and the page where support was found">
      {[1, 50, 100, 150, 200, 250, data.totalPages].map((p) => (
        <g key={p}>
          <line x1={x(p)} x2={x(p)} y1={top - 6} y2={H - 22} stroke="var(--rule-soft)" />
          <text x={x(p)} y={H - 8} textAnchor="middle">
            {p}
          </text>
        </g>
      ))}
      <text x={L} y={12}>
        page of the opinion
      </text>
      {data.brief.map((s, i) => {
        const t = byId.get(s.id)!;
        const y = top + i * row + row / 2;
        const on = s.id === sel;
        const cited = s.cite ?? [];
        const found = t.cite.support_pages;
        return (
          <g key={s.id} onClick={() => onPick(s.id)} style={{ cursor: "pointer" }}>
            <rect x={0} y={y - row / 2} width={W} height={row} fill={on ? "var(--green-wash)" : "transparent"} />
            <text x={0} y={y + 4}>
              {s.id}
            </text>
            <line x1={L} x2={W - R} y1={y} y2={y} stroke="var(--rule-soft)" />
            {found.length && cited.length && !t.cite.ok
              ? found.map((f) => <line key={f} x1={x(cited[0])} x2={x(f)} y1={y} y2={y} stroke="var(--ink)" strokeWidth={1.5} />)
              : null}
            {cited.map((c) => (
              <circle key={`c${c}`} cx={x(c)} cy={y} r={4} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
            ))}
            {found.map((f) => (
              <rect key={`f${f}`} x={x(f) - 3} y={y - 3} width={6} height={6} rx={1} fill={t.cite.ok ? "var(--green)" : "var(--ink)"} />
            ))}
            {!found.length && t.status === "unsupported" ? (
              <text x={x(cited[0] ?? 1) + 8} y={y + 4}>
                not found
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
