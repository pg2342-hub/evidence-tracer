# evidence-tracer

[![CI](https://github.com/pg2342-hub/evidence-tracer/actions/workflows/ci.yml/badge.svg)](https://github.com/pg2342-hub/evidence-tracer/actions/workflows/ci.yml)

Checks every sentence of a draft brief against the court record. Each sentence comes back linked to the page that supports it, with the words quoted, or flagged as a wrong detail, a cite to the wrong page, or a fact the record does not contain. A lawyer accepts, edits or rejects each one.

**Demo:** https://pranavgudise.dev/evidence-tracer/

## What it runs on

- **Record:** the public Memorandum Opinion in *United States v. Google LLC*, No. 20-cv-3010 (D.D.C. Aug. 5, 2024), ECF No. 1033, 286 pages, pulled from the RECAP archive by `.github/workflows/fetch-record.yml`. Cites use the ECF page stamp ("Op. at 45").
- **Brief:** `data/brief/statement_of_facts.md`, a 40-sentence statement of facts written for this build. Most sentences are right; some carry a wrong number, a wrong pin cite, a missing cite, or a fact the opinion does not contain. Each one is labeled by hand in `evals/cases.yml`.

## How it works

1. The opinion is split into passages of about 140 words that never cross a page, so every passage has one pin cite.
2. For each sentence, BM25 keyword search picks the closest passages, and every passage on the pages the brief cites is added (at most 12).
3. Claude reads the sentence and those passages and proposes supported, partly supported or not supported, with exact quotes, what the record says instead, and a corrected sentence. The reply is structured output against a JSON schema.
4. Code checks each quote word for word against its page. A quote that is not found is dropped, and a "supported" left with no quote goes to a person. Code then compares the pages of the verified quotes with the brief's cite.
5. Nothing in the brief changes on its own. Every status is a proposal a lawyer accepts, edits or rejects, and the review log exports as JSON.

## Go-live gate

`evals/` grades the output with [golive-gate](https://pypi.org/project/golive-gate/). Two checks are critical and must never fail: no wrong sentence called supported, and every quote found on its page. The gate also wants the right status and the right pages on at least 36 of 40 sentences, every wrong detail and every fact not in the record caught, and a correction that states the record's fact.

CI runs the gate twice: on the recorded Claude run, which must be **GO**, and on a keyword-cutoff shortcut with no model, which must be **NO-GO**.

## Run it yourself

Node 22 and Python 3.12. No API key needed: the last live run is recorded in `recordings/tracer.jsonl` and replays.

```sh
npm ci
npm test
npm run trace                      # replays the recorded Claude run, 3 runs
pip install golive-gate==0.1.1 pyyaml
golive run evals/golive.yml --out reports/recorded
npm run demo                       # builds the demo page into docs/
```

A fresh live run (`npm run record`) needs `ANTHROPIC_API_KEY`; the `Record a live run` workflow does it in Actions.

MIT license.
