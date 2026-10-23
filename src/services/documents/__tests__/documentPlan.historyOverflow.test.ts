import {documentPlan} from '../plan';
import {estimateDocTokens} from '../estimate';
import {documentKey} from '../render';
import {type DocumentRef} from '../types';
import {MessageType} from '../../../utils/types';

const notes: DocumentRef = {
  id: 'notes-0000-0000',
  name: 'notes.md',
  kind: 'text',
  byteSize: 1,
  charCount: 1500,
  tokenEstimate: 500,
};

const plainRow: MessageType.Text = {
  id: 'row-plain',
  author: {id: 'user'},
  type: 'text',
  text: 'a long plain conversation',
};

describe('documentPlan when the chat holds no documents', () => {
  const longChat = 'plain chat text '.repeat(400);

  it('raises no document sheet when plain chat text alone fills the window', () => {
    expect(estimateDocTokens(longChat)).toBeGreaterThan(2048 - 1024);

    const p = documentPlan({
      rows: [plainRow],
      message: {type: 'text', text: 'Summarise the notes', documents: [notes]},
      windowTokens: 2048,
      activeModelId: 'm',
      nonDocText: longChat,
      missingKeys: new Set(),
    });

    expect(p.verdict).toEqual({kind: 'fits'});
  });

  it('raises no document sheet in an empty chat whose prompt alone fills the window', () => {
    const p = documentPlan({
      rows: [],
      message: {type: 'text', text: 'q', documents: [notes]},
      windowTokens: 2048,
      activeModelId: 'm',
      nonDocText: longChat,
      missingKeys: new Set(),
    });

    expect(p.verdict).toEqual({kind: 'fits'});
  });

  it('does not blame earlier documents that are a small part of a chat too long anyway', () => {
    const p = documentPlan({
      rows: [{...plainRow, documents: [notes]}],
      message: {type: 'text', text: 'thanks'},
      windowTokens: 2048,
      activeModelId: 'm',
      nonDocText: longChat,
      missingKeys: new Set(),
    });

    expect(p.verdict).toEqual({kind: 'fits'});
  });

  it('never blames earlier documents whose files are gone', () => {
    const p = documentPlan({
      rows: [{...plainRow, documents: [notes]}],
      message: {type: 'text', text: 'thanks'},
      windowTokens: 2048,
      activeModelId: 'm',
      nonDocText: 'x'.repeat(3000),
      missingKeys: new Set([documentKey(notes)]),
    });

    expect(p.verdict).toEqual({kind: 'fits'});
  });

  it('still blames earlier documents when they are part of what overflows', () => {
    const earlier: DocumentRef = {
      ...notes,
      id: 'earlier-0000-0000',
      name: 'earlier.md',
      tokenEstimate: 900,
    };
    const p = documentPlan({
      rows: [{...plainRow, documents: [earlier]}],
      message: {type: 'text', text: 'thanks'},
      windowTokens: 2048,
      activeModelId: 'm',
      nonDocText: 'x'.repeat(600),
      missingKeys: new Set(),
    });

    expect(p.verdict).toMatchObject({kind: 'over', reason: 'history'});
  });
});
