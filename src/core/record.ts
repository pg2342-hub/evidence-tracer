import type { Page, Passage } from "./types.js";

/**
 * Split each page into passages of roughly `target` words, breaking at sentence ends.
 * Passages never cross a page, so every passage carries exactly one pin cite.
 */
export function toPassages(pages: Page[], target = 140): Passage[] {
  const out: Passage[] = [];
  for (const p of pages) {
    const sentences = splitSentences(clean(p.text.replace(HEADER, "")));
    let buf: string[] = [];
    let words = 0;
    let n = 0;
    const flush = () => {
      if (!buf.length) return;
      n += 1;
      out.push({ id: `p${String(p.page).padStart(3, "0")}-${n}`, page: p.page, text: buf.join(" ") });
      buf = [];
      words = 0;
    };
    for (const s of sentences) {
      buf.push(s);
      words += s.split(/\s+/).length;
      if (words >= target) flush();
    }
    flush();
  }
  return out;
}

/** The ECF stamp at the top of every page ("Case 1:20-cv-03010-APM Document 1033 Filed 08/05/24 Page 15 of 286"). */
const HEADER = /^\s*Case \S+ Document \d+ Filed \S+ Page \d+ of \d+\s*$/m;

/** Collapse whitespace and join words hyphenated across a line break. */
export function clean(text: string): string {
  return text
    .replace(/\f/g, " ")
    .replace(/(\w)-\n\s*(\w)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const ABBREV = /\b(?:v|Op|Mem|No|Nos|Inc|Corp|Co|Ltd|U\.S|Fed|Cir|App|Supp|Dkt|ECF|Tr|Ex|PX|DX|UPX|e\.g|i\.e|Id|id|Mr|Ms|Dr|St|al|cf|See|see|Cf|Jan|Feb|Mar|Apr|Aug|Sept|Oct|Nov|Dec|approx)\.$/;

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.?!][)"”’]?)\s+(?=[A-Z(“"])/);
  const out: string[] = [];
  for (const part of parts) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += " " + part;
    else out.push(part);
  }
  return out.filter((s) => s.trim().length > 0);
}

/** Normalize for quote matching: quotes, dashes, ligatures, whitespace, case. */
export function norm(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[“”„"]/g, '"')
    .replace(/[‘’']/g, "'")
    .replace(/[‐‑‒–—―-]/g, "-")
    .replace(/(\w)-\s+(\w)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `quote` appears word for word (after normalization) on the page. */
export function quoteOnPage(quote: string, page: Page | undefined): boolean {
  if (!page) return false;
  const q = norm(quote).replace(/^\.\.\.\s*|\s*\.\.\.$/g, "");
  if (q.split(" ").length < 4) return false; // too short to prove anything
  const pieces = q.split(/\s*(?:\.\.\.|…)\s*/).filter(Boolean); // an ellipsis may join two exact pieces
  const hay = norm(page.text);
  let from = 0;
  for (const piece of pieces) {
    const at = hay.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return true;
}
