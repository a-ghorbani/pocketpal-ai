import {documentTokens, hasDocuments} from '../budget';
import type {DocumentRef} from '../types';
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
