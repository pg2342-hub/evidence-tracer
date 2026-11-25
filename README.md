# evidence-tracer

[![CI](https://github.com/pg2342-hub/evidence-tracer/actions/workflows/ci.yml/badge.svg)](https://github.com/pg2342-hub/evidence-tracer/actions/workflows/ci.yml)

Checks every sentence of a draft brief against the court record. Each sentence comes back linked to the page that supports it, with the words quoted, or flagged as a wrong detail, a cite to the wrong page, or a fact the record does not contain. A lawyer accepts, edits or rejects each one.

**Demo:** https://pranavgudise.dev/evidence-tracer/

## Result

On the last live run (claude-opus-5-5, medium effort, 3 runs of 40 sentences, 120 calls), every sentence got the right status on every run and no wrong sentence was shown as supported. All 200 quotes the model gave were found word for word on their pages. Mean cost was $0.022 and mean latency 3.3 s per sentence. The keyword-cutoff shortcut passes 25 of 40 and treats 13 wrong sentences as supported (10 marked supported, 3 marked as needing only a new cite), so the same gate blocks it.

**One rule changed after the first live run, and here is why.** The cite check first required every quoted page to be a page the brief cites, and `right_pages` required every quoted page to be in the hand labels. The opinion restates many facts in its findings and again in its conclusions, so the model often quoted a second page that says the same thing, and correct cites were marked wrong. Under those first rules the same recorded replies score 29, 29 and 28 of 40 (no-go). The rules now are: the cite is right when a verified quote sits on a page the brief cites, and `right_pages` passes when the quoted pages include a hand-labeled page. Most extra pages restate the fact word for word (for example Op. at 209 and 107 on Safari's 28%); a few are only partly on point (Op. at 15 for s01, 160 for s05, 118 for s34), which is why quotes on cited pages are listed first and a lawyer still approves every link. At the same time the critical check was tightened: a wrong pin cite shown as supported now blocks go-live.

## What it runs on

- **Record:** the public Memorandum Opinion in *United States v. Google LLC*, No. 20-cv-3010 (D.D.C. Aug. 5, 2024), ECF No. 1033, 286 pages, pulled from the RECAP archive by `.github/workflows/fetch-record.yml`. Cites use the ECF page stamp ("Op. at 45").
- **Brief:** `data/brief/statement_of_facts.md`, a 40-sentence statement of facts written for this build. Most sentences are right; some carry a wrong number, a wrong pin cite, a missing cite, or a fact the opinion does not contain. Each one is labeled by hand in `evals/cases.yml`.

## How it works

1. The opinion is split into passages of about 140 words that never cross a page, so every passage has one pin cite.
2. For each sentence, BM25 keyword search picks the closest passages, and every passage on the pages the brief cites is added (at most 12).
3. Claude reads the sentence and those passages and proposes supported, partly supported or not supported, with exact quotes, what the record says instead, and a corrected sentence. The reply is structured output against a JSON schema.
4. Code checks each quote word for word against its page. A quote that is not found is dropped, and a "supported" left with no quote goes to a person. The cite is right when a verified quote sits on a page the brief cites; the opinion restates many facts, so quotes from other pages stay as corroboration.
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
