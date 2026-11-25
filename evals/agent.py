"""Agents for golive-gate. The pipeline is TypeScript (src/core); these read what it wrote.

- recorded_agent: out/runs.json, written by `npm run trace` (replays recordings/tracer.jsonl, no key)
                  or `npm run record` (calls Claude live). The k-th call for a sentence returns run k.
- keyword_cutoff: out/baseline.json, written by `npm run baseline` (best keyword match above a cutoff = supported)
"""

import json
from collections import Counter
from pathlib import Path

from golive_gate import Response

ROOT = Path(__file__).resolve().parent.parent


def _reader(name):
    data, seen = None, Counter()

    def agent(case_input):
        nonlocal data
        if data is None:
            data = json.loads((ROOT / "out" / name).read_text())
        sid = case_input["id"]
        run = data["runs"][seen[sid] % len(data["runs"])]
        seen[sid] += 1
        out = next(t for t in run if t["id"] == sid)
        return Response(out, cost_usd=out["meta"]["cost_usd"])

    return agent


recorded_agent = _reader("runs.json")
keyword_cutoff = _reader("baseline.json")
