const DENSE_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ᄀ-ᇿ㄰-㆏]|[\u{20000}-\u{2fa1f}]/u;

/**
 * Model-independent document token estimate: one per CJK ideograph, kana or
 * Hangul code point, a quarter per other code point.
 */
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
  return dense + Math.ceil(other / 4);
};
