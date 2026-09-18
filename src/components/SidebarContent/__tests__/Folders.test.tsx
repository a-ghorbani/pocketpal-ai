import React from 'react';
import {Keyboard} from 'react-native';
import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {FolderDialog} from '../FolderDialog';
import {FolderControls} from '../FolderControls';
import {chatSessionStore as store} from '../../../store';

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(Keyboard, 'addListener')
    .mockReturnValue({remove: jest.fn()} as unknown as ReturnType<
      typeof Keyboard.addListener
    >);
  store.folders = [
    {id: 'a', name: 'Work'},
    {id: 'b', name: 'Trips'},
  ];
  store.folderFilter = null;
});

it('exposes creation, folder counts, and visible folder action buttons', () => {
  const create = jest.fn();
  const menu = jest.fn();
  const {getByTestId, getByLabelText} = render(
    <FolderControls onCreate={create} onFolderMenu={menu} />,
  );
  fireEvent.press(getByTestId('new-folder-button'));
  expect(create).toHaveBeenCalled();
  expect(getByLabelText('Work, chats: 0')).toBeTruthy();
  fireEvent.press(getByTestId('folder-actions-a'), {
    nativeEvent: {pageX: 0, pageY: 0},
  });
  expect(menu).toHaveBeenCalledWith({id: 'a', name: 'Work'}, expect.anything());
  fireEvent.press(getByTestId('filter-folder-b'));
  expect(store.setFolderFilter).toHaveBeenCalledWith('b');
});

it('disables saving blank names and cancels without writing', () => {
  const close = jest.fn();
  const {getByTestId, getByText} = render(
    <FolderDialog
      state={{mode: 'create'}}
      onClose={close}
      onMoved={jest.fn()}
    />,
  );
  fireEvent.press(getByTestId('save-folder-button'));
  expect(store.createFolder).not.toHaveBeenCalled();
  fireEvent.press(getByText('Cancel'));
  expect(close).toHaveBeenCalled();
});

it('keeps failed saves open with an actionable error', async () => {
  jest
    .mocked(store.createFolder)
    .mockRejectedValueOnce(new Error('duplicateFolderName'));
  const close = jest.fn();
  const {getByTestId, getByText} = render(
    <FolderDialog
      state={{mode: 'create'}}
      onClose={close}
      onMoved={jest.fn()}
    />,
  );
  fireEvent.changeText(getByTestId('folder-name-input'), 'Work');
  fireEvent.press(getByTestId('save-folder-button'));
  await waitFor(() =>
    expect(getByText('A folder with this name already exists.')).toBeTruthy(),
  );
  expect(close).not.toHaveBeenCalled();
});

it('creates and moves selected chats without leaving the move dialog', async () => {
  jest
    .mocked(store.createFolder)
    .mockResolvedValueOnce({id: 'c', name: 'Ideas'} as any);
  const close = jest.fn();
  const moved = jest.fn();
  const {getByTestId} = render(
    <FolderDialog
      state={{mode: 'move', sessionIds: ['one', 'two']}}
      onClose={close}
      onMoved={moved}
    />,
  );
  fireEvent.press(getByTestId('create-folder-while-moving'));
  fireEvent.changeText(getByTestId('folder-name-input'), 'Ideas');
  fireEvent.press(getByTestId('save-folder-button'));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(store.createFolder).toHaveBeenCalledWith('Ideas', ['one', 'two']);
  expect(moved).toHaveBeenCalledWith('c');
});

it('moves in one tap to an existing folder', async () => {
  const close = jest.fn();
  const {getByTestId} = render(
    <FolderDialog
      state={{mode: 'move', sessionIds: ['one']}}
      onClose={close}
      onMoved={jest.fn()}
    />,
  );
  fireEvent.press(getByTestId('move-folder-b'));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(store.moveSessionsToFolder).toHaveBeenCalledWith(['one'], 'b');
});

it('prevents double submission while a write is pending', async () => {
  let finish!: (result: any) => void;
  jest.mocked(store.createFolder).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const close = jest.fn();
  const {getByTestId} = render(
    <FolderDialog
      state={{mode: 'create'}}
      onClose={close}
      onMoved={jest.fn()}
    />,
  );
  fireEvent.changeText(getByTestId('folder-name-input'), 'Ideas');
  fireEvent.press(getByTestId('save-folder-button'));
  fireEvent.press(getByTestId('save-folder-button'));
  expect(store.createFolder).toHaveBeenCalledTimes(1);
  finish({id: 'c', name: 'Ideas'});
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
