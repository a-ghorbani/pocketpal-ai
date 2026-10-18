import {chunkDocument, splitPage} from '../chunk';
import {estimateDocTokens} from '../estimate';
import {PASSAGE_MAX_TOKENS, type DocumentRef} from '../types';

const pdf: DocumentRef = {
  id: 'pdf-1',
  name: 'p.pdf',
  kind: 'pdf',
  byteSize: 1,
  pageCount: 10,
  charCount: 0,
  tokenEstimate: 0,
};

const sentence = (i: number) =>
  `Sentence number ${i} talks about churn and retention in some detail.`;

const englishPage = () => {
  const paragraphs: string[] = [];
  let text = '';
  let i = 0;
  while (text.length < 5000) {
    const paragraph = Array.from({length: 6}, () => sentence(i++)).join(' ');
    paragraphs.push(paragraph);
    text = paragraphs.join('\n\n');
  }
  return text;
};

describe('splitPage', () => {
  it('keeps a short page whole', () => {
    expect(splitPage('  short page  ')).toEqual(['short page']);
  });

  it('splits a 5,000-char page at paragraph or sentence breaks within the limit', () => {
    const pieces = splitPage(englishPage());
    expect(pieces.length).toBeGreaterThan(5);
    for (const piece of pieces) {
      expect(estimateDocTokens(piece)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
      expect(piece).toMatch(/[.]$/);
    }
  });

  it('splits a CJK page by estimate', () => {
    const pieces = splitPage('文'.repeat(1000));
    expect(pieces).toHaveLength(5);
    pieces.forEach(piece => expect(estimateDocTokens(piece)).toBe(200));
  });

  it('cuts hard inside a run with no spaces', () => {
    const pieces = splitPage('x'.repeat(2000));
    expect(pieces.join('')).toBe('x'.repeat(2000));
    pieces.forEach(piece =>
      expect(estimateDocTokens(piece)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS),
    );
  });

  it('keeps a short heading with the text that follows it', () => {
    const body = Array.from({length: 30}, (_, i) => sentence(i)).join(' ');
    const pieces = splitPage(`Results\n\n${body}`);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0].startsWith('Results\n\nSentence number 0')).toBe(true);
    pieces.forEach(piece => {
      expect(estimateDocTokens(piece)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
      expect(estimateDocTokens(piece)).toBeGreaterThanOrEqual(
        PASSAGE_MAX_TOKENS / 4,
      );
    });
  });

  it('never leaves a lone short piece at the end of a page', () => {
    let body = sentence(0);
    for (let i = 1; estimateDocTokens(`${body} ${sentence(i)}`) <= 199; i++) {
      body = `${body} ${sentence(i)}`;
    }
    const page = `${body}\n\nThe end.`;
    expect(estimateDocTokens(page)).toBeGreaterThan(PASSAGE_MAX_TOKENS);
    const pieces = splitPage(page);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[pieces.length - 1].endsWith('The end.')).toBe(true);
    pieces.forEach(piece => {
      expect(estimateDocTokens(piece)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
      expect(estimateDocTokens(piece)).toBeGreaterThanOrEqual(
        PASSAGE_MAX_TOKENS / 4,
      );
    });
  });

  it('yields nothing for an empty page', () => {
    expect(splitPage('   \n ')).toEqual([]);
  });
});

describe('chunkDocument', () => {
  it('numbers passages per page and never crosses a page', async () => {
    const ranged = {...pdf, pageRange: {from: 3, to: 5}};
    const passages = await chunkDocument(ranged, [
      'page three',
      '',
      englishPage(),
    ]);
    expect(passages[0]).toMatchObject({
      page: 3,
      part: 1,
      parts: 1,
      ordinal: 0,
      text: 'page three',
      rangeKey: 'pdf-1:3-5',
    });
    const fifth = passages.filter(p => p.page === 5);
    expect(fifth.length).toBeGreaterThan(1);
    expect(fifth.every(p => p.parts === fifth.length)).toBe(true);
    expect(passages.some(p => p.page === 4)).toBe(false);
    expect(passages.map(p => p.ordinal)).toEqual(passages.map((_, i) => i));
  });

  it('cites a text file by part only', async () => {
    const text = {...pdf, kind: 'text' as const, pageCount: undefined};
    const passages = await chunkDocument(text, [englishPage()]);
    expect(passages[0].page).toBeUndefined();
    expect(passages[0].parts).toBe(passages.length);
  });

  it('is deterministic', async () => {
    const pages = [englishPage(), 'tail'];
    expect(await chunkDocument(pdf, pages)).toEqual(
      await chunkDocument(pdf, pages),
    );
  });

  it('yields to the event loop between pages', async () => {
    jest.useFakeTimers();
    const pages = Array.from({length: 500}, (_, i) => `page ${i}`);
    let done = false;
    const pending = chunkDocument(pdf, pages).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    await jest.runAllTimersAsync();
    await pending;
    expect(done).toBe(true);
    jest.useRealTimers();
  });
});

describe('chunking speed', () => {
  const textFile = {...pdf, kind: 'text' as const, pageCount: undefined};
  const bigText = (chars: number) => {
    const parts: string[] = [];
    let length = 0;
    for (let i = 0; length < chars; i++) {
      const piece = i % 7 === 6 ? `${sentence(i)}\n\n` : `${sentence(i)} `;
      parts.push(piece);
      length += piece.length;
    }
    return parts.join('');
  };

  it('splits a 1,000,000-character text file in linear time', async () => {
    const text = bigText(1_000_000);
    const started = Date.now();
    const passages = await chunkDocument(textFile, [text]);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(passages.length).toBeGreaterThan(1000);
    passages.forEach(p =>
      expect(estimateDocTokens(p.text)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS),
    );
  }, 30000);

  it('yields to the event loop within one long page', async () => {
    jest.useFakeTimers();
    let done = false;
    const pending = chunkDocument(textFile, [bigText(200_000)]).then(() => {
      done = true;
    });
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
    expect(done).toBe(false);
    await jest.runAllTimersAsync();
    await pending;
    expect(done).toBe(true);
    jest.useRealTimers();
  });
});
