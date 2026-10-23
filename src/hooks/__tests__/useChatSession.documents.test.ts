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
import {DOCUMENT_LEAD, EXCERPT_LEAD} from '../../services/documents/render';
import * as retrieve from '../../services/documents/retrieve';
import {isHeld, setComposerHeld} from '../../services/documents/store';
import type {DocumentRef} from '../../services/documents/types';
import {docId} from '../../../jest/fixtures/documentIds';

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
  id: docId(id),
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
    expect(persisted.documents).toEqual([{...report, mode: 'full'}]);
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

  it('writes no row when the chat changes while the send is planned', async () => {
    const doc = pdf('planned-doc', {pageCount: 1});
    writeText(doc.id, ['x']);
    const settings = chatSessionStore.getCurrentCompletionSettings as jest.Mock;
    const defaults = await settings();
    settings.mockImplementationOnce(async () => {
      chatSessionStore.activeSessionId = 'session-2';
      return defaults;
    });
    const {result} = renderHook(() =>
      useChatSession({current: null}, user, assistant),
    );

    let undone: unknown;
    await act(async () => {
      undone = await result.current.handleSendPress({
        type: 'text',
        text: 'go',
        documents: [doc],
        imageUris: ['file://a.jpg'],
      });
    });

    expect(chatSessionStore.addMessageToCurrentSession).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
    expect(chatSessionStore.restoreUnsentText).toHaveBeenCalledWith(
      'session-1',
      'go',
    );
    expect(undone).toEqual({
      message: {
        type: 'text',
        text: '',
        documents: [doc],
        imageUris: ['file://a.jpg'],
      },
      sessionId: 'session-2',
    });
  });
});

