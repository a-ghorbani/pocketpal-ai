/** Characters that tokenizers split about one per token: CJK, kana, Hangul, their punctuation, Thai. */
export const DENSE_SCRIPT =
  /[฀-๿　-〿぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ᄀ-ᇿ㄰-㆏＀-￯]|[\u{20000}-\u{2fa1f}]/u;

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
