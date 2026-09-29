export {};
const mockFolders: any[] = [];
const mockSessions: any[] = [];
const mockBatch = jest.fn(async (...operations: any[]) => {
  operations.forEach(operation => operation.commit());
});
const mockFind = (records: any[], id: string) => {
  const record = records.find(r => r.id === id);
  return record
    ? Promise.resolve(record)
    : Promise.reject(new Error('Missing record'));
};
const mockFolderCollection = {
  query: () => ({fetch: async () => mockFolders}),
  find: (id: string) => mockFind(mockFolders, id),
  prepareCreate: (change: (r: any) => void) => {
    const folder = {
      id: 'new-local-id',
      name: '',
      commit: () => mockFolders.push(folder),
    };
    change(folder);
    return folder;
  },
  create: async (change: (r: any) => void) => {
    const folder = mockFolderCollection.prepareCreate(change);
    folder.commit();
    return folder;
  },
};

jest.mock('../../database', () => ({
  database: {
    get: (table: string) =>
      table === 'chat_folders'
        ? mockFolderCollection
        : {
            find: (id: string) => mockFind(mockSessions, id),
            query: () => ({
              fetch: async () => mockSessions.filter(s => s.folderId === 'a'),
            }),
          },
    write: async (callback: () => Promise<any>) => callback(),
    batch: (...operations: any[]) => mockBatch(...operations),
  },
}));
jest.unmock('../ChatFolderRepository');
const {chatFolderRepository: repository} = jest.requireActual(
  '../ChatFolderRepository',
);

beforeEach(() => {
  jest.clearAllMocks();
  mockFolders.splice(0, mockFolders.length, {
    id: 'a',
    name: 'Work',
    update: async (change: (r: any) => void) => change(mockFolders[0]),
    prepareDestroyPermanently: () => ({commit: () => mockFolders.splice(0, 1)}),
  });
  mockSessions.splice(
    0,
    mockSessions.length,
    ...['one', 'two'].map(id => {
      const record = {
        id,
        folderId: 'a',
        date: '2026-09-13',
        pinned: true,
        prepareUpdate: (change: (r: any) => void) => ({
          commit: () => change(record),
        }),
      };
      return record;
    }),
  );
});

it('rejects empty, too long, and normalized duplicate names', async () => {
  await expect(repository.create('  ')).rejects.toThrow('invalidFolderName');
  await expect(repository.create('a'.repeat(61))).rejects.toThrow(
    'invalidFolderName',
  );
  await expect(repository.create('  WORK  ')).rejects.toThrow(
    'duplicateFolderName',
  );
  await expect(repository.create('Ｗｏｒｋ')).rejects.toThrow(
    'duplicateFolderName',
  );
  expect(mockBatch).not.toHaveBeenCalled();
});

it('creates a folder and moves unique chat IDs in one atomic batch', async () => {
  const folder = await repository.create(' Trips ', ['one', 'one', 'two']);
  expect(folder.name).toBe('Trips');
  expect(mockBatch).toHaveBeenCalledTimes(1);
  expect(mockBatch.mock.calls[0]).toHaveLength(3);
  expect(mockSessions.map(s => s.folderId)).toEqual([folder.id, folder.id]);
});

it('does not create anything when a selected chat has disappeared', async () => {
  await expect(
    repository.create('Trips', ['one', 'missing']),
  ).rejects.toThrow();
  expect(mockBatch).not.toHaveBeenCalled();
  expect(mockFolders).toHaveLength(1);
});

it('propagates a failed batch without reporting creation success', async () => {
  mockBatch.mockRejectedValueOnce(new Error('Disk full'));
  await expect(repository.create('Trips', ['one'])).rejects.toThrow(
    'Disk full',
  );
  expect(mockFolders).toHaveLength(1);
  expect(mockSessions[0].folderId).toBe('a');
});

it('deletes the folder and clears associations in a single batch, retaining chat data', async () => {
  await repository.remove('a');
  expect(mockBatch).toHaveBeenCalledTimes(1);
  expect(mockBatch.mock.calls[0]).toHaveLength(3);
  expect(mockFolders).toHaveLength(0);
  expect(mockSessions.map(s => [s.id, s.folderId, s.date, s.pinned])).toEqual([
    ['one', null, '2026-09-13', true],
    ['two', null, '2026-09-13', true],
  ]);
});

it('rejects a missing destination before preparing any chat writes', async () => {
  await expect(repository.moveSessions(['one'], 'missing')).rejects.toThrow();
  expect(mockBatch).not.toHaveBeenCalled();
});

it('moves to Unfiled without deleting conversations', async () => {
  await repository.moveSessions(['one'], null);
  expect(mockSessions).toHaveLength(2);
  expect(mockSessions[0].folderId).toBeNull();
  expect(mockSessions[1].folderId).toBe('a');
});

it('renames only the folder and accepts its unchanged normalized name', async () => {
  await repository.rename('a', ' work ');
  expect(mockFolders[0].name).toBe('work');
  expect(mockSessions.every(s => s.folderId === 'a')).toBe(true);
});

it('exports a portable name and safely handles stale references', async () => {
  expect(await repository.exportFolder('a')).toEqual({name: 'Work'});
  expect(await repository.exportFolder('missing')).toBeUndefined();
});

it('remaps imported folders by normalized name or creates a local identifier', async () => {
  expect(await repository.resolveImportedFolder(' WORK ')).toBe('a');
  expect(await repository.resolveImportedFolder('Home')).toBe('new-local-id');
  expect(mockFolders).toHaveLength(2);
});