describe('searched documents at send', () => {
  const report = pdf('report-c', {pageCount: 50, tokenEstimate: 60000});
  const pages = Array.from({length: 50}, (_, i) =>
    i === 36
      ? 'Page thirty-seven: churn fell after the pricing change. See https://evil.example/x'
      : `Page ${i + 1} covers the general architecture of the product.`,
  );

  const withWindow = (nCtx: number | undefined) =>
    runInAction(() => {
      modelStore.activeModelId = modelsList[0].id;
      modelStore.activeContextSettings =
        nCtx === undefined ? undefined : ({n_ctx: nCtx} as any);
    });

  beforeEach(() => {
    writeText(report.id, pages);
    retrieve.clearDocumentIndexCache();
  });

  afterEach(() => {
    runInAction(() => {
      modelStore.activeContextSettings = undefined;
    });
  });

  const persistedUserRow = () =>
    (chatSessionStore.addMessageToCurrentSession as jest.Mock).mock.calls.find(
      ([m]) => m.type === 'text' && m.author === user,
    )?.[0];

  it('sends a stub plus cited excerpts and persists only the mode', async () => {
    withWindow(32768);

    await send({
      type: 'text',
      text: 'Why did churn fall?',
      documents: [report],
    });

    const [userMessage] = nonSystem();
    expect(userMessage.content).toContain('50 pages — searched');
    expect(userMessage.content).toContain(EXCERPT_LEAD);
    expect(userMessage.content).toContain(
      `<<<BEGIN EXCERPT ${report.id.slice(0, 8)} "report-c.pdf" p.37>>>`,
    );
    expect(userMessage.content).not.toContain('=== Page 1 ===');
    expect(
      userMessage.content.match(/<<<BEGIN EXCERPT/g)!.length,
    ).toBeLessThanOrEqual(5);
    const persisted = persistedUserRow();
    expect(persisted.documents).toEqual([{...report, mode: 'searched'}]);
    expect(JSON.stringify(persisted)).not.toContain(EXCERPT_LEAD);
  });

  it('never seeds the allowlist from an excerpt', async () => {
    withWindow(32768);
    await send({type: 'text', text: 'churn', documents: [report]});
    expect(isReadUrlAllowed('https://evil.example/x')).toBe(false);
  });

  it('replays an earlier searched row as its stub only', async () => {
    withWindow(32768);
    await send({
      type: 'text',
      text: 'Why did churn fall?',
      documents: [report],
    });
    const turnOne = nonSystem(0)[0].content as string;

    history = [
      assistantRow('a1', 'Pricing.'),
      userRow('u1', 'Why did churn fall?', [{...report, mode: 'searched'}]),
    ];
    await send({type: 'text', text: 'and page 37?'});

    const [replayed, , followUp] = nonSystem(1);
    expect(replayed.content).toBe(
      turnOne.slice(0, turnOne.indexOf(`\n\n${EXCERPT_LEAD}`)) +
        '\n\nWhy did churn fall?',
    );
    expect(followUp.content).toContain('p.37>>>');
    expect(followUp.content.endsWith('and page 37?')).toBe(true);
  });

  it('gives a byte-identical request on an unchanged regenerate', async () => {
    withWindow(32768);
    const pinned = {
      ...pdf('pinned-doc', {pageCount: 2}),
      searchPinned: true as const,
    };
    writeText(pinned.id, ['churn appears here', 'and here']);

    await send({type: 'text', text: 'churn?', documents: [pinned]});
    await send({type: 'text', text: 'churn?', documents: [pinned]});

    expect(persistedUserRow().documents[0].mode).toBe('searched');
    expect(requests[1]).toEqual(requests[0]);
  });

  it('runs no retrieval when every document is full', async () => {
    withWindow(32768);
    const spy = jest.spyOn(retrieve, 'retrieveExcerpts');
    const small = pdf('small-doc', {pageCount: 1});
    writeText(small.id, ['tiny']);

    await send({type: 'text', text: 'hi', documents: [small]});

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('writes nothing and hands back the verdict when the plan is over under the lease', async () => {
    withWindow(4096);
    const earlier = pdf('earlier-full', {tokenEstimate: 6000});
    writeText(earlier.id, ['x']);
    history = [assistantRow('a1', 'ok'), userRow('u1', 'read', [earlier])];
    const {result} = renderHook(() =>
      useChatSession({current: null}, user, assistant),
    );
    let undone: any;

    await act(async () => {
      undone = await result.current.handleSendPress({
        type: 'text',
        text: 'thanks',
      });
    });

    expect(persistedUserRow()).toBeUndefined();
    expect(undone).toMatchObject({
      message: {text: 'thanks'},
      sessionId: 'session-1',
      verdict: {kind: 'over', reason: 'history'},
    });
  });
});

describe('evaluateSendBudget', () => {
  const evaluate = async (
    message: MessageType.PartialText,
    options?: {excludeFromId?: string},
  ) => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, user, assistant),
    );
    return result.current.evaluateSendBudget(message, options);
  };

  const withWindow = (nCtx: number | undefined) =>
    runInAction(() => {
      modelStore.activeModelId = modelsList[0].id;
      modelStore.activeContextSettings =
        nCtx === undefined ? undefined : ({n_ctx: nCtx} as any);
    });

  afterEach(() => {
    runInAction(() => {
      modelStore.activeContextSettings = undefined;
    });
  });

  it('fits without reading anything when no document is involved', async () => {
    withWindow(16);
    history = [userRow('u1', 'x'.repeat(10000))];
    const plan = await evaluate({type: 'text', text: 'hi'});
    expect(plan.verdict).toEqual({kind: 'fits'});
    expect(fs.exists).not.toHaveBeenCalled();
  });

  it('searches a document over the cap and fits a 4096 window', async () => {
    withWindow(4096);
    const big = pdf('big', {tokenEstimate: 9000});
    writeText(big.id, ['x']);

    const plan = await evaluate({
      type: 'text',
      text: 'Summarise',
      documents: [big],
    });

    expect(plan.newModes).toEqual(['searched']);
    expect(plan.verdict).toEqual({kind: 'fits'});
    expect(plan.excerptBudget).toBe(2048);
  });

  it('keeps an earlier full document full and searches the new one', async () => {
    withWindow(8192);
    const earlier = pdf('earlier', {tokenEstimate: 1500});
    const added = {
      ...pdf('added', {tokenEstimate: 1000}),
      kind: 'text' as const,
    };
    writeText(earlier.id, ['x']);
    writeText(added.id, ['y']);
    history = [assistantRow('a1', 'ok'), userRow('u1', 'read', [earlier])];

    const plan = await evaluate({
      type: 'text',
      text: 'and this',
      documents: [added],
    });

    expect(plan.newModes).toEqual(['searched']);
    expect(plan.verdict.kind).toBe('fits');
  });

  it('is unknown without a window', async () => {
    withWindow(undefined);
    const plan = await evaluate({
      type: 'text',
      text: 'x',
      documents: [pdf('a')],
    });
    expect(plan.verdict).toEqual({kind: 'unknown'});
  });

  it('is over for history when earlier full documents alone no longer fit', async () => {
    withWindow(4096);
    const earlier = pdf('earlier', {tokenEstimate: 6000});
    writeText(earlier.id, ['x']);
    history = [assistantRow('a1', 'ok'), userRow('u1', 'read', [earlier])];

    const plan = await evaluate({type: 'text', text: 'thanks'});
    expect(plan.verdict).toMatchObject({kind: 'over', reason: 'history'});
  });

  it('ignores the edited row and everything after it', async () => {
    withWindow(4096);
    const earlier = pdf('earlier', {tokenEstimate: 6000});
    writeText(earlier.id, ['x']);
    history = [assistantRow('a1', 'ok'), userRow('u1', 'read', [earlier])];

    const plan = await evaluate(
      {type: 'text', text: 'rewritten'},
      {excludeFromId: 'u1'},
    );
    expect(plan.verdict).toEqual({kind: 'fits'});
  });

  it('counts a missing document as zero', async () => {
    withWindow(4096);
    history = [
      assistantRow('a1', 'ok'),
      userRow('u1', 'old', [pdf('gone', {tokenEstimate: 50000})]),
    ];
    const plan = await evaluate({type: 'text', text: 'hi'});
    expect(plan.verdict.kind).toBe('fits');
  });
});

