import type { Passage } from "./types.js";

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the their this to was were which with not but than also more most other such these those had been will would can could did does".split(" "),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%$.\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Plain BM25 over passages. Small, deterministic, and good enough to shortlist for the model. */
export class Index {
  private docs: string[][];
  private df = new Map<string, number>();
  private avg: number;
  constructor(
    public passages: Passage[],
    private k1 = 1.4,
    private b = 0.75,
  ) {
    this.docs = passages.map((p) => tokens(p.text));
    for (const d of this.docs) for (const t of new Set(d)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avg = this.docs.reduce((n, d) => n + d.length, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, k = 8): { passage: Passage; score: number }[] {
    const q = [...new Set(tokens(query))];
    const N = this.docs.length;
    const scored = this.docs.map((d, i) => {
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let s = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.length) / this.avg)));
      }
      return { passage: this.passages[i], score: s };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
