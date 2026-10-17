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
const setDocumentPageRange = jest.spyOn(documentStore, 'setDocumentPageRange');
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

describe('ChatView page ranges', () => {
  const fortyPages = ref('x', {pageCount: 40, tokenEstimate: 20000});

  const chooseRange = async (
    chat: ReturnType<typeof renderChat>,
    from: string,
    to: string,
  ) => {
    fireEvent.press(chat.screen.getByText('x.pdf'));
    await waitFor(() => chat.screen.getByTestId('document-range-from'));
    fireEvent.changeText(chat.screen.getByTestId('document-range-from'), from);
    fireEvent.changeText(chat.screen.getByTestId('document-range-to'), to);
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('document-range-apply'));
    });
  };

  it('applies a chosen range to the composer chip', async () => {
    const ranged = {
      ...fortyPages,
      pageRange: {from: 3, to: 5},
      tokenEstimate: 1400,
    };
    setDocumentPageRange.mockResolvedValueOnce({status: 'ready', ref: ranged});
    const chat = renderChat();
    await chat.attach(fortyPages);

    await chooseRange(chat, '3', '5');

    expect(setDocumentPageRange).toHaveBeenCalledWith(
      fortyPages,
      3,
      5,
      undefined,
    );
    await waitFor(() =>
      expect(chat.screen.getByText('p. 3–5 of 40 · ~1.4k tokens')).toBeTruthy(),
    );
    expect(chat.screen.queryByTestId('document-range-apply')).toBeNull();

    chat.type('Summarise');
    await act(async () => {
      chat.pressSend();
    });
    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({documents: [ranged]}),
    );
  });

  it('keeps the chip asking for pages when the range is over a limit', async () => {
    setDocumentPageRange.mockResolvedValueOnce({
      status: 'needs_range',
      ref: {...fortyPages, pageRange: {from: 1, to: 40}},
      rangeLimit: 'too_many_chars',
    });
    const chat = renderChat();
    await chat.attach(fortyPages);

    await chooseRange(chat, '1', '40');

    await waitFor(() => chat.screen.getByTestId('document-range-limit'));
    expect(chat.screen.getByText('p. 1–40 of 40 · choose pages')).toBeTruthy();
  });
});
