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

  it('returns a chip with an invalid id to its prior state after a range change', async () => {
    const chat = renderChat();
    await chat.attach(fortyPages);

    await chooseRange(chat, '3', '5');

    await waitFor(() =>
      expect(chat.screen.getByText('40 pages · ~20.0k tokens')).toBeTruthy(),
    );
    chat.type('go');
    await act(async () => {
      chat.pressSend();
    });
    expect(chat.onSendPress).toHaveBeenCalled();
  });

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

describe('ChatView send gate', () => {
  const big = ref('big', {pageCount: 40, tokenEstimate: 9000});
  const over = (extra = {}) => ({
    kind: 'over' as const,
    needed: 9100,
    available: 3072,
    newDocs: [{ref: big, tokens: 9000, mode: 'searched' as const}],
    historyDocTokens: 0,
    reason: 'new' as const,
    ...extra,
  });
  const store = chatSessionStore as any;

  afterEach(() => {
    store.isEditMode = false;
    store.editingMessageId = null;
    delete store.commitEdit;
  });

  it('writes nothing and keeps the composer when the documents do not fit', async () => {
    const evaluateSendBudget = jest.fn().mockResolvedValue({verdict: over()});
    const chat = renderChat({evaluateSendBudget});
    await chat.attach(big);
    chat.type('Summarise');

    await act(async () => {
      chat.pressSend();
    });

    expect(evaluateSendBudget).toHaveBeenCalledWith(
      expect.objectContaining({text: 'Summarise', documents: [big]}),
      {excludeFromId: undefined},
    );
    expect(chat.onSendPress).not.toHaveBeenCalled();
    expect(chat.input().props.value).toBe('Summarise');
    expect(chat.screen.getByText('big.pdf')).toBeTruthy();
    expect(chat.screen.getByTestId('budget-choose-pages')).toBeTruthy();
    expect(chat.screen.getByTestId('budget-remove')).toBeTruthy();
    expect(chat.screen.getByTestId('budget-cancel')).toBeTruthy();
    expect(chat.screen.queryByTestId('budget-new-chat')).toBeNull();
  });

  it('keeps edit mode when an edited send does not fit', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'edited';
    store.commitEdit = jest.fn();
    const evaluateSendBudget = jest.fn().mockResolvedValue({verdict: over()});
    const chat = renderChat({evaluateSendBudget});
    await chat.attach(big);
    chat.type('rewritten');

    await act(async () => {
      chat.pressSend();
    });

    expect(evaluateSendBudget).toHaveBeenCalledWith(expect.anything(), {
      excludeFromId: 'edited',
    });
    expect(store.commitEdit).not.toHaveBeenCalled();
    expect(chat.onSendPress).not.toHaveBeenCalled();
  });

  it('sends when the window is unknown', async () => {
    const evaluateSendBudget = jest
      .fn()
      .mockResolvedValue({verdict: {kind: 'unknown'}});
    const chat = renderChat({evaluateSendBudget});
    await chat.attach(big);
    chat.type('Summarise');

    await act(async () => {
      chat.pressSend();
    });

    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({documents: [big]}),
    );
    expect(chat.screen.queryByText('big.pdf')).toBeNull();
  });

  it('sends a message without documents in the same tick, without a check', () => {
    const evaluateSendBudget = jest.fn();
    const chat = renderChat({evaluateSendBudget});
    chat.type('hello');

    chat.pressSend();

    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({text: 'hello'}),
    );
    expect(evaluateSendBudget).not.toHaveBeenCalled();
  });

  it('checks the budget when only an earlier message carries a document', async () => {
    const evaluateSendBudget = jest
      .fn()
      .mockResolvedValue({verdict: {kind: 'fits'}});
    const chat = renderChat({
      evaluateSendBudget,
      messages: [{...textMessage, documents: [big]}],
    });
    chat.type('And page two?');

    await act(async () => {
      chat.pressSend();
    });

    expect(evaluateSendBudget).toHaveBeenCalledTimes(1);
    expect(chat.onSendPress).toHaveBeenCalled();
  });

  it('keeps an edited send held across commitEdit until the send settles', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'edited';
    store.commitEdit = jest.fn(async () => {
      documentStore.setComposerHeld([]);
    });
    let heldAtSend: boolean | undefined;
    const evaluateSendBudget = jest
      .fn()
      .mockResolvedValue({verdict: {kind: 'fits'}});
    const chat = renderChat({evaluateSendBudget});
    chat.onSendPress.mockImplementation(async () => {
      heldAtSend = documentStore.isHeld('big');
      return undefined;
    });
    await chat.attach(big);
    chat.type('rewritten');

    await act(async () => {
      chat.pressSend();
    });

    expect(store.commitEdit).toHaveBeenCalled();
    expect(heldAtSend).toBe(true);
    expect(documentStore.isHeld('big')).toBe(false);
  });

  it('removes a document from the sheet and the composer', async () => {
    const evaluateSendBudget = jest.fn().mockResolvedValue({verdict: over()});
    const chat = renderChat({evaluateSendBudget});
    await chat.attach(big);
    chat.type('Summarise');
    await act(async () => {
      chat.pressSend();
    });

    fireEvent.press(chat.screen.getByTestId('budget-remove'));

    expect(chat.screen.queryByText('big.pdf')).toBeNull();
    expect(chat.screen.queryByTestId('budget-remove')).toBeNull();
    expect(documentStore.isHeld('big')).toBe(false);
  });
});

