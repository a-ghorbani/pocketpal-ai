/**
 * Characters that tokenizers split about one per token: Armenian, the Indic
 * scripts through Sinhala, Thai, Lao, Tibetan, Myanmar, Georgian, Ethiopic,
 * Khmer, CJK, kana, Hangul and their punctuation.
 */
export const DENSE_SCRIPT =
  /[\u0530-\u058F\u0900-\u0DFF\u0E00-\u109F\u10A0-\u11FF\u1200-\u139F\u1780-\u17FF\u3000-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]|[\u{20000}-\u{2FA1F}]/u;

/** Conservative for markdown tables and technical text, where chars/4 undercounts. */
export const CHARS_PER_TOKEN = 3;

/** Model-independent document token estimate. */
export const estimateDocTokens = (text: string): number => {
  let dense = 0;
  let other = 0;
  for (const char of text) {
    if (DENSE_SCRIPT.test(char)) {
      dense += 1;
    } else {
      other += 1;
    }
  }
  return dense + Math.ceil(other / CHARS_PER_TOKEN);
};
