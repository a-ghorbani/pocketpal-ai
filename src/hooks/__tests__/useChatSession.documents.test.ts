import * as RNFS from '@dr.pogodin/react-native-fs';
import {LlamaContext} from 'llama.rn';
import {renderHook, act} from '@testing-library/react-native';
import {runInAction} from 'mobx';

import {sessionFixtures} from '../../../jest/fixtures/chatSessions';
import {
  mockLlamaContextParams,
  modelsList,
} from '../../../jest/fixtures/models';

import {useChatSession} from '../useChatSession';
import {isReadUrlAllowed} from '../../services/talents';
import {DOCUMENT_LEAD} from '../../services/documents/render';
import {isHeld, setComposerHeld} from '../../services/documents/store';
import type {DocumentRef} from '../../services/documents/types';

import {chatSessionStore, modelStore, palStore} from '../../store';
import {MessageType} from '../../utils/types';

const user = {id: 'userId'};
const assistant = {id: 'h3o3lc5xj'};
const ROOT = '/path/to/documents/documents';

const files = new Map<string, string>();
const fs = RNFS as unknown as Record<string, jest.Mock>;

const writeText = (id: string, pages: string[], range = 'all', first = 1) =>
  files.set(
    `${ROOT}/${id}/text.${range}.json`,
    JSON.stringify({version: 1, firstPage: first, pages}),
  );

const pdf = (id: string, extra: Partial<DocumentRef> = {}): DocumentRef => ({
  id,
  name: `${id}.pdf`,
  kind: 'pdf',
  byteSize: 1,
  pageCount: 2,
  charCount: 100,
  tokenEstimate: 25,
  ...extra,
});

const userRow = (
  id: string,
  text: string,
  documents?: DocumentRef[],
  imageUris?: string[],
): MessageType.Text => ({
  id,
  author: user,
  createdAt: 1,
  type: 'text',
  text,
  documents,
  imageUris,
});

const assistantRow = (id: string, text: string): MessageType.Text => ({
  id,
  author: assistant,
  createdAt: 1,
  type: 'text',
  text,
});

let history: MessageType.Any[] = [];
let requests: Array<Array<{role: string; content: any}>> = [];

