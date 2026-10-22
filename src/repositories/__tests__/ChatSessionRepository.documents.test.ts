import {chatSessionRepository} from '../ChatSessionRepository';
import {releaseDocuments} from '../../services/documents/store';
import Message from '../../database/models/Message';
import type {DocumentRef} from '../../services/documents/types';
import {docId} from '../../../jest/fixtures/documentIds';

const DOC_ID = docId('doc');

type Row = {
  id: string;
  sessionId: string;
  metadata: string;
  [key: string]: unknown;
  destroyPermanently: () => Promise<void>;
};

const mockRows: Row[] = [];
const mockSessions = new Set<string>();
let mockNextId = 0;

jest.mock('../../services/documents/store', () => ({
  releaseDocuments: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../database', () => {
  const removeRow = (row: any) => async () => {
    mockRows.splice(mockRows.indexOf(row), 1);
  };
  const query = (name: string, clause?: any) => ({
    fetch: async () => {
      if (name !== 'messages') {
        return [];
      }
      if (clause?.column === 'session_id') {
        return mockRows.filter(r => r.sessionId === clause.value);
      }
      return mockRows.filter(r => r.metadata.includes('"documents"'));
    },
  });
  return {
    database: {
      write: async (callback: () => Promise<void>) => callback(),
      collections: {
        get: (name: string) => ({
          find: async (id: string) => {
            if (!mockSessions.has(id)) {
              throw new Error('not found');
            }
            return {
              id,
              destroyPermanently: async () => mockSessions.delete(id),
            };
          },
          query: (clause?: any) => query(name, clause),
          create: async (build: (record: any) => void) => {
            const record: any = {id: `rec-${mockNextId++}`};
            build(record);
            if (name === 'chat_sessions') {
              mockSessions.add(record.id);
            } else if (name === 'messages') {
              record.destroyPermanently = removeRow(record);
              mockRows.push(record);
            }
            return record;
          },
        }),
      },
    },
  };
});

jest.mock('@nozbe/watermelondb', () => ({
  ...jest.requireActual('@nozbe/watermelondb'),
  Q: {
    where: (column: string, value: unknown) => ({column, value}),
    like: (value: string) => value,
  },
}));

jest.unmock('../ChatSessionRepository');

const ref: DocumentRef = {
  id: DOC_ID,
  name: 'a.pdf',
  kind: 'pdf',
  byteSize: 1,
  pageCount: 1,
  charCount: 10,
  tokenEstimate: 3,
};

const userText = {
  id: '',
  type: 'text' as const,
  text: 'Summarise',
  author: {id: 'user'},
  createdAt: 1,
  documents: [ref],
};

const release = releaseDocuments as jest.Mock;

beforeEach(() => {
  mockRows.length = 0;
  mockSessions.clear();
  release.mockClear();
});

describe('ChatSessionRepository documents', () => {
  it('persists refs in metadata and lifts them back onto the message', async () => {
    const session = await chatSessionRepository.createSession('X');
    await chatSessionRepository.addMessageToSession(session.id, userText);

    const [row] = mockRows;
    expect(row.text).toBe('Summarise');
    expect(JSON.parse(row.metadata).documents).toEqual([ref]);

    const lifted = Message.prototype.toMessageObject.call(row) as any;
    expect(lifted.documents).toEqual([ref]);
  });

  it('keeps a shared document while another chat references it, then releases it', async () => {
    const x = await chatSessionRepository.createSession('X', [userText]);
    await chatSessionRepository.createSession('Y', [userText]);
    const y = [...mockSessions].find(id => id !== x.id)!;

    await chatSessionRepository.deleteSession(x.id);
    expect(release).toHaveBeenCalledWith([DOC_ID], expect.any(Function));
    const referencedAfterX = await release.mock.calls[0][1]();
    expect(referencedAfterX.has(DOC_ID)).toBe(true);

    await chatSessionRepository.deleteSessions([y]);
    const referencedAfterY = await release.mock.calls[1][1]();
    expect(referencedAfterY.has(DOC_ID)).toBe(false);
  });

  it('does not release anything for sessions without documents', async () => {
    const session = await chatSessionRepository.createSession('X', [
      {...userText, documents: undefined},
    ]);
    await chatSessionRepository.deleteSession(session.id);
    expect(release).not.toHaveBeenCalled();
  });
});

describe('searched documents', () => {
  it('keeps a searched document referenced by a duplicate after the original goes', async () => {
    const searched = {
      ...userText,
      documents: [{...ref, mode: 'searched' as const}],
    };
    const x = await chatSessionRepository.createSession('X', [searched]);
    await chatSessionRepository.createSession('Y', [searched]);

    await chatSessionRepository.deleteSession(x.id);

    const referenced = await release.mock.calls[0][1]();
    expect(referenced.has(DOC_ID)).toBe(true);
    expect(JSON.parse(mockRows[0].metadata).documents[0].mode).toBe('searched');
  });
});
