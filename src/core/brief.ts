import type { Assertion } from "./types.js";

/**
 * Read a draft brief written one sentence per line, paragraphs separated by a blank line.
 * A sentence may end with a record cite in parentheses: "(Op. at 45.)", "(Op. at 45-46.)", "(Op. at 45, 112.)".
 * Lines starting with "#" are headings and are skipped.
 */
export function parseBrief(md: string): Assertion[] {
  const out: Assertion[] = [];
  let paragraph = 1;
  let inPara = false;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (inPara) paragraph += 1;
      inPara = false;
      continue;
    }
    if (line.startsWith("#")) continue;
    inPara = true;
    const m = line.match(/^(.*?)\s*\((Op\. at [^)]*?)\.?\)\s*$/);
    const text = (m ? m[1] : line).trim();
    const citeText = m ? m[2].trim() : null;
    out.push({
      id: `s${String(out.length + 1).padStart(2, "0")}`,
      paragraph,
      text,
      cite: citeText ? parseCite(citeText) : null,
      citeText,
    });
  }
  return out;
}

/** "Op. at 45-46, 112" -> [45, 46, 112] */
export function parseCite(c: string): number[] {
  const body = c.replace(/^Op\. at\s*/, "");
  const pages: number[] = [];
  for (const part of body.split(/\s*,\s*/)) {
    const r = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (r) {
      for (let p = Number(r[1]); p <= Number(r[2]); p++) pages.push(p);
    } else if (/^\d+$/.test(part)) pages.push(Number(part));
  }
  return pages;
}

/** [45, 46, 112] -> "Op. at 45-46, 112" */
export function formatCite(pages: number[]): string {
  const s = [...new Set(pages)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    runs.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return `Op. at ${runs.join(", ")}`;
}
