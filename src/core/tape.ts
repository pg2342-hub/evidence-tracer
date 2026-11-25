import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Assertion, Passage } from "./types.js";
import type { ModelReply, Proposer } from "./tracer.js";

/**
 * Record each live model reply once, then replay it with no key.
 * Keyed by a hash of the model, prompt, schema and the exact input; repeated keys replay in recorded order,
 * one per run. CI and the demo page replay; the record workflow refreshes the tape with real calls.
 */
export class Tape {
  private queues: Map<string, ModelReply[]> | null = null;
  constructor(
    public path: string,
    private fingerprint: unknown,
  ) {}

  key(a: Assertion, shown: Passage[]): string {
    const body = JSON.stringify({ fp: this.fingerprint, text: a.text, cite: a.citeText, shown: shown.map((p) => [p.id, p.text]) });
    return createHash("sha256").update(body).digest("hex").slice(0, 16);
  }

  append(k: string, reply: ModelReply): void {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify({ key: k, value: reply }) + "\n");
  }

  next(k: string): ModelReply {
    if (!this.queues) {
      this.queues = new Map();
      if (existsSync(this.path)) {
        for (const line of readFileSync(this.path, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const row = JSON.parse(line) as { key: string; value: ModelReply };
          const q = this.queues.get(row.key) ?? [];
          q.push(row.value);
          this.queues.set(row.key, q);
        }
      }
    }
    const q = this.queues.get(k);
    if (!q?.length) throw new Error(`no recording left for key ${k} in ${this.path}; run the record workflow`);
    return q.shift()!;
  }

  recording(live: Proposer): Proposer {
    return async (a, shown) => {
      const reply = await live(a, shown);
      this.append(this.key(a, shown), reply);
      return reply;
    };
  }

  replaying(): Proposer {
    return async (a, shown) => this.next(this.key(a, shown));
  }
}
