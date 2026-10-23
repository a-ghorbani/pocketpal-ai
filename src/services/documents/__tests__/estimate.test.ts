import {estimateDocTokens} from '../estimate';

describe('estimateDocTokens', () => {
  it('counts a third of a token per Latin character, rounded up', () => {
    expect(estimateDocTokens('abcdef')).toBe(2);
    expect(estimateDocTokens('abcdefg')).toBe(3);
    expect(estimateDocTokens('')).toBe(0);
  });

  it('does not undercount a markdown table row', () => {
    const row = '| 2024 | 12.5% | +3.1 | n/a |';
    expect(estimateDocTokens(row)).toBe(Math.ceil(row.length / 3));
  });

  it('counts one token per CJK ideograph, kana and Hangul character', () => {
    expect(estimateDocTokens('漢字')).toBe(2);
    expect(estimateDocTokens('ひらがなカタカナ')).toBe(8);
    expect(estimateDocTokens('한국어')).toBe(3);
  });

  it('counts CJK punctuation and fullwidth forms one each', () => {
    expect(estimateDocTokens('「。」、！')).toBe(5);
  });

  it('counts Thai characters one each', () => {
    expect(estimateDocTokens('ภาษาไทย')).toBe(7);
  });

  it('counts Indic and other complex-script characters one each', () => {
    expect(estimateDocTokens('हिन्दी')).toBe(6);
    expect(estimateDocTokens('தமிழ்')).toBe(5);
    expect(estimateDocTokens('မြန်မာ')).toBe(6);
    expect(estimateDocTokens('ქართ')).toBe(4);
    expect(estimateDocTokens('አማርኛ')).toBe(4);
  });

  it('keeps Cyrillic, Greek, Arabic and Hebrew at a third each', () => {
    expect(estimateDocTokens('привет')).toBe(2);
    expect(estimateDocTokens('γεια σου')).toBe(3);
    expect(estimateDocTokens('مرحبا')).toBe(2);
    expect(estimateDocTokens('שלום')).toBe(2);
  });

  it('adds both parts for mixed text', () => {
    expect(estimateDocTokens('PDF 文書 test')).toBe(2 + Math.ceil(9 / 3));
  });

  it('counts an emoji as one code point, not two units', () => {
    expect(estimateDocTokens('😀😀😀')).toBe(1);
  });

  it('estimates a 1,000-character CJK page at 1,000 tokens', () => {
    expect(estimateDocTokens('文'.repeat(1000))).toBe(1000);
  });
});