describe('document grounding instruction', () => {
  const GROUNDING =
    "You answer questions about the user's attached documents. Use only the document text you are given. If the answer is not in it, say that you could not find it in the document; never guess or fill in from general knowledge. Cite the page when you use a passage.";
  const report = pdf('grounded', {pageCount: 1});

  const usePalWithSearch = async () => {
    palStore.pals = [
      {
        id: 'pal-1',
        type: 'local',
        name: 'Pal',
        systemPrompt: 'You are a careful reader.',
        parameters: {},
        parameterSchema: [],
        isSystemPromptChanged: false,
        useAIPrompt: false,
        source: 'local',
      },
    ] as any;
    chatSessionStore.sessions = [
      {
        id: 'session-1',
        activePalId: 'pal-1',
        title: 'S',
        date: '2026-01-01',
        messages: [],
        completionSettings: {},
        settingsSource: 'pal',
      },
    ] as any;
    const base = await chatSessionStore.getCurrentCompletionSettings();
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockResolvedValue({
      ...base,
      tools: [
        {
          type: 'function',
          function: {name: 'web_search', description: '', parameters: {}},
        },
      ],
    });
  };

  beforeEach(() => writeText(report.id, ['page text']));

  afterEach(() => {
    (chatSessionStore.getCurrentCompletionSettings as jest.Mock).mockReset();
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockResolvedValue({});
  });

  const systemOf = (index = 0) =>
    requests[index].filter(m => m.role === 'system');

  it('is absent when no document is involved', async () => {
    await send({type: 'text', text: 'hello'});
    expect(JSON.stringify(requests[0])).not.toContain(GROUNDING);
  });

  it('is folded last into the one system message, after the pal prompt and talents', async () => {
    await usePalWithSearch();

    await send({type: 'text', text: 'Summarise', documents: [report]});

    const system = systemOf();
    expect(system).toHaveLength(1);
    expect(requests[0][0].role).toBe('system');
    const content = system[0].content as string;
    expect(content.startsWith('You are a careful reader.')).toBe(true);
    expect(content).toContain('web_search');
    expect(content.endsWith(`\n\n${GROUNDING}`)).toBe(true);
  });

  it('is present when only an earlier message carries a document, byte-identical across turns', async () => {
    history = [assistantRow('a1', 'ok'), userRow('u1', 'read', [report])];
    await send({type: 'text', text: 'first'});
    await send({type: 'text', text: 'second'});

    expect(systemOf(0)).toEqual([{role: 'system', content: GROUNDING}]);
    expect(systemOf(1)).toEqual(systemOf(0));
  });

  it('is present for a remote model too', async () => {
    runInAction(() => {
      modelStore.models = [
        ...modelsList,
        {...modelsList[0], id: 'srv/remote', origin: 'remote'},
      ] as any;
      modelStore.activeModelId = 'srv/remote';
    });

    await send({type: 'text', text: 'Summarise', documents: [report]});

    const system = systemOf();
    expect(system).toHaveLength(1);
    expect((system[0].content as string).endsWith(GROUNDING)).toBe(true);
  });

  it('is absent when every document the chat refers to is gone', async () => {
    const gone = pdf('gone-doc', {pageCount: 1});
    history = [assistantRow('a1', 'ok'), userRow('u1', 'read', [gone])];
    const plan = jest.requireActual('../../services/documents/plan');
    const spy = jest.spyOn(plan, 'documentPlan');

    await send({type: 'text', text: 'next', documents: [gone]});

    expect(JSON.stringify(requests[0])).not.toContain(GROUNDING);
    expect(
      (spy.mock.calls[0][0] as {nonDocText: string}).nonDocText,
    ).not.toContain(GROUNDING);
    spy.mockRestore();
  });

  it('is counted as non-document text when planning', async () => {
    const plan = jest.requireActual('../../services/documents/plan');
    const spy = jest.spyOn(plan, 'documentPlan');
    const {result} = renderHook(() =>
      useChatSession({current: null}, user, assistant),
    );

    await result.current.evaluateSendBudget({
      type: 'text',
      text: 'q',
      documents: [report],
    });

    expect((spy.mock.calls[0][0] as {nonDocText: string}).nonDocText).toContain(
      GROUNDING,
    );
    spy.mockRestore();
  });
});

