import * as React from 'react';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {Q} from '@nozbe/watermelondb';

import {render} from '../../../jest/test-utils';
import toolCallEchoSteps from '../../../jest/fixtures/toolCallEchoSteps.json';
import chatExportV1_22_1 from '../../../jest/fixtures/chatExportV1_22_1.json';
import {TalentSurface} from '../../components/TalentSurface/TalentSurface';
import {registerDefaultTalentUIs} from '../../services/talents/registerTalentUIs';
import Message from '../../database/models/Message';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {exportAllChatSessions, exportChatSession} from '../exportUtils';
import {importChatSessions} from '../importUtils';
import {convertToChatMessages, derivedText} from '../chat';
import {
  extractUrls,
  isReadUrlAllowed,
  resetReadUrlAllowlist,
  seedReadUrlAllowlist,
} from '../../services/talents/readUrlAllowlist';
import {runAgent} from '../../services/agent/AgentRunner';
import {CalculateEngine} from '../../services/talents/CalculateEngine';
import {DatetimeEngine} from '../../services/talents/DatetimeEngine';
import {RenderHtmlEngine} from '../../services/talents/RenderHtmlEngine';
import {WebSearchEngine} from '../../services/talents/WebSearchEngine';
import {ReadUrlEngine} from '../../services/talents/ReadUrlEngine';
import {resetSearchCache} from '../../services/search/searchBudget';
import type {SearchAccess} from '../../services/talents/searchAccess';
import type {SearchProvider} from '../../services/search/types';
import type {TalentEngine} from '../../services/talents/types';
import type {CompletionEngine} from '../completionTypes';
import type {AgentStep, MessageType} from '../types';

type Row = Record<string, any>;

const mockTables: Record<string, Row[]> = {
  chat_sessions: [],
  completion_settings: [],
  messages: [],
};
let mockNextId = 0;

jest.mock('../../database', () => {
  const MessageModel = jest.requireActual(
    '../../database/models/Message',
  ).default;
  const makeRecord = (table: string): Row =>
    table === 'messages' ? Object.create(MessageModel.prototype) : ({} as Row);
  const matches = (row: Row, clauses: any[]) =>
    clauses.every(
      c => !c || c.column !== 'session_id' || row.sessionId === c.value,
    );
  return {
    database: {
      write: async (work: () => Promise<void>) => work(),
      collections: {
        get: (table: string) => ({
          create: async (build: (record: Row) => void) => {
            const record = makeRecord(table);
            record.id = `row-${++mockNextId}`;
            build(record);
            mockTables[table].push(record);
            return record;
          },
          find: async (id: string) => {
            const found = mockTables[table].find(r => r.id === id);
            if (!found) {
              throw new Error('Record not found');
            }
            return found;
          },
          query: (...clauses: any[]) => ({
            fetch: async () => {
              const rows = mockTables[table].filter(r => matches(r, clauses));
              return table === 'messages'
                ? [...rows].sort((a, b) => b.position - a.position)
                : rows;
            },
          }),
        }),
      },
    },
  };
});

jest.unmock('../../repositories/ChatSessionRepository');

jest.mock('react-native-share', () => ({
  open: jest.fn().mockResolvedValue({success: true}),
}));

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const {Text} = require('react-native-paper');
  return (props: {name: string}) => <Text>{props.name}</Text>;
});

const deviceSteps = toolCallEchoSteps as unknown as Record<string, AgentStep[]>;

// Verbatim device rows (jest/fixtures/toolCallEchoSteps.json): a two-step
// turn with two tool calls and their outcomes, and a single-step answer.
const toolTurnSteps = deviceSteps.h6NgzLwcSoKHidpC;
const singleStepTurn = deviceSteps['1rz2QiLZimPTBOQ2'];
const reasoningTurn: AgentStep[] = [
  {
    partial: false,
    reasoningContent: 'The user wants a one-word reply.',
    content: 'OK',
  },
];

const USER = 'user-1';
const ASSISTANT = 'assistant-1';

const storedMetadata = (extra: Row = {}) => ({
  contextId: 'ctx-1',
  conversationId: 'conv-1',
  multimodal: false,
  copyable: true,
  ...extra,
});