describe('ChatView history overflow', () => {
  const earlier = ref('earlier', {tokenEstimate: 6000});
  const earlierRow = {
    ...textMessage,
    id: 'u1',
    author: user,
    text: 'Read this',
    documents: [earlier],
  };
  const overflow = {
    kind: 'over' as const,
    needed: 6100,
    available: 3072,
    newDocs: [],
    historyDocTokens: 6000,
    reason: 'history' as const,
  };

  it('offers New chat and Edit message instead of per-document actions', async () => {
    const evaluateSendBudget = jest.fn().mockResolvedValue({verdict: overflow});
    const chat = renderChat({evaluateSendBudget, messages: [earlierRow]});
    chat.type('thanks');

    await act(async () => {
      chat.pressSend();
    });

    expect(chat.onSendPress).not.toHaveBeenCalled();
    expect(chat.screen.getByTestId('budget-new-chat')).toBeTruthy();
    expect(chat.screen.getByTestId('budget-edit-message')).toBeTruthy();
    expect(chat.screen.queryByTestId('budget-remove')).toBeNull();

    fireEvent.press(chat.screen.getByTestId('budget-new-chat'));
    expect(chatSessionStore.resetActiveSession).toHaveBeenCalled();
  });

  it('edits the earlier row and keeps what was pending in the composer', async () => {
    const pending = ref('pending');
    const evaluateSendBudget = jest.fn().mockResolvedValue({verdict: overflow});
    const chat = renderChat({evaluateSendBudget, messages: [earlierRow]});
    await chat.attach(pending);
    chat.type('thanks');
    await act(async () => {
      chat.pressSend();
    });

    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('budget-edit-message'));
    });

    expect(chatSessionStore.enterEditMode).toHaveBeenCalledWith('u1');
    expect(chat.input().props.value).toBe('thanks\nRead this');
    expect(chat.screen.getByText('pending.pdf')).toBeTruthy();
    expect(chat.screen.getAllByText('earlier.pdf').length).toBeGreaterThan(0);
    expect(documentStore.isHeld('pending')).toBe(true);
    expect(documentStore.isHeld('earlier')).toBe(true);
  });
});

