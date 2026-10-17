import {estimateDocTokens} from '../estimate';

describe('estimateDocTokens', () => {
  it('counts a quarter token per Latin character', () => {
    expect(estimateDocTokens('abcdefgh')).toBe(2);
    expect(estimateDocTokens('abcde')).toBe(2);
    expect(estimateDocTokens('')).toBe(0);
  });

  it('counts one token per CJK ideograph, kana and Hangul character', () => {
    expect(estimateDocTokens('漢字')).toBe(2);
    expect(estimateDocTokens('ひらがなカタカナ')).toBe(8);
    expect(estimateDocTokens('한국어')).toBe(3);
  });

  it('adds both parts for mixed text', () => {
    expect(estimateDocTokens('PDF 文書 test')).toBe(2 + Math.ceil(9 / 4));
  });

  it('counts an emoji as one code point, not two units', () => {
    expect(estimateDocTokens('😀😀😀😀')).toBe(1);
  });

  it('estimates a 1,000-character CJK page at 1,000 tokens, not 250', () => {
    expect(estimateDocTokens('文'.repeat(1000))).toBe(1000);
  });
});
