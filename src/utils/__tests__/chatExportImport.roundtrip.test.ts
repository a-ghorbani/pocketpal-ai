import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {Q} from '@nozbe/watermelondb';

import toolCallEchoSteps from '../../../jest/fixtures/toolCallEchoSteps.json';
import Message from '../../database/models/Message';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {exportAllChatSessions, exportChatSession} from '../exportUtils';
import {importChatSessions} from '../importUtils';
import {derivedText} from '../chat';
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
});
