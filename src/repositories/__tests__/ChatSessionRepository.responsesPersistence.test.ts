jest.unmock('../ChatSessionRepository');

import {database} from '../../database';
import {chatSessionRepository} from '../ChatSessionRepository';

jest.mock('../../database', () => ({
  database: {
    write: jest.fn().mockImplementation(async callback => callback()),
    collections: {
      get: jest.fn(),
    },
  },
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/path',
}));

describe('ChatSessionRepository Responses persistence', () => {
  const responsesState = {
    version: 1 as const,
    binding: {
      wireApi: 'responses' as const,
      serverUrl: 'https://api.example.com',
      modelId: 'responses-model',
    },
    output: [],
    terminalStatus: 'completed' as const,
  };

  it('writes the whole final steps array while preserving other metadata', async () => {
    const record: any = {
      metadata: JSON.stringify({copyable: true, steps: [{content: 'old'}]}),
    };
    const message = {
      update: jest.fn(async callback => callback(record)),
    };
    (database.collections.get as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue(message),
    });
    const steps = [
      {
        content: 'final',
        reasoningContent: 'reasoning',
        toolCalls: [],
        responsesState,
        partial: false,
      },
    ];

    await chatSessionRepository.persistFinalAssistantSteps('message-1', steps);

    expect(JSON.parse(record.metadata)).toEqual({
      copyable: true,
      steps,
    });
  });

  it('rejects when the database write fails', async () => {
    (database.collections.get as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        update: jest.fn().mockRejectedValue(new Error('DB write failed')),
      }),
    });

    await expect(
      chatSessionRepository.persistFinalAssistantSteps('message-1', []),
    ).rejects.toThrow('DB write failed');
  });

  it('rejects a missing message explicitly', async () => {
    (database.collections.get as jest.Mock).mockReturnValue({
      find: jest.fn().mockRejectedValue(new Error('not found')),
    });

    await expect(
      chatSessionRepository.persistFinalAssistantSteps('missing', []),
    ).rejects.toThrow('cannot finalize step');
  });

  it('adds assistant turns without mutating shared metadata', async () => {
    let storedMetadata = '';
    (database.collections.get as jest.Mock).mockReturnValue({
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
      }),
      create: jest.fn(async callback => {
        const record: any = {};
        callback(record);
        storedMetadata = record.metadata;
        return {id: 'message-1'};
      }),
    });
    const metadata = {copyable: true};
    const steps = [{content: 'answer', responsesState}];

    await chatSessionRepository.addMessageToSession('session-1', {
      id: 'memory-id',
      type: 'assistant_turn',
      author: {id: 'assistant'},
      createdAt: 1,
      metadata,
      steps,
    });

    expect(JSON.parse(storedMetadata)).toEqual({
      copyable: true,
      steps,
    });
    expect(metadata).toEqual({copyable: true});
  });

  it('creates sessions with assistant replay state in metadata.steps', async () => {
    let storedMetadata = '';
    (database.collections.get as jest.Mock).mockImplementation(
      (collection: string) => ({
        create: jest.fn(async callback => {
          const record: any = {};
          callback(record);
          if (collection === 'messages') {
            storedMetadata = record.metadata;
          }
          return collection === 'chat_sessions'
            ? {id: 'session-1', date: '2026-09-13T00:00:00.000Z'}
            : {};
        }),
      }),
    );
    const steps = [{content: 'answer', responsesState}];

    await chatSessionRepository.createSession('Session', [
      {
        id: 'assistant-1',
        type: 'assistant_turn',
        author: {id: 'assistant'},
        createdAt: 1,
        metadata: {},
        steps,
      },
    ]);

    expect(JSON.parse(storedMetadata).steps).toEqual(steps);
  });

  it('preserves replay state when merging unrelated message metadata', async () => {
    const steps = [{content: 'answer', responsesState}];
    const record: any = {
      metadata: JSON.stringify({copyable: true, steps}),
    };
    const message = {update: jest.fn(async callback => callback(record))};
    (database.collections.get as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue(message),
    });

    await expect(
      chatSessionRepository.updateMessage('assistant-1', {
        metadata: {interrupted: false},
      }),
    ).resolves.toBe(true);

    expect(JSON.parse(record.metadata)).toEqual({
      copyable: true,
      interrupted: false,
      steps,
    });
  });
});