describe('planning a new chat started from a pal', () => {
  afterEach(() => {
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => null),
      configurable: true,
    });
  });

  it('counts the pal prompt before the chat exists', async () => {
    palStore.pals = [
      {
        id: 'pal-new',
        type: 'local',
        name: 'Pal',
        systemPrompt: 'Long pal prompt for the plan.',
        parameters: {},
        parameterSchema: [],
        isSystemPromptChanged: false,
        useAIPrompt: false,
        source: 'local',
      },
    ] as any;
    chatSessionStore.activeSessionId = null as any;
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => 'pal-new'),
      configurable: true,
    });
    const report = pdf('pal-doc', {pageCount: 1});
    const plan = jest.requireActual('../../services/documents/plan');
    const spy = jest.spyOn(plan, 'documentPlan');
    const {result} = renderHook(() =>
      useChatSession({current: null}, user, assistant),
    );

    await result.current.evaluateSendBudget({
      type: 'text',
      text: 'q',
      documents: [report],
    });

    expect((spy.mock.calls[0][0] as {nonDocText: string}).nonDocText).toContain(
      'Long pal prompt for the plan.',
    );
    spy.mockRestore();
  });
});

describe('plan and send share one prompt', () => {
  it('plan prompt strips thinking like the send', async () => {
    const report = pdf('thinking-doc', {pageCount: 1});
    writeText(report.id, ['page text']);
    history = [
      assistantRow('a1', '<think>secret reasoning</think>The answer.'),
      userRow('u1', 'Question', [report]),
    ];
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockResolvedValue({include_thinking_in_context: false});
    const plan = jest.requireActual('../../services/documents/plan');
    const spy = jest.spyOn(plan, 'documentPlan');
    const {result} = renderHook(() =>
      useChatSession({current: null}, user, assistant),
    );

    await result.current.evaluateSendBudget({type: 'text', text: 'next'});

    const {nonDocText} = spy.mock.calls[0][0] as {nonDocText: string};
    expect(nonDocText).toContain('The answer.');
    expect(nonDocText).not.toContain('secret reasoning');
    spy.mockRestore();
    (chatSessionStore.getCurrentCompletionSettings as jest.Mock).mockReset();
    (
      chatSessionStore.getCurrentCompletionSettings as jest.Mock
    ).mockResolvedValue({});
  });
});

