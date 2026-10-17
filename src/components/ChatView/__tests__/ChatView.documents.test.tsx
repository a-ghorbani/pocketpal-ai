import * as React from 'react';
import {runInAction} from 'mobx';
import {pick} from '@react-native-documents/picker';

import {textMessage, user} from '../../../../jest/fixtures';
import {sessionFixtures} from '../../../../jest/fixtures/chatSessions';
import {l10n} from '../../../locales';
import {ChatView} from '../ChatView';
import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {chatSessionStore, modelStore} from '../../../store';
import * as documentStore from '../../../services/documents/store';
import type {DocumentRef} from '../../../services/documents/types';
import type {UndoneSend} from '../../../hooks/useChatSession';

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

const importDocument = jest.spyOn(documentStore, 'importDocument');
const releaseImportHold = jest.spyOn(documentStore, 'releaseImportHold');

const ref = (id: string, extra: Partial<DocumentRef> = {}): DocumentRef => ({
  id,
  name: `${id}.pdf`,
  kind: 'pdf',
  byteSize: 1,
  pageCount: 12,
  charCount: 12400,
  tokenEstimate: 3100,
  ...extra,
});

type ChatProps = Partial<React.ComponentProps<typeof ChatView>>;

const renderChat = (props: ChatProps = {}) => {
  const onSendPress = jest.fn(
    async (): Promise<UndoneSend | undefined> => undefined,
  );
  const element = (extra: ChatProps = {}) => (
    <ChatView
      messages={[textMessage]}
      onSendPress={onSendPress}
      user={user}
      showImageUpload
      {...props}
      {...extra}
    />
  );
  const screen = render(element(), {
    withNavigation: true,
    withBottomSheetProvider: true,
  });
  const input = () =>
    screen.getByPlaceholderText(l10n.en.components.chatInput.inputPlaceholder);
  const type = (text: string) => fireEvent.changeText(input(), text);
  const pressSend = () =>
    fireEvent.press(
      screen.getByLabelText(l10n.en.components.sendButton.accessibilityLabel),
    );
  const attach = async (documentRef: DocumentRef) => {
    (pick as jest.Mock).mockResolvedValueOnce([
      {uri: `content://${documentRef.name}`, name: documentRef.name, size: 1},
    ]);
    importDocument.mockResolvedValueOnce({status: 'ready', ref: documentRef});
    fireEvent.press(screen.getByLabelText('Add attachment'));
    await waitFor(() => screen.getByTestId('attach-document'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('attach-document'));
    });
    await waitFor(() => screen.getByText(documentRef.name));
  };
  return {screen, element, onSendPress, input, type, pressSend, attach};
};

beforeEach(() => {
  jest.clearAllMocks();
  chatSessionStore.sessions = sessionFixtures as any;
  chatSessionStore.activeSessionId = 'session-1';
  runInAction(() => {
    modelStore.activeModelId = 'test-model-id';
  });
});

afterEach(() => {
  documentStore.setComposerHeld([]);
  runInAction(() => {
    modelStore.activeModelId = undefined;
  });
});

describe('ChatView composer documents', () => {
  it('holds an imported document before the import hold is released', async () => {
    let heldAtRelease: boolean | undefined;
    releaseImportHold.mockImplementationOnce(id => {
      heldAtRelease = documentStore.isHeld(id);
    });
    const chat = renderChat();

    await chat.attach(ref('held'));

    expect(heldAtRelease).toBe(true);
    expect(documentStore.isHeld('held')).toBe(true);
  });

  it('keeps document chips across a chat switch and sends them there', async () => {
    const report = ref('report');
    const chat = renderChat();
    await chat.attach(report);

    act(() => {
      runInAction(() => {
        chatSessionStore.activeSessionId = 'session-2';
      });
    });
    chat.screen.rerender(chat.element({messages: []}));
    expect(chat.screen.getByText('report.pdf')).toBeTruthy();

    chat.type('Summarise');
    await act(async () => {
      chat.pressSend();
    });

    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({text: 'Summarise', documents: [report]}),
    );
  });

  it('unholds a chip when it is removed', async () => {
    const chat = renderChat();
    await chat.attach(ref('gone'));

    fireEvent.press(chat.screen.getByLabelText('Remove gone.pdf'));

    expect(documentStore.isHeld('gone')).toBe(false);
    expect(chat.screen.queryByText('gone.pdf')).toBeNull();
  });
});
