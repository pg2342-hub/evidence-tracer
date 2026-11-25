"""Download the public court record and split it into pages.

Runs in GitHub Actions (.github/workflows/fetch-record.yml), which commits the result to data/record/.
Source: Memorandum Opinion, United States v. Google LLC, No. 20-cv-3010 (APM) (D.D.C. Aug. 5, 2024), ECF No. 1033,
as filed and mirrored by the RECAP archive of the Free Law Project.
"""

import hashlib
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

URL = "https://storage.courtlistener.com/recap/gov.uscourts.dcd.223205/gov.uscourts.dcd.223205.1033.0.pdf"
OUT = Path(__file__).resolve().parent.parent / "data" / "record" / "google-search-opinion"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / "opinion.pdf"
        req = urllib.request.Request(URL, headers={"User-Agent": "evidence-tracer (public court record fetch)"})
        pdf.write_bytes(urllib.request.urlopen(req, timeout=120).read())
        sha = hashlib.sha256(pdf.read_bytes()).hexdigest()
        info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
        n = int(next(line.split()[-1] for line in info.splitlines() if line.startswith("Pages:")))
        pages = []
        for i in range(1, n + 1):
            text = subprocess.run(
                ["pdftotext", "-f", str(i), "-l", str(i), "-layout", str(pdf), "-"], capture_output=True, text=True, check=True
            ).stdout
            pages.append({"page": i, "text": text})
    if "MEMORANDUM OPINION" not in pages[0]["text"] or "GOOGLE" not in pages[0]["text"].upper():
        sys.exit("first page is not the expected opinion")
    (OUT / "pages.json").write_text(json.dumps(pages, ensure_ascii=False, indent=0) + "\n")
    (OUT / "source.json").write_text(
        json.dumps(
            {
                "title": "Memorandum Opinion, United States v. Google LLC, No. 20-cv-3010 (APM) (D.D.C. Aug. 5, 2024), ECF No. 1033",
                "url": URL,
                "sha256": sha,
                "pages": n,
                "cite_form": "Op. at N, where N is the ECF page stamp (Page N of %d)" % n,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"{n} pages, sha256 {sha}")


if __name__ == "__main__":
    main()