describe('reading document text at send', () => {
  const textReads = (id: string) =>
    fs.readFile.mock.calls.filter(([p]: [string]) => p.includes(id)).length;

  beforeEach(() => {
    retrieve.clearDocumentIndexCache();
    runInAction(() => {
      modelStore.activeModelId = modelsList[0].id;
      modelStore.activeContextSettings = {n_ctx: 32768} as any;
    });
  });

  afterEach(() => {
    runInAction(() => {
      modelStore.activeContextSettings = undefined;
    });
  });

  it('reads text only for full refs and probes searched ones', async () => {
    const searched = pdf('searched-only', {pageCount: 1, mode: 'searched'});
    const full = pdf('full-only', {pageCount: 1});
    writeText(searched.id, ['churn notes']);
    writeText(full.id, ['small text']);
    history = [assistantRow('a1', 'ok'), userRow('u1', 'old', [searched])];

    await send({type: 'text', text: 'churn?', documents: [full]});

    expect(textReads(full.id)).toBe(1);
    expect(textReads(searched.id)).toBeLessThanOrEqual(1);
    expect(fs.exists).toHaveBeenCalledWith(
      expect.stringContaining(searched.id),
    );
  });

  it('reads no searched text again while its index is cached', async () => {
    const searched = pdf('warm-cache', {pageCount: 1, mode: 'searched'});
    writeText(searched.id, ['churn notes']);
    history = [assistantRow('a1', 'ok'), userRow('u1', 'old', [searched])];

    await send({type: 'text', text: 'churn?'});
    fs.readFile.mockClear();
    await send({type: 'text', text: 'churn?'});

    expect(textReads(searched.id)).toBe(0);
  });

  it('a persisted bad-id ref renders the missing line and the send is not refused', async () => {
    const bad = {...pdf('ignored'), id: '../models'};
    history = [assistantRow('a1', 'ok'), userRow('u1', 'old', [bad])];

    await send({type: 'text', text: 'hi'});

    expect(nonSystem(0)[0].content).toContain('is no longer available');
    expect(nonSystem(0).at(-1)?.content).toBe('hi');
  });
});

