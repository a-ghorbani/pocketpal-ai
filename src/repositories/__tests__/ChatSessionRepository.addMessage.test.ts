import {chatSessionRepository} from '../ChatSessionRepository';

const mockFindSession = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../database', () => ({
  database: {
    write: (callback: () => Promise<void>) => callback(),
    collections: {
      get: (name: string) =>
        name === 'chat_sessions'
          ? {find: (id: string) => mockFindSession(id)}
          : {
              query: () => ({fetch: async () => []}),
              create: (build: (record: any) => void) => mockCreate(build),
            },
    },
  },
}));

jest.unmock('../ChatSessionRepository');

const message: any = {
  id: '',
  type: 'text',
  text: 'hello',
  author: {id: 'user'},
  createdAt: 1,
};

describe('ChatSessionRepository.addMessageToSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(async build => {
      const record: any = {id: 'row-1'};
      build(record);
      return record;
    });
  });

  it('writes the row into a session that exists', async () => {
    mockFindSession.mockResolvedValue({id: 'S'});

    const row = await chatSessionRepository.addMessageToSession('S', message);

    expect(mockFindSession).toHaveBeenCalledWith('S');
    expect(row).toMatchObject({id: 'row-1', sessionId: 'S', position: 1});
  });

  it('writes nothing once the session is gone', async () => {
    mockFindSession.mockRejectedValue(new Error('Record not found'));

    const row = await chatSessionRepository.addMessageToSession('S', message);

    expect(row).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