/** Seed rows the way the device stores them (assistant text column empty). */
const seedSession = (title: string, turns: Array<[string, any]>) => {
  const session = {
    id: `seed-${title}`,
    title,
    date: '2026-10-10T21:33:32.388Z',
    activePalId: undefined,
  };
  mockTables.chat_sessions.push(session);
  mockTables.completion_settings.push({
    id: `cs-${title}`,
    sessionId: session.id,
    settings: JSON.stringify({version: 4, temperature: 0.7}),
  });
  turns.forEach(([kind, value], i) => {
    const row = Object.create(Message.prototype);
    Object.assign(row, {
      id: `${session.id}-m${i}`,
      sessionId: session.id,
      createdAt: 1791666000000 + i * 1000,
      position: i + 1,
    });
    if (kind === 'user') {
      Object.assign(row, {
        author: USER,
        type: 'text',
        text: value,
        metadata: JSON.stringify(storedMetadata()),
      });
    } else {
      Object.assign(row, {
        author: ASSISTANT,
        type: 'assistant_turn',
        text: undefined,
        metadata: JSON.stringify(
          storedMetadata({
            steps: value,
            timings: {predicted_n: 42, predicted_ms: 1234},
            completionResult: {stopped_eos: true},
          }),
        ),
      });
    }
    mockTables.messages.push(row);
  });
  return session.id;
};

/** What the chat screen gets when it opens a session (ChatSessionStore). */
const openSession = async (id: string) => {
  const data = await chatSessionRepository.getSessionById(id);
  return data!.messages.map(m => m.toMessageObject());
};

const lastWrittenJson = (): string => {
  const calls = (RNFS.writeFile as jest.Mock).mock.calls;
  return calls[calls.length - 1][1];
};

const importJson = async (json: string) => {
  (pick as jest.Mock).mockResolvedValueOnce([
    {uri: 'file:///export.json', name: 'export.json', type: 'application/json'},
  ]);
  (RNFS.readFile as jest.Mock).mockResolvedValueOnce(json);
  const before = new Set(mockTables.chat_sessions.map(s => s.id));
  const count = await importChatSessions();
  const created = mockTables.chat_sessions.filter(s => !before.has(s.id));
  return {count, created};
};

const contentView = (messages: MessageType.Any[]) =>
  messages.map(m => ({
    type: m.type,
    author: m.author.id,
    text: derivedText(m),
    steps: m.type === 'assistant_turn' ? (m as any).steps : undefined,
  }));

