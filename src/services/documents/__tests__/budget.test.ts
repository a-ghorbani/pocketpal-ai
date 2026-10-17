import {
  documentTokens,
  evaluateDocumentBudget,
  hasDocuments,
  type DocumentBudgetInput,
} from '../budget';
import {documentKey} from '../render';
import {REPLY_RESERVE, type DocumentRef} from '../types';
import {MessageType} from '../../../utils/types';

const ref = (id: string, tokenEstimate: number, extra = {}): DocumentRef => ({
  id,
  name: `${id}.pdf`,
  kind: 'pdf',
  byteSize: 1,
  pageCount: 1,
  charCount: tokenEstimate * 4,
  tokenEstimate,
  ...extra,
});

const input = (
  overrides: Partial<DocumentBudgetInput> = {},
): DocumentBudgetInput => ({
  windowTokens: 4096,
  activeModelId: 'model-a',
  nonDocText: '',
  history: [],
  newRefs: [],
  missingKeys: new Set(),
  ...overrides,
});

describe('evaluateDocumentBudget', () => {
  it('fits without computing when no document is involved', () => {
    expect(
      evaluateDocumentBudget(
        input({windowTokens: 1, nonDocText: 'x'.repeat(99999)}),
      ),
    ).toEqual({kind: 'fits'});
  });

  it('is unknown when the window is unknown', () => {
    expect(
      evaluateDocumentBudget(
        input({windowTokens: undefined, newRefs: [ref('a', 100)]}),
      ),
    ).toEqual({kind: 'unknown'});
  });

  it('fits when the documents and text leave room for the reply', () => {
    expect(
      evaluateDocumentBudget(input({newRefs: [ref('a', 1000)]})).kind,
    ).toBe('fits');
  });

  it('is over with the new documents listed when they do not fit', () => {
    const verdict = evaluateDocumentBudget(
      input({newRefs: [ref('a', 9000)], nonDocText: 'hello'}),
    );
    expect(verdict.kind).toBe('over');
    if (verdict.kind !== 'over') {
      return;
    }
    expect(verdict.available).toBe(4096 - REPLY_RESERVE);
    expect(verdict.newDocs).toEqual([{ref: ref('a', 9000), tokens: 9000}]);
    expect(verdict.needed).toBeGreaterThan(9000);
    expect(verdict.historyDocTokens).toBe(0);
    expect(verdict.historyOverflow).toBe(false);
  });

  it('reports the earlier documents total and no history overflow when the new one is the cause', () => {
    const verdict = evaluateDocumentBudget(
      input({
        windowTokens: 8192,
        history: [[ref('h', 6000)]],
        newRefs: [ref('n', 3000)],
      }),
    );
    expect(verdict.kind).toBe('over');
    if (verdict.kind === 'over') {
      expect(verdict.historyDocTokens).toBeGreaterThanOrEqual(6000);
      expect(verdict.historyOverflow).toBe(false);
    }
  });

  it('flags history overflow when earlier documents alone exceed the window', () => {
    const verdict = evaluateDocumentBudget(
      input({history: [[ref('h', 6000)]], nonDocText: 'thanks'}),
    );
    expect(verdict).toMatchObject({kind: 'over', historyOverflow: true});
  });

  it('counts a missing document as zero tokens', () => {
    const missing = ref('gone', 50000);
    expect(
      evaluateDocumentBudget(
        input({
          history: [[missing]],
          missingKeys: new Set([documentKey(missing)]),
        }),
      ).kind,
    ).toBe('fits');
  });
});

describe('documentTokens', () => {
  it('uses the exact count only for the active model', () => {
    const counted = ref('a', 100, {tokenCount: {modelId: 'model-a', n: 80}});
    expect(documentTokens(counted, 'model-a')).toBe(80);
    expect(documentTokens(counted, 'model-b')).toBe(100);
  });
});

describe('hasDocuments', () => {
  const user = {id: 'u'};
  const row = (documents?: DocumentRef[]): MessageType.Text => ({
    id: 'r',
    author: user,
    type: 'text',
    text: 'hi',
    documents,
  });

  it('is false when neither the message nor history has documents', () => {
    expect(hasDocuments([row()], {type: 'text', text: 'x'})).toBe(false);
  });

  it('is true for a new message with documents', () => {
    expect(
      hasDocuments([], {type: 'text', text: 'x', documents: [ref('a', 1)]}),
    ).toBe(true);
  });

  it('is true for a history row with documents', () => {
    expect(hasDocuments([row([ref('a', 1)])], {type: 'text', text: 'x'})).toBe(
      true,
    );
  });
});