describe('ChatView plan over under the lease', () => {
  const big = ref('late-over', {pageCount: 40, tokenEstimate: 9000});
  const verdict = {
    kind: 'over' as const,
    reason: 'new' as const,
    needed: 3000,
    available: 1024,
    newDocs: [{ref: big, tokens: 9000, mode: 'searched' as const}],
    historyDocTokens: 0,
  };
  const store = chatSessionStore as any;

  afterEach(() => {
    store.isEditMode = false;
    store.editingMessageId = null;
    delete store.commitEdit;
  });

  const sendAndComeBackOver = async (chat: ReturnType<typeof renderChat>) => {
    (chat.onSendPress as jest.Mock).mockImplementationOnce(
      async (message: any) => ({
        message,
        sessionId: 'session-1',
        verdict,
      }),
    );
    await chat.attach(big);
    chat.type('Summarise');
    await act(async () => {
      chat.pressSend();
    });
  };

  it('restores the composer once and opens the sheet', async () => {
    const evaluateSendBudget = jest
      .fn()
      .mockResolvedValue({verdict: {kind: 'fits'}});
    const chat = renderChat({evaluateSendBudget});

    await sendAndComeBackOver(chat);

    expect(chat.input().props.value).toBe('Summarise');
    expect(chat.screen.getAllByText('late-over.pdf')).toHaveLength(1);
    expect(chat.screen.getByTestId('budget-remove')).toBeTruthy();
  });

  it('restores once through the edit path too', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'edited';
    store.commitEdit = jest.fn(async () => {
      store.isEditMode = false;
    });
    const evaluateSendBudget = jest
      .fn()
      .mockResolvedValue({verdict: {kind: 'fits'}});
    const chat = renderChat({evaluateSendBudget});

    await sendAndComeBackOver(chat);

    expect(store.commitEdit).toHaveBeenCalled();
    expect(chat.input().props.value).toBe('Summarise');
    expect(chat.screen.getAllByText('late-over.pdf')).toHaveLength(1);
    expect(chat.screen.getByTestId('budget-cancel')).toBeTruthy();
  });
});

describe('ChatView predicted document modes', () => {
  const small = ref('small-note', {pageCount: 1, tokenEstimate: 800});
  const planWith = (newModes: Array<'full' | 'searched'>) => ({
    newModes,
    fullLoad: 0,
    room: undefined,
    excerptBudget: 0,
    verdict: {kind: 'fits' as const},
  });

  it('shows the predicted mode on the composer chip', async () => {
    const evaluateSendBudget = jest
      .fn()
      .mockResolvedValue(planWith(['searched']));
    const chat = renderChat({evaluateSendBudget});

    await chat.attach(small);

    await waitFor(() =>
      expect(chat.screen.getByText('1 pages · searched')).toBeTruthy(),
    );
    expect(chat.screen.queryByTestId(/search-instead$/)).toBeNull();
  });

  it('re-predicts when the window changes and ignores a stale result', async () => {
    let resolveFirst: (value: any) => void = () => {};
    const evaluateSendBudget = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveFirst = resolve)),
      )
      .mockResolvedValue(planWith(['full']));
    const chat = renderChat({evaluateSendBudget});
    await chat.attach(small);

    act(() => {
      runInAction(() => {
        modelStore.activeModelId = modelStore.models[0].id;
        modelStore.activeContextSettings = {n_ctx: 8192} as any;
      });
    });
    chat.screen.rerender(chat.element());
    await waitFor(() =>
      expect(
        chat.screen.getByText('1 pages · in full · ~800 tokens'),
      ).toBeTruthy(),
    );
    await act(async () => {
      resolveFirst(planWith(['searched']));
    });

    expect(
      chat.screen.getByText('1 pages · in full · ~800 tokens'),
    ).toBeTruthy();
    expect(evaluateSendBudget).toHaveBeenCalledTimes(2);
    runInAction(() => {
      modelStore.activeContextSettings = undefined;
    });
  });

  it('pins a full chip with Search instead', async () => {
    const evaluateSendBudget = jest.fn(async (message: any) =>
      planWith(
        message.documents.map((d: DocumentRef) =>
          d.searchPinned ? 'searched' : 'full',
        ),
      ),
    );
    const chat = renderChat({evaluateSendBudget});
    await chat.attach(small);
    await waitFor(() => chat.screen.getByText('Search instead'));

    fireEvent.press(chat.screen.getByText('Search instead'));

    await waitFor(() =>
      expect(chat.screen.getByText('1 pages · searched')).toBeTruthy(),
    );
    chat.type('go');
    await act(async () => {
      chat.pressSend();
    });
    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [expect.objectContaining({searchPinned: true})],
      }),
    );
  });

  it('excludes the edited row from the prediction', async () => {
    const store = chatSessionStore as any;
    store.editingMessageId = 'edited';
    const evaluateSendBudget = jest.fn().mockResolvedValue(planWith(['full']));
    const chat = renderChat({evaluateSendBudget});

    await chat.attach(small);

    await waitFor(() =>
      expect(evaluateSendBudget).toHaveBeenCalledWith(expect.anything(), {
        excludeFromId: 'edited',
      }),
    );
    store.editingMessageId = null;
  });
});