describe('chat export -> import round trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockTables).forEach(rows => rows.splice(0));
    (Q.where as jest.Mock).mockImplementation((column, value) => ({
      column,
      value,
    }));
  });

  it('keeps every assistant reply (steps and visible text) of a single exported chat', async () => {
    const originalId = seedSession('tools', [
      ['user', 'What is Firecrawl? Search the web, then answer.'],
      ['assistant', toolTurnSteps],
      ['user', 'Reply with OK'],
      ['assistant', reasoningTurn],
      ['user', 'And once more?'],
      ['assistant', singleStepTurn],
    ]);
    const original = await openSession(originalId);
    expect(derivedText(original[1])).not.toBe('');

    await exportChatSession(originalId);
    const {count, created} = await importJson(lastWrittenJson());

    expect(count).toBe(1);
    expect(created).toHaveLength(1);
    const imported = await openSession(created[0].id);
    expect(contentView(imported)).toEqual(contentView(original));
  });

  it('keeps assistant replies when importing an export of all chats', async () => {
    const a = seedSession('a', [
      ['user', 'What is Firecrawl?'],
      ['assistant', toolTurnSteps],
    ]);
    const b = seedSession('b', [
      ['user', 'Reply with OK'],
      ['assistant', reasoningTurn],
    ]);
    const originals = [await openSession(a), await openSession(b)];

    await exportAllChatSessions();
    const {count, created} = await importJson(lastWrittenJson());

    expect(count).toBe(2);
    const imported = await Promise.all(created.map(s => openSession(s.id)));
    expect(imported.map(contentView)).toEqual(originals.map(contentView));
  });

  it('keeps every exported message field and metadata key', async () => {
    const originalId = seedSession('fields', [
      ['user', 'Hello'],
      ['assistant', toolTurnSteps],
    ]);
    const originalRows = mockTables.messages.map(r => ({
      author: r.author,
      type: r.type,
      text: r.text,
      createdAt: r.createdAt,
      metadata: JSON.parse(r.metadata),
    }));

    await exportChatSession(originalId);
    const exported = JSON.parse(lastWrittenJson());
    const exportedReply = exported.messages.find(
      (m: Row) => m.type === 'assistant_turn',
    );
    expect(Object.keys(exportedReply).sort()).toEqual(
      ['author', 'createdAt', 'id', 'metadata', 'text', 'type'].sort(),
    );
    expect(exportedReply.metadata.steps).toEqual(toolTurnSteps);
    expect(exportedReply.text).toBe(
      derivedText({type: 'assistant_turn', steps: toolTurnSteps} as any),
    );

    const {created} = await importJson(lastWrittenJson());
    const importedRows = mockTables.messages
      .filter(r => r.sessionId === created[0].id)
      .sort((x, y) => x.position - y.position)
      .map(r => ({
        author: r.author,
        type: r.type,
        text: r.text,
        createdAt: r.createdAt,
        metadata: JSON.parse(r.metadata),
      }));
    expect(importedRows).toEqual(originalRows);
  });

  it('imports a pre-structured-turn export whose replies are text rows unchanged', async () => {
    const legacy = {
      id: 'legacy-1',
      title: 'Legacy chat',
      date: '2025-06-01T10:00:00.000Z',
      messages: [
        {
          id: 'm1',
          author: USER,
          text: 'Hi',
          type: 'text',
          metadata: {},
          createdAt: 1,
        },
        {
          id: 'm2',
          author: ASSISTANT,
          text: 'Hello! How can I help?',
          type: 'text',
          metadata: {copyable: true, timings: {predicted_n: 7}},
          createdAt: 2,
        },
      ],
      completionSettings: {temperature: 0.7},
    };

    const {created} = await importJson(JSON.stringify(legacy));
    const imported = await openSession(created[0].id);

    expect(contentView(imported)).toEqual([
      {type: 'text', author: USER, text: 'Hi', steps: undefined},
      {
        type: 'text',
        author: ASSISTANT,
        text: 'Hello! How can I help?',
        steps: undefined,
      },
    ]);
  });

  it('seeds the read_url allowlist from imported replies as the original chat did', async () => {
    const originalId = seedSession('allowlist', [
      ['user', 'What is Firecrawl? Search the web, then answer.'],
      ['assistant', toolTurnSteps],
    ]);
    const original = await openSession(originalId);
    await exportChatSession(originalId);
    const json = lastWrittenJson();
    const {created} = await importJson(json);
    const imported = await openSession(created[0].id);

    const allowedUrls = (messages: MessageType.Any[]) => {
      seedReadUrlAllowlist(convertToChatMessages(messages), messages);
      return extractUrls(json).filter(isReadUrlAllowed);
    };
    const searchHits = toolTurnSteps[0].toolOutcomes!.flatMap(o =>
      o.result.type === 'search' ? o.result.results.map(r => r.url) : [],
    );

    expect(searchHits.length).toBeGreaterThan(0);
    expect(allowedUrls(original)).toEqual(expect.arrayContaining(searchHits));
    expect(allowedUrls(imported)).toEqual(allowedUrls(original));
  });

  describe('a file exported by a released build (v1.22.1)', () => {
    // Produced by v1.22.1's exportChatSession from the verbatim device steps
    // in toolCallEchoSteps.json.
    const exportedReplies = chatExportV1_22_1.messages.filter(
      m => m.type === 'assistant_turn',
    );

    const renderSteps = (steps: AgentStep[]) =>
      JSON.stringify(
        steps.map(step => render(<TalentSurface step={step} />).toJSON()),
      );

    it('restores every reply with the steps and text it was exported with', async () => {
      const {count, created} = await importJson(
        JSON.stringify(chatExportV1_22_1),
      );
      expect(count).toBe(1);
      const imported = await openSession(created[0].id);
      const importedReplies = imported.filter(
        (m): m is MessageType.AssistantTurn => m.type === 'assistant_turn',
      );

      expect(importedReplies).toHaveLength(7);
      expect(
        importedReplies.map(m => ({
          createdAt: m.createdAt,
          steps: m.steps,
          text: derivedText(m),
        })),
      ).toEqual(
        expect.arrayContaining(
          exportedReplies.map(m => ({
            createdAt: m.createdAt,
            steps: deviceSteps[m.id],
            text: m.text,
          })),
        ),
      );
    });

    it('renders the imported tool calls and results as the original rows do', async () => {
      registerDefaultTalentUIs();
      const {created} = await importJson(JSON.stringify(chatExportV1_22_1));
      const imported = await openSession(created[0].id);
      const byCreatedAt = new Map(
        imported.map(m => [m.createdAt, m as MessageType.AssistantTurn]),
      );

      for (const reply of exportedReplies) {
        expect(renderSteps(byCreatedAt.get(reply.createdAt)!.steps)).toEqual(
          renderSteps(deviceSteps[reply.id]),
        );
      }
      const toolTurn = byCreatedAt.get(
        exportedReplies.find(m => m.id === 'h6NgzLwcSoKHidpC')!.createdAt,
      )!;
      const {getByTestId} = render(<TalentSurface step={toolTurn.steps[0]} />);
      expect(
        getByTestId('web-search-result-trigger').props.accessibilityLabel,
      ).toContain('Firecrawl');
    });
  });

  describe('malformed or missing steps in the imported file', () => {
    const importReply = async (reply: Row) => {
      const file = {
        id: 'hand-edited',
        title: 'Hand edited',
        date: '2026-10-10T21:33:32.388Z',
        messages: [
          {id: 'u', author: USER, text: 'Hi', type: 'text', createdAt: 1},
          {
            id: 'a',
            author: ASSISTANT,
            type: 'assistant_turn',
            createdAt: 2,
            ...reply,
          },
        ],
        completionSettings: {},
      };
      const {count, created} = await importJson(JSON.stringify(file));
      expect(count).toBe(1);
      const messages = await openSession(created[0].id);
      expect(() => convertToChatMessages(messages)).not.toThrow();
      expect(() => seedReadUrlAllowlist([], messages)).not.toThrow();
      const turn = messages[1] as MessageType.AssistantTurn;
      expect(turn.type).toBe('assistant_turn');
      return {steps: turn.steps, text: derivedText(turn)};
    };

    it.each([
      ['steps is not an array', {steps: 'oops'}],
      ['steps is null', {steps: null}],
      ['steps has only non-object elements', {steps: [null, 3, 'x', [{}]]}],
      [
        'steps have fields of the wrong type',
        {steps: [{content: 5}, {toolCalls: 'x'}, {toolOutcomes: [null]}]},
      ],
      ['a step has non-string reasoning', {steps: [{reasoningContent: 5}]}],
      ['a step has a non-object tool call', {steps: [{toolCalls: [null]}]}],
      ['steps is absent', {}],
    ])(
      'restores the exported text as one step when %s',
      async (_, metadata) => {
        expect(
          await importReply({
            text: 'Exported answer',
            metadata: {copyable: true, ...metadata},
          }),
        ).toEqual({
          steps: [{content: 'Exported answer'}],
          text: 'Exported answer',
        });
      },
    );

    it('keeps the valid steps and drops malformed ones', async () => {
      const valid = {content: 'Kept', reasoningContent: null, toolCalls: null};
      expect(
        await importReply({
          text: 'Exported answer',
          metadata: {steps: [null, valid, 'x', {content: ['no']}]},
        }),
      ).toEqual({steps: [valid], text: 'Kept'});
    });

    it('imports an empty reply when there are no steps and no text', async () => {
      expect(await importReply({metadata: {steps: 'oops'}})).toEqual({
        steps: [],
        text: '',
      });
    });

    const searchCall = {
      id: 'c1',
      function: {name: 'web_search', arguments: '{"query":"q"}'},
    };
    it.each([
      [
        'a tool call and its outcome are empty objects',
        [{content: 'x', toolCalls: [{}], toolOutcomes: [{}]}],
      ],
      [
        'an outcome has no result',
        [
          {
            content: 'x',
            toolCalls: [searchCall],
            toolOutcomes: [{callId: 'c1'}],
          },
        ],
      ],
      [
        'a search result has no results list',
        [
          {
            toolCalls: [searchCall],
            toolOutcomes: [
              {
                callId: 'c1',
                toolName: 'web_search',
                result: {type: 'search', query: 'q'},
                responseContent: '',
              },
            ],
          },
        ],
      ],
      [
        'a search result has a null hit',
        [
          {
            toolCalls: [searchCall],
            toolOutcomes: [
              {
                callId: 'c1',
                toolName: 'web_search',
                result: {type: 'search', query: 'q', results: [null]},
                responseContent: '',
              },
            ],
          },
        ],
      ],
    ])('opens and continues the chat when %s', async (_, steps) => {
      registerDefaultTalentUIs();
      const {steps: imported} = await importReply({
        text: 'Exported answer',
        metadata: {steps},
      });
      for (const step of imported) {
        expect(() => render(<TalentSurface step={step} />)).not.toThrow();
      }
    });

    const call = (id: string, name: string, extra: Row = {}) => ({
      id,
      type: 'function',
      function: {name, arguments: '{}'},
      ...extra,
    });
    const outcome = (callId: string, toolName: string, result: Row) => ({
      callId,
      toolName,
      result: {summary: 's', ...result},
      responseContent: 's',
    });
    const hit = {url: 'https://a.example/', title: 'A', snippet: 'a'};
    const wellFormedStep = {
      content: 'Used every tool',
      toolCalls: [
        call('c1', 'web_search', {metrics: {tokens: 3, durationMs: 10}}),
        call('c2', 'render_html'),
        {id: 'c3', function: {name: 'read_url', arguments: {url: hit.url}}},
        call('c4', 'speak'),
        call('c5', 'render_html'),
        call('c6', 'read_url'),
        call('c7', 'render_html'),
      ],
      toolOutcomes: [
        outcome('c1', 'web_search', {
          type: 'search',
          query: 'q',
          results: [hit],
        }),
        outcome('c2', 'render_html', {type: 'html', html: '<p/>', title: 'T'}),
        outcome('c3', 'read_url', {type: 'text', links: [hit.url]}),
        outcome('c4', 'speak', {type: 'audio', audioUri: 'file:///a.wav'}),
        outcome('c5', 'render_html', {type: 'error', errorMessage: 'boom'}),
        outcome('c6', 'read_url', {type: 'text'}),
        outcome('c7', 'render_html', {type: 'html', html: '<p/>'}),
      ],
    };

    it('keeps a step whose tool calls and results of every type are well formed', async () => {
      registerDefaultTalentUIs();
      const {steps} = await importReply({
        text: 'Exported answer',
        metadata: {steps: [wellFormedStep]},
      });
      expect(steps).toEqual([wellFormedStep]);
      expect(() =>
        render(<TalentSurface step={steps[0]} />, {withNavigation: true}),
      ).not.toThrow();
    });

    const withCall = (index: number, value: unknown) => ({
      ...wellFormedStep,
      toolCalls: wellFormedStep.toolCalls.map((c, i) =>
        i === index ? value : c,
      ),
    });
    const withOutcome = (index: number, change: (o: Row) => unknown) => ({
      ...wellFormedStep,
      toolOutcomes: wellFormedStep.toolOutcomes.map((o, i) =>
        i === index ? change(o) : o,
      ),
    });
    const withResult = (index: number, result: Row) =>
      withOutcome(index, o => ({...o, result: {...o.result, ...result}}));
    const withHit = (value: unknown) => withResult(0, {results: [hit, value]});

    it.each([
      ['a call id is not a string', withCall(1, call(7 as any, 'render_html'))],
      ['a call has no function', withCall(1, {id: 'c2'})],
      [
        'a call function name is not a string',
        withCall(1, {id: 'c2', function: {name: 1, arguments: '{}'}}),
      ],
      [
        'a call function has no arguments',
        withCall(1, {id: 'c2', function: {name: 'render_html'}}),
      ],
      [
        'call metrics are not numbers',
        withCall(
          0,
          call('c1', 'web_search', {metrics: {tokens: '3', durationMs: 10}}),
        ),
      ],
      [
        'call metrics have no duration',
        withCall(0, call('c1', 'web_search', {metrics: {tokens: 3}})),
      ],
      ['an outcome is not an object', withOutcome(1, () => 'x')],
      [
        'an outcome callId is not a string',
        withOutcome(1, o => ({...o, callId: 2})),
      ],
      [
        'an outcome has no toolName',
        withOutcome(1, o => ({...o, toolName: undefined})),
      ],
      [
        'an outcome has no responseContent',
        withOutcome(1, o => ({...o, responseContent: undefined})),
      ],
      ['a result has no summary', withResult(1, {summary: undefined})],
      ['a result type is unknown', withResult(1, {type: 'video'})],
      [
        'a result type is an Object.prototype key',
        withResult(1, {type: 'toString'}),
      ],
      ['an html result has no html', withResult(1, {html: undefined})],
      ['an html result title is not a string', withResult(1, {title: {}})],
      ['a text result links is not an array', withResult(2, {links: 'x'})],
      ['a text result link is not a string', withResult(2, {links: [null]})],
      ['an audio result has no audioUri', withResult(3, {audioUri: undefined})],
      [
        'an error result has no errorMessage',
        withResult(4, {errorMessage: undefined}),
      ],
      ['a search result query is not a string', withResult(0, {query: 5})],
      ['a search result has no results', withResult(0, {results: undefined})],
      ['a search hit is null', withHit(null)],
      ['a search hit url is not a string', withHit({...hit, url: undefined})],
      ['a search hit title is not a string', withHit({...hit, title: {}})],
      ['a search hit snippet is not a string', withHit({...hit, snippet: []})],
    ])('restores the exported text as one step when %s', async (_, step) => {
      expect(
        await importReply({text: 'Exported answer', metadata: {steps: [step]}}),
      ).toEqual({
        steps: [{content: 'Exported answer'}],
        text: 'Exported answer',
      });
    });

    it('imports an empty reply when there are no steps and the text is empty', async () => {
      expect(await importReply({text: '', metadata: {}})).toEqual({
        steps: [],
        text: '',
      });
    });

    it('imports a reply whose metadata is not an object', async () => {
      expect(
        await importReply({text: 'Exported answer', metadata: 'oops'}),
      ).toEqual({
        steps: [{content: 'Exported answer'}],
        text: 'Exported answer',
      });
      const stored = mockTables.messages.find(r => r.author === ASSISTANT)!;
      expect(JSON.parse(stored.metadata)).toEqual({
        steps: [{content: 'Exported answer'}],
      });
    });
  });

  describe('replies written by the agent runner', () => {
    const pageUrl = 'https://mars.example/news';
    const linkedUrl = 'https://mars.example/rover';

    const searchAccess = (): SearchAccess => {
      const provider: SearchProvider = {
        id: 'tavily',
        search: async () => [
          {title: 'Mars news', url: pageUrl, snippet: 'Rover lands.'},
          {title: '', url: 'https://mars.example/empty', snippet: ''},
        ],
        read: async url => ({
          url,
          title: 'Mars news',
          text: `The rover landed. More at ${linkedUrl}`,
        }),
      };
      return {
        getActiveProvider: () => provider,
        canSearch: () => true,
        getResultCount: () => 5,
        readWithDefaultReader: async url => ({url, text: ''}),
      };
    };

    const throwing = (name: string): TalentEngine => ({
      name,
      execute: async () => {
        throw new Error('engine crashed');
      },
      toToolDefinition: () => ({
        type: 'function',
        function: {name, description: name, parameters: {}},
      }),
    });

    const rawCall = (id: string | null, name: string, args: unknown) => ({
      id,
      type: 'function',
      function: {name, arguments: args},
    });

    const scriptedEngine = (
      turns: Array<{calls?: any[]; content?: string; reasoning?: string}>,
    ): CompletionEngine => {
      let index = 0;
      return {
        completion: async (_params, onData) => {
          const turn = turns[index++] ?? {};
          if (turn.reasoning) {
            onData?.({reasoning_content: turn.reasoning} as any);
          }
          if (turn.calls) {
            onData?.({tool_calls: turn.calls} as any);
          }
          if (turn.content) {
            onData?.({content: turn.content} as any);
          }
          return {
            text: turn.content ?? '',
            content: turn.content ?? '',
            reasoning_content: turn.reasoning,
            tool_calls: turn.calls,
          } as any;
        },
        stopCompletion: async () => {},
      };
    };

    /** Steps as the chat hook persists them from the runner's events. */
    const runAndPersist = async (
      engine: CompletionEngine,
      talents: Record<string, TalentEngine>,
      signal?: AbortSignal,
    ): Promise<AgentStep[]> => {
      const steps: AgentStep[] = [];
      const last = () => steps[steps.length - 1];
      for await (const event of runAgent({
        engine,
        initialParams: {messages: []} as any,
        allowedTalentNames: Object.keys(talents).filter(n => n !== 'missing'),
        talentLookup: name => (name === 'missing' ? undefined : talents[name]),
        triggerMarkers: [],
        messageId: 'm',
        signal,
      })) {
        if (event.type === 'step_started') {
          steps.push({partial: true});
        } else if (event.type === 'token') {
          const step = last();
          if (event.delta.content) {
            step.content = (step.content ?? '') + event.delta.content;
          }
          if (event.delta.reasoningContent) {
            step.reasoningContent =
              (step.reasoningContent ?? '') + event.delta.reasoningContent;
          }
        } else if (event.type === 'step_finished') {
          if (event.toolCalls?.length) {
            last().toolCalls = event.toolCalls;
          }
          last().partial = false;
        } else if (event.type === 'tool_call_finished') {
          last().toolOutcomes = [...(last().toolOutcomes ?? []), event.outcome];
        }
      }
      return steps;
    };

    const exportAndImport = async (steps: AgentStep[]) => {
      const originalId = seedSession('agent', [
        ['user', 'Use every tool'],
        ['assistant', steps],
      ]);
      await exportChatSession(originalId);
      const {created} = await importJson(lastWrittenJson());
      const imported = await openSession(created[0].id);
      const reply = imported.find(m => m.type === 'assistant_turn');
      return (reply as MessageType.AssistantTurn).steps;
    };

    beforeEach(() => {
      resetReadUrlAllowlist();
      resetSearchCache();
    });

    it('keeps the steps of a run that produced every result the talents return', async () => {
      const access = searchAccess();
      const talents: Record<string, TalentEngine> = {
        calculate: new CalculateEngine(),
        datetime: new DatetimeEngine(),
        render_html: new RenderHtmlEngine(),
        web_search: new WebSearchEngine(access),
        read_url: new ReadUrlEngine(access),
        crashing: throwing('crashing'),
        missing: throwing('missing'),
      };
      const steps = await runAndPersist(
        scriptedEngine([
          {
            reasoning: 'Use the tools.',
            content: 'Looking it up.',
            calls: [
              rawCall(null, 'calculate', '{"expression":"2*3"}'),
              rawCall(null, 'datetime', '{}'),
              rawCall('h1', 'render_html', '{"html":"<p>x</p>","title":"T"}'),
              rawCall('h2', 'render_html', '{"html":""}'),
            ],
          },
          {
            calls: [
              rawCall('s1', 'web_search', '{"query":"mars"}'),
              rawCall('s2', 'web_search', '{}'),
              rawCall('x1', 'calculate', '{bad json'),
              rawCall('x2', 'not_enabled', '{}'),
              rawCall('x3', 'missing', '{}'),
              rawCall('x4', 'crashing', '{}'),
              rawCall('x5', '', '{}'),
            ],
          },
          {calls: [rawCall('r1', 'read_url', `{"url":"${pageUrl}"}`)]},
          {content: 'The rover landed.'},
        ]),
        talents,
      );
      const results = steps.flatMap(s =>
        (s.toolOutcomes ?? []).map(o => o.result.type),
      );
      expect(new Set(results)).toEqual(
        new Set(['text', 'html', 'error', 'search']),
      );
      expect(steps[2].toolOutcomes![0].result).toMatchObject({
        type: 'text',
        links: [linkedUrl],
      });
      expect(steps.every(s => !s.toolCalls?.some(c => !c.metrics))).toBe(true);

      expect(await exportAndImport(steps)).toEqual(
        JSON.parse(JSON.stringify(steps)),
      );
    });

    it('keeps tool calls whose arguments arrive parsed and a cancelled call', async () => {
      const controller = new AbortController();
      const aborting: TalentEngine = {
        ...throwing('aborting'),
        execute: async () => {
          controller.abort();
          return {type: 'text', summary: 'stopped'};
        },
      };
      const steps = await runAndPersist(
        scriptedEngine([
          {
            calls: [
              rawCall('p1', 'aborting', '{}'),
              rawCall('p2', 'calculate', {expression: '1+1'}),
              rawCall('p3', 'calculate', '{"expression":"2+2"}'),
              rawCall('p4', 'calculate', '{"expression":"3+3"}'),
              rawCall('p5', 'calculate', '{"expression":"4+4"}'),
            ],
          },
        ]),
        {aborting, calculate: new CalculateEngine()},
        controller.signal,
      );
      const outcomes = steps[0].toolOutcomes!;
      expect(outcomes[4].result).toEqual({
        type: 'error',
        summary: 'calculate: cancelled',
        errorMessage: 'cancelled',
      });
      expect(steps[0].toolCalls![1].function.arguments).toEqual({
        expression: '1+1',
      });

      expect(await exportAndImport(steps)).toEqual(
        JSON.parse(JSON.stringify(steps)),
      );
    });
  });
});