describe('removing rows under the lease', () => {
  const store = chatSessionStore as any;
  const earlier = pdf('lease-earlier', {tokenEstimate: 6000});
  const withWindow = (nCtx: number | undefined) =>
    runInAction(() => {
      modelStore.activeModelId = modelsList[0].id;
      modelStore.activeContextSettings =
        nCtx === undefined ? undefined : ({n_ctx: nCtx} as any);
    });
  const userRows = () =>
    (chatSessionStore.addMessageToCurrentSession as jest.Mock).mock.calls
      .map(([m]) => m)
      .filter(m => m.type === 'text' && m.author === user);
  const callOrder = (fn: unknown) =>
    (fn as jest.Mock).mock.invocationCallOrder[0];

  beforeEach(() => {
    writeText(earlier.id, ['x']);
    history = [
      assistantRow('a2', 'second answer'),
      userRow('m', 'second question'),
      assistantRow('a1', 'first answer'),
      userRow('u1', 'read', [earlier]),
    ];
    store.editingMessageId = null;
  });

  afterEach(() => {
    store.editingMessageId = null;
    runInAction(() => {
      modelStore.activeContextSettings = undefined;
    });
  });

  const sendWith = async (
    message: MessageType.PartialText,
    options?: {replaceFromId?: string; resend?: boolean},
  ) => {
    const {result} = renderHook(() =>
      useChatSession({current: null}, user, assistant),
    );
    let undone: any;
    await act(async () => {
      undone = await result.current.handleSendPress(message, options);
    });
    return undone;
  };

  it('removes nothing when a resend is over under the lease', async () => {
    withWindow(4096);

    const undone = await sendWith(
      {type: 'text', text: 'second question'},
      {replaceFromId: 'm', resend: true},
    );

    expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
    expect(userRows()).toEqual([]);
    expect(undone).toMatchObject({
      sessionId: 'session-1',
      verdict: {kind: 'over'},
    });
  });

  it('keeps the edited row and edit mode when an edited send is over', async () => {
    withWindow(4096);
    store.editingMessageId = 'm';
    const message = {type: 'text' as const, text: 'rewritten'};

    const undone = await sendWith(message, {replaceFromId: 'm'});

    expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
    expect(chatSessionStore.exitEditMode).not.toHaveBeenCalled();
    expect(undone).toMatchObject({
      message,
      sessionId: 'session-1',
      verdict: {kind: 'over'},
    });
  });

  it('ends the edit right before removing from the edited row, then sends', async () => {
    store.editingMessageId = 'm';

    await sendWith({type: 'text', text: 'rewritten'}, {replaceFromId: 'm'});

    expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledWith(
      'm',
      true,
    );
    expect(callOrder(chatSessionStore.exitEditMode)).toBeLessThan(
      callOrder(chatSessionStore.removeMessagesFromId),
    );
    expect(callOrder(chatSessionStore.removeMessagesFromId)).toBeLessThan(
      callOrder(chatSessionStore.addMessageToCurrentSession),
    );
    expect(userRows().map(m => m.text)).toEqual(['rewritten']);
  });

  it('ends the edit and removes only from the resent row', async () => {
    store.editingMessageId = 'u1';

    await sendWith(
      {type: 'text', text: 'second question'},
      {replaceFromId: 'm', resend: true},
    );

    expect(chatSessionStore.exitEditMode).toHaveBeenCalled();
    expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledTimes(1);
    expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledWith(
      'm',
      true,
    );
  });

  it('hands an edited send back when the edit ended before the lease', async () => {
    store.editingMessageId = 'm';
    const settings = chatSessionStore.getCurrentCompletionSettings as jest.Mock;
    const defaults = await settings();
    settings.mockImplementationOnce(async () => {
      store.editingMessageId = null;
      return defaults;
    });
    const message = {type: 'text' as const, text: 'rewritten'};

    const undone = await sendWith(message, {replaceFromId: 'm'});

    expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
    expect(userRows()).toEqual([]);
    expect(undone).toEqual({message, sessionId: 'session-1'});
  });

  it.each([
    [
      'no model is loaded',
      () => {
        modelStore.engine = undefined as any;
      },
    ],
    [
      'the model has no context',
      () => {
        modelStore.context = undefined as any;
      },
    ],
  ])('hands a composer send back when %s', async (_label, unload) => {
    unload();
    const message = {
      type: 'text' as const,
      text: 'go',
      documents: [earlier],
      imageUris: ['file://a.jpg'],
    };

    const undone = await sendWith(message);

    expect(userRows()).toEqual([]);
    expect(undone).toEqual({message, sessionId: 'session-1'});
  });

  it('hands a resend back as nothing when no model is loaded', async () => {
    modelStore.engine = undefined as any;

    const undone = await sendWith(
      {type: 'text', text: 'second question'},
      {replaceFromId: 'm', resend: true},
    );

    expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
    expect(undone).toBeUndefined();
  });
});
