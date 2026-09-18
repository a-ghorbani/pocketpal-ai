import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick} from '@react-native-documents/picker';
import {exportChatSession} from '../exportUtils';
import {importChatSessions, validateImportedData} from '../importUtils';
import {chatFolderRepository as folders} from '../../repositories/ChatFolderRepository';
import {chatSessionRepository as chats} from '../../repositories/ChatSessionRepository';

jest.spyOn(chats, 'getSessionById');
jest.spyOn(chats, 'createSession');
jest.spyOn(chats, 'setSessionPinned');

jest.mock('react-native-share', () => ({
  open: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it('round-trips folder names, pinned state, settings, and assistant steps with local IDs', async () => {
  const steps = [{type: 'text', text: 'Saved answer'}];
  const settings = {temperature: 0.3};
  jest.mocked(folders.exportFolder).mockResolvedValueOnce({name: 'Work'});
  jest.mocked(chats.getSessionById).mockResolvedValueOnce({
    session: {
      id: 'foreign-chat',
      title: 'Saved chat',
      date: '2026-09-13',
      folderId: 'foreign-folder',
      pinned: true,
      settingsSource: 'custom',
    },
    completionSettings: {settings: JSON.stringify(settings)},
    messages: [
      {
        id: 'message',
        author: 'assistant',
        type: 'assistant_turn',
        createdAt: 1000,
        metadata: JSON.stringify({steps}),
        toMessageObject: () => ({type: 'assistant_turn', steps}),
      },
    ],
  } as any);
  await exportChatSession('foreign-chat');
  const json = jest.mocked(RNFS.writeFile).mock.calls[0][1] as string;
  const exported = JSON.parse(json);
  expect(exported.folder).toEqual({name: 'Work'});
  expect(exported.folderId).toBeUndefined();
  jest
    .mocked(pick)
    .mockResolvedValueOnce([
      {uri: '/chat.json', name: 'chat.json', type: 'application/json'},
    ] as any);
  jest.mocked(RNFS.readFile).mockResolvedValueOnce(json);
  jest
    .mocked(folders.resolveImportedFolder)
    .mockResolvedValueOnce('local-folder');
  jest
    .mocked(chats.createSession)
    .mockResolvedValueOnce({id: 'local-chat'} as any);
  expect(await importChatSessions()).toBe(1);
  expect(folders.resolveImportedFolder).toHaveBeenCalledWith('Work');
  expect(chats.createSession).toHaveBeenCalledWith(
    'Saved chat',
    [expect.objectContaining({type: 'assistant_turn', steps})],
    expect.objectContaining(settings),
    undefined,
    'custom',
    'local-folder',
  );
  expect(chats.setSessionPinned).toHaveBeenCalledWith('local-chat', true);
});

it('accepts legacy chat exports without folders', async () => {
  jest
    .mocked(pick)
    .mockResolvedValueOnce([
      {uri: '/chat.json', name: 'chat.json', type: 'application/json'},
    ] as any);
  jest
    .mocked(RNFS.readFile)
    .mockResolvedValueOnce(JSON.stringify({title: 'Legacy', messages: []}));
  expect(await importChatSessions()).toBe(1);
  expect(folders.resolveImportedFolder).not.toHaveBeenCalled();
  expect(chats.createSession).toHaveBeenCalledWith(
    'Legacy',
    [],
    expect.anything(),
    undefined,
    'pal',
    null,
  );
});

it('rejects malformed folder metadata before importing chats', () => {
  for (const folder of [
    {name: ''},
    {id: 'foreign'},
    {name: 'x'.repeat(61)},
    'Work',
  ]) {
    expect(() => validateImportedData({title: 'Chat', folder})).toThrow();
  }
});
