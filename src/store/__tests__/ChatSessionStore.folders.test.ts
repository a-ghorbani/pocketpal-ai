import {runInAction} from 'mobx';
import {
  chatSessionStore as store,
  defaultCompletionSettings,
} from '../ChatSessionStore';
import {chatFolderRepository as folders} from '../../repositories/ChatFolderRepository';
import {chatSessionRepository as chats} from '../../repositories/ChatSessionRepository';

jest.spyOn(chats, 'deleteSessions');
jest.spyOn(chats, 'createSession');

const session = (id: string, folderId: string | null, pinned = false) => ({
  id,
  title: `Chat ${id}`,
  folderId,
  pinned,
  date: '2026-09-13T12:00:00Z',
  messages: [],
  messagesLoaded: true,
  completionSettings: defaultCompletionSettings,
  settingsSource: 'custom' as const,
});

beforeAll(async () => {
  await store.initialize();
});

beforeEach(() => {
  jest.clearAllMocks();
  runInAction(() => {
    store.folders = [
      {id: 'a', name: 'Work'},
      {id: 'b', name: 'Home'},
    ];
    store.sessions = [
      session('one', 'a', true),
      session('two', 'b'),
      session('three', null),
      session('orphan', 'missing'),
    ];
    store.folderFilter = null;
    store.sessionSearch = '';
    store.activeSessionId = 'one';
    store.sessionDrafts.clear();
    store.sessionDrafts.set('one', 'Unsent message');
    store.exitSelectionMode();
  });
});

it('filters folders and search together, retaining pinned grouping', () => {
  store.setFolderFilter('a');
  store.setSessionSearch(' ONE ');
  expect(store.visibleSessions.map(s => s.id)).toEqual(['one']);
  expect(
    store.groupedSessions[store.dateGroupNames.pinned].map(s => s.id),
  ).toEqual(['one']);
  store.setFolderFilter('b');
  expect(store.visibleSessions).toEqual([]);
});

it('recovers orphaned references under Unfiled', () => {
  store.setFolderFilter('unfiled');
  expect(store.visibleSessions.map(s => s.id)).toEqual(['three', 'orphan']);
});

it('selects only visible results and clears selection when filter or search changes', () => {
  store.setFolderFilter('a');
  store.enterSelectionMode();
  store.selectAllSessions();
  expect([...store.selectedSessionIds]).toEqual(['one']);
  expect(store.allSelected).toBe(true);
  store.setFolderFilter('b');
  expect(store.selectedCount).toBe(0);
  expect(store.isSelectionMode).toBe(false);
  store.enterSelectionMode('two');
  store.setSessionSearch('two');
  expect(store.selectedCount).toBe(0);
});

it('guards bulk deletion against stale hidden selections', async () => {
  store.setFolderFilter('a');
  store.enterSelectionMode('one');
  store.selectedSessionIds.add('two');
  await store.bulkDeleteSessions();
  expect(chats.deleteSessions).toHaveBeenCalledWith(['one']);
  expect(store.sessions.some(s => s.id === 'two')).toBe(true);
});

it('moves chats without touching active history, date, pins, settings, or draft', async () => {
  const before = {...store.sessions[0]};
  await store.moveSessionsToFolder(['one'], 'b');
  expect(folders.moveSessions).toHaveBeenCalledWith(['one'], 'b');
  expect(store.sessions[0]).toEqual({...before, folderId: 'b'});
  expect(store.activeSessionId).toBe('one');
  expect(store.getDraft('one')).toBe('Unsent message');
});

it('does not mirror failed moves or clear selection', async () => {
  store.enterSelectionMode('one');
  jest
    .mocked(folders.moveSessions)
    .mockRejectedValueOnce(new Error('Disk full'));
  await expect(store.moveSessionsToFolder(['one'], 'b')).rejects.toThrow(
    'Disk full',
  );
  expect(store.sessions[0].folderId).toBe('a');
  expect(store.selectedCount).toBe(1);
});

it('removing a folder preserves every chat and opens Unfiled', async () => {
  store.setFolderFilter('a');
  await store.deleteFolder('a');
  expect(store.sessions).toHaveLength(4);
  expect(store.sessions[0].folderId).toBeNull();
  expect(store.sessions[0].pinned).toBe(true);
  expect(store.folderFilter).toBe('unfiled');
  expect(store.activeSessionId).toBe('one');
  expect(store.getDraft('one')).toBe('Unsent message');
});

it('does not hide a folder when its deletion fails', async () => {
  jest.mocked(folders.remove).mockRejectedValueOnce(new Error('Disk full'));
  await expect(store.deleteFolder('a')).rejects.toThrow();
  expect(store.folders.some(f => f.id === 'a')).toBe(true);
  expect(store.sessions[0].folderId).toBe('a');
});

it('creates and moves in one repository operation', async () => {
  jest
    .mocked(folders.create)
    .mockResolvedValueOnce({id: 'c', name: 'Trips'} as any);
  await store.createFolder('Trips', ['one', 'two']);
  expect(folders.create).toHaveBeenCalledWith('Trips', ['one', 'two']);
  expect(store.sessions.slice(0, 2).map(s => s.folderId)).toEqual(['c', 'c']);
});

it('renames without changing chats', async () => {
  const before = JSON.stringify(store.sessions);
  await store.renameFolder('a', ' Ideas ');
  expect(store.folders.find(f => f.id === 'a')?.name).toBe('Ideas');
  expect(JSON.stringify(store.sessions)).toBe(before);
});

it('uses the selected folder for a new session, and none for All or Unfiled', async () => {
  store.setFolderFilter('a');
  await store.createNewSession('New in folder');
  expect(chats.createSession).toHaveBeenLastCalledWith(
    'New in folder',
    [],
    defaultCompletionSettings,
    undefined,
    'pal',
    'a',
  );
  store.setFolderFilter('unfiled');
  expect(store.newSessionFolderId).toBeNull();
  store.setFolderFilter(null);
  expect(store.newSessionFolderId).toBeNull();
});

it('duplicates into the source folder even when another filter is selected', async () => {
  store.setFolderFilter('b');
  await store.duplicateSession('one');
  expect(chats.createSession).toHaveBeenCalledWith(
    'Chat one - Copy',
    [],
    defaultCompletionSettings,
    undefined,
    'pal',
    'a',
  );
});
