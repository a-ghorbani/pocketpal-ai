// jest/setup.ts globally replaces this module with
// __mocks__/repositories/ChatSessionRepository.js, so the unmock +
// requireActual below are load-bearing: without them every assertion here
// would pass against a stub that always reports success.
const mockFind = jest.fn();
const mockWrite = jest.fn();

jest.mock('../../database', () => ({
  database: {
    write: (callback: () => Promise<void>) => mockWrite(callback),
    collections: {
      get: () => ({
        find: (id: string) => mockFind(id),
      }),
    },
  },
}));

jest.unmock('../ChatSessionRepository');

const {chatSessionRepository} = jest.requireActual('../ChatSessionRepository');

function makeRecord(pinned: boolean) {
  const record: {
    pinned: boolean;
    update: (m: (r: any) => void) => Promise<void>;
  } = {
    pinned,
    update: async mutator => {
      mutator(record);
    },
  };
  return record;
}

describe('ChatSessionRepository.setSessionPinned', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWrite.mockImplementation(async (callback: () => Promise<void>) =>
      callback(),
    );
  });

  it('persists pinned=true', async () => {
    const record = makeRecord(false);
    mockFind.mockResolvedValue(record);

    await chatSessionRepository.setSessionPinned('session1', true);

    expect(mockFind).toHaveBeenCalledWith('session1');
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(record.pinned).toBe(true);
  });

  it('persists pinned=false', async () => {
    const record = makeRecord(true);
    mockFind.mockResolvedValue(record);

    await chatSessionRepository.setSessionPinned('session1', false);

    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(record.pinned).toBe(false);
  });

  // Guards the lost-toggle defect: an absolute setter must never derive the
  // written value from the stored one, so a stale read cannot swallow a tap.
  it('writes the value it was given rather than negating the stored value', async () => {
    const record = makeRecord(true);
    mockFind.mockResolvedValue(record);

    await chatSessionRepository.setSessionPinned('session1', true);

    expect(record.pinned).toBe(true);
  });

  it('applies each of two overlapping calls independently', async () => {
    const written: boolean[] = [];
    const record = makeRecord(false);
    record.update = async mutator => {
      mutator(record);
      written.push(record.pinned);
    };
    mockFind.mockResolvedValue(record);

    await Promise.all([
      chatSessionRepository.setSessionPinned('session1', true),
      chatSessionRepository.setSessionPinned('session1', false),
    ]);

    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(written).toEqual([true, false]);
  });

  // Guards the silent-unpin defect: a missing row must be distinguishable from
  // a successful unpin, so the store can decline to mirror an unconfirmed write.
  it('rejects and performs no write when the session is missing', async () => {
    mockFind.mockRejectedValue(new Error('Record not found'));

    await expect(
      chatSessionRepository.setSessionPinned('missing', true),
    ).rejects.toThrow();

    expect(mockWrite).not.toHaveBeenCalled();
  });
});
