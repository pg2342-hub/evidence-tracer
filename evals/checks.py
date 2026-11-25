"""Checks on one traced sentence. Critical checks block go-live on a single failure.

The output is the pipeline's Traced object (src/core/types.ts): status, proposal, links (quotes code
found on the page), cite check. case.expected holds the hand label: group, the pages that support the
sentence, and for a wrong detail the corrected fact a rewrite must contain.
"""

import json
import re
import unicodedata
from functools import cache
from pathlib import Path

from golive_gate import FAIL, NA, PASS, CheckSet, Verdict

ROOT = Path(__file__).resolve().parent.parent
checks = CheckSet()

WANT = {
    "supported": {"supported"},
    "wrong_pin": {"cite_fix"},
    "no_cite": {"cite_fix"},
    "wrong_detail": {"needs_fix", "unsupported"},
    "not_in_record": {"unsupported", "needs_fix"},
}


def v(ok, reason=""):
    return Verdict(PASS, "") if ok else Verdict(FAIL, reason)


@cache
def pages():
    rows = json.loads((ROOT / "data/record/google-search-opinion/pages.json").read_text())
    return {r["page"]: norm(r["text"]) for r in rows}


def norm(s):
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[“”„\"]", '"', s)
    s = re.sub(r"[‘’']", "'", s)
    s = re.sub(r"[‐‑‒–—―-]", "-", s)
    s = re.sub(r"(\w)-\s+(\w)", r"\1\2", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def on_page(quote, page):
    q = re.sub(r"^\.\.\.\s*|\s*\.\.\.$", "", norm(quote))
    hay, at = pages().get(page, ""), 0
    for piece in [p for p in re.split(r"\s*(?:\.\.\.|…)\s*", q) if p]:
        at = hay.find(piece, at)
        if at < 0:
            return False
        at += len(piece)
    return len(q.split()) >= 4


@checks.check(
    "no_false_support",
    text="A sentence with a wrong detail, or with nothing behind it in the record, is never shown as supported.",
    critical=True,
)
def no_false_support(case, out):
    if case.expected["group"] not in ("wrong_detail", "not_in_record"):
        return NA
    return v(out["status"] not in ("supported", "cite_fix"), f"shown as {out['status']}; the record does not support it as written")


@checks.check("quotes_on_page", text="Every quote shown to the lawyer is on the cited page, word for word.", critical=True)
def quotes_on_page(case, out):
    bad = [f"{lk['passage_id']}: {lk['quote'][:60]}" for lk in out["links"] if not on_page(lk["quote"], lk["page"])]
    return v(not bad, "not on the page: " + "; ".join(bad))


@checks.check("status_right", text="The sentence gets the status its label calls for.")
def status_right(case, out):
    want = WANT[case.expected["group"]]
    return v(out["status"] in want, f"{out['status']}, expected {' or '.join(sorted(want))}")


@checks.check("right_pages", text="At least one page the support (or a suggested cite) points at really supports the sentence; extra pages may restate the fact.")
def right_pages(case, out):
    if case.expected["group"] not in ("supported", "wrong_pin", "no_cite"):
        return NA
    got = out["cite"]["support_pages"]
    good = set(case.expected["pages"])
    if not got:
        return v(False, "no support page found")
    return v(bool(set(got) & good), f"support on pages {got}; the sentence is supported on {sorted(good)}")


@checks.check("fix_states_record", text="For a wrong detail, the discrepancy or the rewrite states the record's fact.")
def fix_states_record(case, out):
    if case.expected["group"] != "wrong_detail":
        return NA
    p = out.get("proposal") or {}
    said = (p.get("discrepancy", "") + " " + p.get("suggested_text", "")).lower()
    want = case.expected["fix_any"]
    return v(any(w.lower() in said for w in want), f"neither the discrepancy nor the rewrite says {want[0]!r}")