beforeEach(() => {
  jest.clearAllMocks();
  files.clear();
  history = [];
  requests = [];
  fs.readFile.mockImplementation(async (p: string) => {
    if (!files.has(p)) {
      throw new Error('ENOENT');
    }
    return files.get(p);
  });
  fs.exists.mockImplementation(async (p: string) => files.has(p));
  palStore.pals = [] as any;
  chatSessionStore.sessions = sessionFixtures as any;
  chatSessionStore.activeSessionId = 'session-1';
  modelStore.models = modelsList as any;
  modelStore.activeModelId = undefined;
  modelStore.context = new LlamaContext(mockLlamaContextParams);
  modelStore.engine = {
    completion: jest.fn(async params => {
      requests.push(params.messages!.map((m: any) => ({...m})) as any);
      return {text: 'ok', content: 'ok'} as any;
    }),
    stopCompletion: jest.fn(),
  } as any;
  Object.defineProperty(chatSessionStore, 'currentSessionMessages', {
    get: jest.fn(() => history),
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(chatSessionStore, 'currentSessionMessages', {
    get: jest.fn(() => []),
    configurable: true,
  });
});

const send = async (message: MessageType.PartialText) => {
  const {result} = renderHook(() =>
    useChatSession({current: null}, user, assistant),
  );
  await act(async () => {
    await result.current.handleSendPress(message);
  });
  return result;
};

const nonSystem = (index = 0) =>
  requests[index].filter(m => m.role !== 'system');

describe('useChatSession with documents', () => {
  it('puts the document block before the typed text and persists only the typed text', async () => {
    const report = pdf('report-a', {pageCount: 2});
    writeText(report.id, ['page one', 'page two']);

    await send({type: 'text', text: 'Summarise', documents: [report]});

    const [userMessage] = nonSystem();
    expect(userMessage.content.startsWith(`${DOCUMENT_LEAD}\n\n`)).toBe(true);
    expect(userMessage.content).toContain('=== Page 1 ===\npage one');
    expect(userMessage.content.endsWith('\n\nSummarise')).toBe(true);
    expect(
      requests[0].filter(m => m.role === 'system').length,
    ).toBeLessThanOrEqual(1);

    const persisted = (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mock.calls.find(([m]) => m.type === 'text' && m.author === user)[0];
    expect(persisted.text).toBe('Summarise');
    expect(persisted.documents).toEqual([report]);
  });

  it('replays an earlier document byte-identically on the next turn', async () => {
    const report = pdf('report-b');
    writeText(report.id, ['alpha', 'beta']);
    await send({type: 'text', text: 'Summarise', documents: [report]});
    const firstTurn = nonSystem(0)[0].content;

    history = [
      assistantRow('a1', 'Summary.'),
      userRow('u1', 'Summarise', [report]),
    ];
    await send({type: 'text', text: 'And page two?'});

    const [replayed, reply, followUp] = nonSystem(1);
    expect(replayed.content).toBe(firstTurn);
    expect(reply.role).toBe('assistant');
    expect(followUp.content).toBe('And page two?');
  });

  it('replays two ranges of one document with their own pages', async () => {
    const all = pdf('shared-doc', {pageCount: 5});
    const narrowed = pdf('shared-doc', {
      pageCount: 5,
      pageRange: {from: 3, to: 5},
    });
    writeText(all.id, ['a', 'b', 'c', 'd', 'e']);
    writeText(all.id, ['c', 'd', 'e'], '3-5', 3);
    history = [
      assistantRow('a2', 'ok'),
      userRow('u2', 'narrow', [narrowed]),
      assistantRow('a1', 'ok'),
      userRow('u1', 'all', [all]),
    ];

    await send({type: 'text', text: 'next'});

    const [first, , second] = nonSystem();
    expect(first.content).toContain('=== Page 1 ===\na');
    expect(second.content).toContain('pages 3–5 of 5');
    expect(second.content).not.toContain('=== Page 1 ===');
  });

  it('puts documents in the leading text part next to images', async () => {
    runInAction(() => {
      modelStore.activeModelId = modelsList[0].id;
      modelStore.isMultimodalActive = true;
    });
    expect(modelStore.activeModelCaps.visionActive).toBe(true);
    const a = pdf('doc-a', {pageCount: 1});
    const b: DocumentRef = {
      ...pdf('doc-b'),
      kind: 'text',
      name: 'b.md',
      pageCount: undefined,
    };
    writeText(a.id, ['A text']);
    writeText(b.id, ['B text']);

    await send({
      type: 'text',
      text: 'Compare',
      documents: [a, b],
      imageUris: ['file:///img.jpg'],
    });

    const [userMessage] = nonSystem();
    expect(userMessage.content).toHaveLength(2);
    const [textPart, imagePart] = userMessage.content;
    expect(textPart.type).toBe('text');
    expect(textPart.text.indexOf('doc-a.pdf')).toBeLessThan(
      textPart.text.indexOf('b.md'),
    );
    expect(textPart.text.endsWith('\n\nCompare')).toBe(true);
    expect(imagePart).toEqual({
      type: 'image_url',
      image_url: {url: 'file:///img.jpg'},
    });
    runInAction(() => {
      modelStore.isMultimodalActive = false;
    });
  });

  it('renders a notice for a document whose files are gone', async () => {
    history = [assistantRow('a1', 'ok'), userRow('u1', 'old', [pdf('gone')])];

    await send({type: 'text', text: 'hi'});

    expect(nonSystem()[0].content).toBe(
      `${DOCUMENT_LEAD}\n\n[Attached document "gone.pdf" is no longer available]\n\nold`,
    );
  });

  it('never seeds the read_url allowlist from document text', async () => {
    const doc = pdf('evil-doc', {pageCount: 1});
    writeText(doc.id, ['see https://evil.example/x for details']);

    await send({
      type: 'text',
      text: 'read https://good.example/page',
      documents: [doc],
    });

    expect(isReadUrlAllowed('https://good.example/page')).toBe(true);
    expect(isReadUrlAllowed('https://evil.example/x')).toBe(false);
  });

  it('releases the send hold once the user row is persisted', async () => {
    const doc = pdf('held-doc', {pageCount: 1});
    writeText(doc.id, ['x']);
    const {holdForSend} = jest.requireActual('../../services/documents/store');
    holdForSend([doc.id]);
    let heldAtPersist: boolean | undefined;
    (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mockImplementation(async (m: MessageType.Any) => {
      if (m.type === 'text' && m.author === user) {
        heldAtPersist = isHeld(doc.id);
      }
    });

    await send({type: 'text', text: 'go', documents: [doc]});

    expect(heldAtPersist).toBe(true);
    expect(isHeld(doc.id)).toBe(false);
    (
      chatSessionStore.addMessageToCurrentSession as jest.Mock
    ).mockResolvedValue(undefined);
    setComposerHeld([]);
  });
});
