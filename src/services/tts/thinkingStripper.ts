const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

const PLACEHOLDERS = [
  'Hmm, let me think.',
  'Hmm.',
  'Let me think.',
  'Okay, let me think about that.',
  'One moment.',
  'Let me consider this.',
];

export const pickThinkingPlaceholder = (
  rng: () => number = Math.random,
): string => PLACEHOLDERS[Math.floor(rng() * PLACEHOLDERS.length)];

// Computes the length of the longest suffix of `text` that is a proper
// prefix of `pattern`. Used to decide how much trailing text to hold back
// (could be a partial tag). Returns 0 if no partial match.
const partialSuffixMatch = (text: string, pattern: string): number => {
  const max = Math.min(text.length, pattern.length - 1);
  for (let n = max; n > 0; n--) {
    if (text.endsWith(pattern.slice(0, n))) {
      return n;
    }
  }
  return 0;
};

/**
 * Stateful stripper for `<think>…</think>` markup in a streaming content
 * feed. Used when `enable_thinking` is OFF but the model still emits the
 * markup anyway.
 *
 * Usage:
 *   const s = new ThinkingStripper();
 *   const toSpeak1 = s.feed(chunk1);  // forward to engine
 *   const toSpeak2 = s.feed(chunk2);  // forward to engine
 *   const leftover = s.flush();       // at stream end
 *   if (s.hadNonEmptyThink()) { // placeholder was warranted }
 */
export class ThinkingStripper {
  private buffer = '';
  private inside = false;
  private nonEmptyThink = false;

  feed(chunk: string): string {
    this.buffer += chunk;
    let out = '';
    while (this.buffer.length > 0) {
      if (!this.inside) {
        const openIdx = this.buffer.indexOf(THINK_OPEN);
        if (openIdx === -1) {
          const keep = partialSuffixMatch(this.buffer, THINK_OPEN);
          out += this.buffer.slice(0, this.buffer.length - keep);
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          break;
        }
        out += this.buffer.slice(0, openIdx);
        this.buffer = this.buffer.slice(openIdx + THINK_OPEN.length);
        this.inside = true;
      } else {
        const closeIdx = this.buffer.indexOf(THINK_CLOSE);
        if (closeIdx === -1) {
          const keep = partialSuffixMatch(this.buffer, THINK_CLOSE);
          const frag = this.buffer.slice(0, this.buffer.length - keep);
          if (frag.trim().length > 0) {
            this.nonEmptyThink = true;
          }
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          break;
        }
        const frag = this.buffer.slice(0, closeIdx);
        if (frag.trim().length > 0) {
          this.nonEmptyThink = true;
        }
        this.buffer = this.buffer.slice(closeIdx + THINK_CLOSE.length);
        this.inside = false;
      }
    }
    return out;
  }

  flush(): string {
    if (this.inside) {
      // Unclosed think block — drop remaining.
      this.buffer = '';
      return '';
    }
    // Outside but buffer might be a partial <think> prefix we held back.
    const maybePartial = partialSuffixMatch(this.buffer, THINK_OPEN);
    const out = this.buffer.slice(0, this.buffer.length - maybePartial);
    this.buffer = '';
    return out;
  }

  hadNonEmptyThink(): boolean {
    return this.nonEmptyThink;
  }

  // Also useful for the non-streaming replay case.
  static stripFinal(text: string): {text: string; hadNonEmptyThink: boolean} {
    const s = new ThinkingStripper();
    const out = s.feed(text) + s.flush();
    return {text: out, hadNonEmptyThink: s.hadNonEmptyThink()};
  }
}
