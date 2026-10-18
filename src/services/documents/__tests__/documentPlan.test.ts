import {documentPlan, type PlanInput} from '../plan';
import {documentKey} from '../render';
import {
  EXCERPT_MAX_TOKENS,
  FULL_TOTAL_MAX_TOKENS,
  type DocumentRef,
} from '../types';
import {MessageType} from '../../../utils/types';

const ref = (
  id: string,
  tokenEstimate: number,
  extra: Partial<DocumentRef> = {},
): DocumentRef => ({
  id: `${id}-0000-0000`,
  name: `${id}.pdf`,
  kind: 'pdf',
  byteSize: 1,
  pageCount: 10,
  charCount: tokenEstimate * 3,
  tokenEstimate,
  ...extra,
});

const row = (documents: DocumentRef[]): MessageType.Text => ({
  id: `row-${documents.map(d => d.id).join()}`,
  author: {id: 'user'},
  type: 'text',
  text: 'earlier',
  documents,
});

const plan = (overrides: Partial<PlanInput> & {documents?: DocumentRef[]}) => {
  const {documents, ...rest} = overrides;
  return documentPlan({
    rows: [],
    message: {type: 'text', text: 'q', documents},
    windowTokens: 8192,
    activeModelId: 'm',
    nonDocText: '',
    missingKeys: new Set(),
    ...rest,
  });
};

describe('documentPlan', () => {
  it('fits with no documents anywhere', () => {
    expect(plan({}).verdict).toEqual({kind: 'fits'});
  });

  it('keeps a small document full', () => {
    const p = plan({documents: [ref('notes', 1200)]});
    expect(p.newModes).toEqual(['full']);
    expect(p.excerptBudget).toBe(0);
    expect(p.verdict.kind).toBe('fits');
  });

  it('searches a large document even under a huge window', () => {
    const p = plan({windowTokens: 131072, documents: [ref('report', 60000)]});
    expect(p.newModes).toEqual(['searched']);
    expect(p.excerptBudget).toBe(EXCERPT_MAX_TOKENS);
  });

  it('applies the caps without a window and never blocks', () => {
    const p = plan({
      windowTokens: undefined,
      documents: [ref('report', 60000)],
    });
    expect(p.newModes).toEqual(['searched']);
    expect(p.excerptBudget).toBe(EXCERPT_MAX_TOKENS);
    expect(p.verdict).toEqual({kind: 'unknown'});
  });

  it('searches a new document that would take the chat total over the cap', () => {
    const p = plan({
      rows: [row([ref('old', 1500)])],
      documents: [ref('new', 1000)],
    });
    expect(p.newModes).toEqual(['searched']);
  });

  it('honours Search instead and ignores an incoming mode', () => {
    const p = plan({
      documents: [
        ref('pinned', 100, {searchPinned: true}),
        ref('stale', 100, {mode: 'searched'}),
      ],
    });
    expect(p.newModes).toEqual(['searched', 'full']);
  });

  it('is over for the new message when even one passage does not fit', () => {
    const p = plan({
      windowTokens: 2048,
      nonDocText: 'x'.repeat(920 * 3),
      documents: [{...ref('file', 900), kind: 'text', pageCount: undefined}],
    });
    expect(p.newModes).toEqual(['searched']);
    expect(p.excerptBudget).toBeLessThan(200);
    expect(p.verdict).toMatchObject({kind: 'over', reason: 'new'});
  });

  it('degrades to a smaller excerpt budget on a default 2048 window', () => {
    const p = plan({
      windowTokens: 2048,
      nonDocText: 'summarise the method',
      documents: [ref('paper', 30000, {pageCount: 60})],
    });
    expect(p.newModes).toEqual(['searched']);
    expect(p.excerptBudget).toBeGreaterThan(900);
    expect(p.excerptBudget).toBeLessThan(1024);
    expect(p.verdict.kind).toBe('fits');
  });

  it('keeps an earlier small document full when room allows', () => {
    const p = plan({
      windowTokens: 4096,
      documents: [ref('small', 1000), ref('big', 60000)],
    });
    expect(p.newModes).toEqual(['full', 'searched']);
    expect(p.verdict.kind).toBe('fits');
    expect(p.excerptBudget).toBeGreaterThan(1800);
  });

  it('demotes new full documents in reverse attach order when room is short', () => {
    const p = plan({
      windowTokens: 2900,
      documents: [ref('a', 900), ref('b', 900), ref('big', 60000)],
    });
    expect(p.newModes).toEqual(['full', 'searched', 'searched']);
    expect(p.verdict.kind).toBe('fits');
  });

  it('is over for history when only earlier searched documents miss the floor', () => {
    const searched = ref('old', 60000, {mode: 'searched'});
    const p = plan({
      windowTokens: 2048,
      nonDocText: 'x'.repeat(4000),
      rows: [row([searched])],
    });
    expect(p.verdict).toMatchObject({kind: 'over', reason: 'history'});
  });

  it('is over for history when the full history alone exceeds the window', () => {
    const p = plan({
      windowTokens: 4096,
      rows: [row([ref('old', 6000)])],
    });
    expect(p.verdict).toMatchObject({kind: 'over', reason: 'history'});
  });

  it('leaves missing refs out of the load and the corpus', () => {
    const gone = ref('gone', 60000, {mode: 'searched'});
    const p = plan({
      windowTokens: 2048,
      rows: [row([gone])],
      missingKeys: new Set([documentKey(gone)]),
    });
    expect(p.excerptBudget).toBe(0);
    expect(p.verdict.kind).toBe('fits');
  });

  it('never exceeds the caps', () => {
    for (const windowTokens of [undefined, 2048, 8192, 131072]) {
      const p = plan({
        windowTokens,
        rows: [row([ref('h', 1000)])],
        documents: [ref('a', 900), ref('b', 5000), ref('c', 300)],
      });
      const fullNew = p.newModes.reduce(
        (sum, mode, i) => sum + (mode === 'full' ? [900, 5000, 300][i] : 0),
        0,
      );
      expect(1000 + fullNew).toBeLessThanOrEqual(FULL_TOTAL_MAX_TOKENS);
      expect(p.excerptBudget).toBeLessThanOrEqual(EXCERPT_MAX_TOKENS);
    }
  });
});
