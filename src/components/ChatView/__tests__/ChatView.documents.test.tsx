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
import type {MessageType} from '../../../utils/types';

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(async () => ({
    assets: [{uri: 'file:///staged.jpg'}],
  })),
}));

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
    await waitFor(() => screen.getAllByText(documentRef.name));
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

  it('sends nothing when the chat changes during the budget check', async () => {
    const evaluateSendBudget = jest
      .fn()
      .mockImplementation(async (message: MessageType.PartialText) => {
        if (message.text === 'Summarise') {
          chatSessionStore.activeSessionId = 'session-2';
        }
        return {verdict: {kind: 'fits'}, newModes: []};
      });
    const chat = renderChat({evaluateSendBudget});
    await chat.attach(big);
    chat.type('Summarise');

    await act(async () => {
      chat.pressSend();
    });

    expect(chat.onSendPress).not.toHaveBeenCalled();
    expect(chat.screen.getByText('big.pdf')).toBeTruthy();
    expect(chat.screen.queryByTestId('budget-cancel')).toBeNull();
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

  it('New chat takes the typed text and chips along, leaving the old draft alone', async () => {
    const pending = ref('carried');
    const evaluateSendBudget = jest.fn().mockResolvedValue({verdict: overflow});
    (chatSessionStore.resetActiveSession as jest.Mock).mockImplementationOnce(
      () => {
        chatSessionStore.activeSessionId = null as any;
      },
    );
    const chat = renderChat({evaluateSendBudget, messages: [earlierRow]});
    await chat.attach(pending);
    chat.type('thanks');
    await act(async () => {
      chat.pressSend();
    });

    fireEvent.press(chat.screen.getByTestId('budget-new-chat'));
    act(() => chat.screen.rerender(chat.element({messages: []})));

    expect(chat.input().props.value).toBe('thanks');
    expect(chat.screen.getByText('carried.pdf')).toBeTruthy();
    expect(chatSessionStore.saveDraft).not.toHaveBeenCalledWith(
      'session-1',
      expect.anything(),
    );
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

describe('ChatView composer merge', () => {
  it('restoring an undone send does not duplicate a chip', async () => {
    const report = ref('restored');
    let settle!: (undone: UndoneSend | undefined) => void;
    const chat = renderChat();
    chat.onSendPress.mockImplementationOnce(
      () =>
        new Promise<UndoneSend | undefined>(resolve => {
          settle = resolve;
        }),
    );
    await chat.attach(report);
    chat.type('Summarise');
    await act(async () => {
      chat.pressSend();
    });
    await chat.attach(report);

    await act(async () => {
      settle({
        message: {type: 'text', text: 'Summarise', documents: [report]},
        sessionId: 'session-1',
      });
    });

    expect(chat.screen.getAllByText('restored.pdf')).toHaveLength(1);
    expect(chat.input().props.value).toBe('Summarise');
  });

  it('restoring attachments alone leaves the composer text as typed', async () => {
    const report = ref('returned');
    let settle!: (undone: UndoneSend | undefined) => void;
    const chat = renderChat();
    chat.onSendPress.mockImplementationOnce(
      () =>
        new Promise<UndoneSend | undefined>(resolve => {
          settle = resolve;
        }),
    );
    await chat.attach(report);
    chat.type('Summarise');
    await act(async () => {
      chat.pressSend();
    });
    chat.type('typed meanwhile');

    await act(async () => {
      settle({
        message: {type: 'text', text: '', documents: [report]},
        sessionId: 'session-1',
      });
    });

    expect(chat.screen.getByText('returned.pdf')).toBeTruthy();
    expect(documentStore.isHeld(report.id)).toBe(true);
    expect(chat.input().props.value).toBe('typed meanwhile');
  });
});

describe('ChatView resend', () => {
  const menuLabels = l10n.en.components.chatView.menuItems;
  const question = {
    ...textMessage,
    id: 'question-row',
    author: user,
    text: 'Earlier question',
  };
  const answer = {
    ...textMessage,
    id: 'answer-row',
    author: {id: 'assistant'},
    text: 'Earlier answer',
  };
  const fits = {
    newModes: [],
    fullLoad: 0,
    room: undefined,
    excerptBudget: 0,
    verdict: {kind: 'fits' as const},
  };
  const store = chatSessionStore as any;

  afterEach(() => {
    store.isEditMode = false;
    store.editingMessageId = null;
    delete store.commitEdit;
  });

  const regenerateAnswer = async (chat: ReturnType<typeof renderChat>) => {
    fireEvent(chat.screen.getByText('Earlier answer'), 'onLongPress', {
      nativeEvent: {pageX: 0, pageY: 0},
    });
    await act(async () => {
      fireEvent.press(chat.screen.getByText(menuLabels.regenerate));
    });
  };

  const stageImage = async (chat: ReturnType<typeof renderChat>) => {
    fireEvent.press(chat.screen.getByLabelText('Add attachment'));
    await waitFor(() => chat.screen.getByTestId('attach-gallery'));
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('attach-gallery'));
    });
  };

  it('Try again keeps the composer text, image and chip, and the chip stays held', async () => {
    const staged = ref('staged-chip');
    let heldDuringSend: boolean | undefined;
    const chat = renderChat({
      messages: [answer, question],
      isVisionEnabled: true,
      evaluateSendBudget: jest.fn().mockResolvedValue(fits),
    });
    chat.onSendPress.mockImplementation(async () => {
      heldDuringSend = documentStore.isHeld(staged.id);
      return undefined;
    });
    await chat.attach(staged);
    await stageImage(chat);
    chat.type('draft');

    await regenerateAnswer(chat);

    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({text: 'Earlier question'}),
      {replaceFromId: 'question-row'},
    );
    expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
    expect(heldDuringSend).toBe(true);
    expect(chat.input().props.value).toBe('draft');
    expect(chat.screen.getByText('staged-chip.pdf')).toBeTruthy();
    expect(chat.screen.getAllByLabelText(/^Image preview/)).toHaveLength(1);
    expect(documentStore.isHeld(staged.id)).toBe(true);
  });

  it('Try again in edit mode commits the edit and clears the composer', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'question-row';
    store.commitEdit = jest.fn(async () => {
      store.isEditMode = false;
    });
    const chat = renderChat({
      messages: [answer, question],
      evaluateSendBudget: jest.fn().mockResolvedValue(fits),
    });
    await chat.attach(ref('edit-chip'));
    chat.type('edited');

    await regenerateAnswer(chat);

    expect(store.commitEdit).toHaveBeenCalled();
    expect(chat.onSendPress).toHaveBeenCalled();
    expect(chat.input().props.value).toBe('');
    expect(chat.screen.queryByText('edit-chip.pdf')).toBeNull();
  });
});

describe('ChatView edit targets for the budget sheet', () => {
  const menuLabels = l10n.en.components.chatView.menuItems;
  const store = chatSessionStore as any;
  const older = ref('older-doc');
  const edited = ref('edited-doc');
  const rowWith = (id: string, text: string, documents: DocumentRef[]) => ({
    ...textMessage,
    id,
    author: user,
    text,
    documents,
  });
  const reply = (id: string, text: string) => ({
    ...textMessage,
    id,
    author: {id: 'assistant'},
    text,
  });
  const historyOver = {
    newModes: [],
    fullLoad: 0,
    room: 0,
    excerptBudget: 0,
    verdict: {
      kind: 'over' as const,
      reason: 'history' as const,
      needed: 6100,
      available: 3072,
      newDocs: [],
      historyDocTokens: 6000,
    },
  };
  const newOver = {
    ...historyOver,
    verdict: {...historyOver.verdict, reason: 'new' as const},
  };

  afterEach(() => {
    store.isEditMode = false;
    store.editingMessageId = null;
    delete store.commitEdit;
  });

  it('Edit message never targets the row in edit', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'edited-row';
    const chat = renderChat({
      messages: [
        rowWith('edited-row', 'Edited row', [edited]),
        reply('r1', 'reply one'),
        rowWith('older-row', 'Older row', [older]),
      ],
      evaluateSendBudget: jest.fn().mockResolvedValue(historyOver),
    });
    chat.type('rewritten');
    await act(async () => {
      chat.pressSend();
    });

    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('budget-edit-message'));
    });

    expect(chatSessionStore.enterEditMode).toHaveBeenCalledWith('older-row');
    expect(chatSessionStore.enterEditMode).not.toHaveBeenCalledWith(
      'edited-row',
    );
  });

  it('Edit message is hidden when no earlier row has documents', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'edited-row';
    const chat = renderChat({
      messages: [rowWith('edited-row', 'Edited row', [edited])],
      evaluateSendBudget: jest.fn().mockResolvedValue(historyOver),
    });
    chat.type('rewritten');
    await act(async () => {
      chat.pressSend();
    });

    expect(chat.screen.getByTestId('budget-new-chat')).toBeTruthy();
    expect(chat.screen.queryByTestId('budget-edit-message')).toBeNull();
  });

  const regenerate = async (
    chat: ReturnType<typeof renderChat>,
    replyText: string,
  ) => {
    fireEvent(chat.screen.getByText(replyText), 'onLongPress', {
      nativeEvent: {pageX: 0, pageY: 0},
    });
    await act(async () => {
      fireEvent.press(chat.screen.getByText(menuLabels.regenerate));
    });
  };

  it('over-budget regenerate merges the draft ahead of the row', async () => {
    const pending = ref('pending-doc');
    const chat = renderChat({
      messages: [
        reply('r1', 'reply one'),
        rowWith('older-row', 'Older row', [older]),
      ],
      evaluateSendBudget: jest.fn().mockResolvedValue(newOver),
    });
    await chat.attach(pending);
    await chat.attach(older);
    chat.type('draft');

    await regenerate(chat, 'reply one');

    expect(chatSessionStore.enterEditMode).toHaveBeenCalledWith('older-row');
    expect(chat.input().props.value).toBe('draft\nOlder row');
    const chips = chat.screen
      .getAllByTestId(/^composer-document-[a-z0-9]+$/)
      .map(node => node.props.accessibilityLabel.split(',')[0]);
    expect(chips).toEqual(['pending-doc.pdf', 'older-doc.pdf']);
    expect(chat.screen.getByTestId('budget-cancel')).toBeTruthy();
    expect(chat.onSendPress).not.toHaveBeenCalled();
  });

  it('over-budget regenerate of the row in edit leaves the composer', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'older-row';
    const chat = renderChat({
      messages: [
        reply('r1', 'reply one'),
        rowWith('older-row', 'Older row', [older]),
      ],
      evaluateSendBudget: jest.fn().mockResolvedValue(newOver),
    });
    chat.type('edited text');

    await regenerate(chat, 'reply one');

    expect(chat.input().props.value).toBe('edited text');
    expect(chatSessionStore.enterEditMode).not.toHaveBeenCalled();
    expect(chat.screen.getByTestId('budget-cancel')).toBeTruthy();
  });
});

describe('leaving an edit that kept the composer', () => {
  const menuLabels = l10n.en.components.chatView.menuItems;
  const store = chatSessionStore as any;
  let shown: any[] = [];
  const drafts = new Map<string, string>();
  const older = ref('older-doc');
  const pending = ref('pending-doc');
  const olderRow = {
    ...textMessage,
    id: 'older-row',
    author: user,
    text: 'Older row',
    documents: [older],
  };
  const secondRow = {
    ...textMessage,
    id: 'second-row',
    author: user,
    text: 'Second row',
    documents: [older],
  };
  const reply = (id: string, text: string) => ({
    ...textMessage,
    id,
    author: {id: 'assistant'},
    text,
  });
  const plan = (verdict: any) => ({
    newModes: [],
    fullLoad: 0,
    room: 0,
    excerptBudget: 0,
    verdict,
  });
  const fits = plan({kind: 'fits'});
  const over = plan({
    kind: 'over',
    reason: 'new',
    needed: 6100,
    available: 3072,
    newDocs: [],
    historyDocTokens: 6000,
  });

  /**
   * Resend gates (message = the row's own text) are over for rows in
   * `overRows`; a composer send is over once after `composerOverOnce`.
   * Mode predictions always fit.
   */
  const overRows = new Set<string>();
  let composerOverOnce = false;
  const rowTexts = new Set(['Older row', 'Second row']);
  const budget = () =>
    jest.fn(
      async (
        message: {text: string},
        {excludeFromId}: {excludeFromId?: string} = {},
      ) => {
        if (rowTexts.has(message.text)) {
          return overRows.has(excludeFromId ?? '') ? over : fits;
        }
        if (composerOverOnce && message.text.includes('\n')) {
          composerOverOnce = false;
          return over;
        }
        return fits;
      },
    );

  beforeEach(() => {
    overRows.clear();
    overRows.add('older-row');
    composerOverOnce = false;
    drafts.clear();
    store.isEditMode = false;
    store.editingMessageId = null;
    (chatSessionStore.enterEditMode as jest.Mock).mockImplementation(
      (id: string) =>
        runInAction(() => {
          store.isEditMode = true;
          store.editingMessageId = id;
        }),
    );
    (chatSessionStore.exitEditMode as jest.Mock).mockImplementation(() =>
      runInAction(() => {
        store.isEditMode = false;
        store.editingMessageId = null;
      }),
    );
    store.commitEdit = jest.fn(async () =>
      runInAction(() => {
        store.isEditMode = false;
        store.editingMessageId = null;
      }),
    );
    (chatSessionStore.saveDraft as jest.Mock).mockImplementation(
      (key: string, text: string) =>
        text.trim() ? drafts.set(key, text) : drafts.delete(key),
    );
    (chatSessionStore.getDraft as jest.Mock).mockImplementation(
      (key: string) => drafts.get(key) ?? '',
    );
  });

  afterEach(() => {
    store.isEditMode = false;
    store.editingMessageId = null;
    delete store.commitEdit;
    (chatSessionStore.enterEditMode as jest.Mock).mockReset();
    (chatSessionStore.exitEditMode as jest.Mock).mockReset();
    (chatSessionStore.saveDraft as jest.Mock).mockReset();
    (chatSessionStore.getDraft as jest.Mock).mockReset().mockReturnValue('');
    chatSessionStore.activeSessionId = 'session-1';
  });

  const composerChips = (chat: ReturnType<typeof renderChat>) =>
    chat.screen
      .queryAllByTestId(/^composer-document-[a-z0-9]+$/)
      .map(node => node.props.accessibilityLabel.split(',')[0]);
  const images = (chat: ReturnType<typeof renderChat>) =>
    chat.screen
      .queryAllByLabelText(/^Image preview/)
      .map(node => node.props.source.uri);

  const regenerate = async (
    chat: ReturnType<typeof renderChat>,
    replyText: string,
  ) => {
    fireEvent(chat.screen.getByText(replyText), 'onLongPress', {
      nativeEvent: {pageX: 0, pageY: 0},
    });
    await act(async () => {
      fireEvent.press(chat.screen.getByText(menuLabels.regenerate));
    });
  };

  /** Draft text, an image and a held chip; then a regenerate that no longer fits. */
  const setUp = async (
    messages: object[] = [reply('r1', 'reply one'), olderRow],
  ) => {
    shown = messages as any[];
    const chat = renderChat({
      messages: messages as any,
      isVisionEnabled: true,
      evaluateSendBudget: budget(),
    });
    await chat.attach(pending);
    fireEvent.press(chat.screen.getByLabelText('Add attachment'));
    await waitFor(() => chat.screen.getByTestId('attach-gallery'));
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('attach-gallery'));
    });
    chat.type('draft');
    await regenerate(chat, 'reply one');
    expect(chat.input().props.value).toBe('draft\nOlder row');
    expect(composerChips(chat)).toEqual(['pending-doc.pdf', 'older-doc.pdf']);
    return {chat};
  };

  /** The mock store is not observable, so a fresh prop stands in for its change. */
  const rerender = (chat: ReturnType<typeof renderChat>) =>
    act(() => chat.screen.rerender(chat.element({messages: [...shown]})));

  const expectRestored = (chat: ReturnType<typeof renderChat>) => {
    expect(store.isEditMode).toBe(false);
    expect(chat.input().props.value).toBe('draft');
    expect(images(chat)).toEqual(['file:///staged.jpg']);
    expect(composerChips(chat)).toEqual(['pending-doc.pdf']);
    expect(documentStore.isHeld(pending.id)).toBe(true);
    expect(documentStore.isHeld(older.id)).toBe(false);
  };

  it('restores the composer when the edit bar is cancelled', async () => {
    const {chat} = await setUp();

    fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
    rerender(chat);

    expectRestored(chat);
    expect(chatSessionStore.exitEditMode).toHaveBeenCalledTimes(1);
  });

  it('restores the composer when edit mode ends from outside', async () => {
    const {chat} = await setUp();

    chatSessionStore.exitEditMode();
    rerender(chat);

    expectRestored(chat);
  });

  it('gives the left chat its draft back on a chat switch and keeps the attachments', async () => {
    drafts.set('session-2', 'two');
    const {chat} = await setUp();

    runInAction(() => {
      store.isEditMode = false;
      store.editingMessageId = null;
      chatSessionStore.activeSessionId = 'session-2';
    });
    rerender(chat);

    expect(drafts.get('session-1')).toBe('draft');
    expect(chat.input().props.value).toBe('two');
    expect(images(chat)).toEqual(['file:///staged.jpg']);
    expect(composerChips(chat)).toEqual(['pending-doc.pdf']);
    expect(documentStore.isHeld(pending.id)).toBe(true);
  });

  it('gives the left chat its draft back on a new chat', async () => {
    const {chat} = await setUp();

    runInAction(() => {
      store.isEditMode = false;
      store.editingMessageId = null;
      chatSessionStore.activeSessionId = null as any;
    });
    rerender(chat);

    expect(drafts.get('session-1')).toBe('draft');
    expect(chat.input().props.value).toBe('');
    expect(composerChips(chat)).toEqual(['pending-doc.pdf']);
    expect(images(chat)).toEqual(['file:///staged.jpg']);
  });

  it('clears the composer after a composer send that fits', async () => {
    const {chat} = await setUp();

    await act(async () => {
      chat.pressSend();
    });
    rerender(chat);

    expect(chat.onSendPress).toHaveBeenCalled();
    expect(chat.input().props.value).toBe('');
    expect(composerChips(chat)).toEqual([]);
  });

  it('brings back a chip removed during the edit', async () => {
    const {chat} = await setUp();

    fireEvent.press(chat.screen.getByLabelText('Remove pending-doc.pdf'));
    fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
    rerender(chat);

    expectRestored(chat);
  });

  it('does not bring back a chip that was still importing and was removed', async () => {
    let finish: (value: any) => void = () => {};
    shown = [reply('r1', 'reply one'), olderRow];
    const chat = renderChat({
      messages: shown,
      evaluateSendBudget: budget(),
    });
    (pick as jest.Mock).mockResolvedValueOnce([
      {uri: 'content://slow.pdf', name: 'slow.pdf', size: 1},
    ]);
    importDocument.mockImplementationOnce(
      () => new Promise(resolve => (finish = resolve)),
    );
    fireEvent.press(chat.screen.getByLabelText('Add attachment'));
    await waitFor(() => chat.screen.getByTestId('attach-document'));
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('attach-document'));
    });
    chat.type('draft');
    await regenerate(chat, 'reply one');

    fireEvent.press(chat.screen.getByLabelText('Remove slow.pdf'));
    fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
    rerender(chat);

    expect(composerChips(chat)).toEqual([]);
    expect(chat.input().props.value).toBe('draft');
    await act(async () => {
      chat.pressSend();
    });
    expect(chat.onSendPress).toHaveBeenCalled();
    finish({status: 'refused', reason: 'copy_failed'});
  });

  it('brings back a removed chip whose import finished during the edit', async () => {
    let finish: (value: any) => void = () => {};
    const slow = ref('slow');
    shown = [reply('r1', 'reply one'), olderRow];
    const chat = renderChat({
      messages: shown,
      evaluateSendBudget: budget(),
    });
    (pick as jest.Mock).mockResolvedValueOnce([
      {uri: 'content://slow.pdf', name: 'slow.pdf', size: 1},
    ]);
    importDocument.mockImplementationOnce(
      () => new Promise(resolve => (finish = resolve)),
    );
    fireEvent.press(chat.screen.getByLabelText('Add attachment'));
    await waitFor(() => chat.screen.getByTestId('attach-document'));
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('attach-document'));
    });
    chat.type('draft');
    await regenerate(chat, 'reply one');
    await act(async () => {
      finish({status: 'ready', ref: slow});
    });

    fireEvent.press(chat.screen.getByLabelText('Remove slow.pdf'));
    fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
    rerender(chat);

    expect(composerChips(chat)).toEqual(['slow.pdf']);
    expect(documentStore.isHeld(slow.id)).toBe(true);
    chat.type('draft');
    await act(async () => {
      chat.pressSend();
    });
    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({documents: [slow]}),
    );
  });

  it('restores the first pre-edit composer after moving the edit to another row', async () => {
    const {chat} = await setUp([
      reply('r2', 'reply two'),
      secondRow,
      reply('r1', 'reply one'),
      olderRow,
    ]);
    overRows.add('second-row');

    await regenerate(chat, 'reply two');
    fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
    rerender(chat);

    expect(chat.input().props.value).toBe('draft');
  });

  it('clears the composer when a plain Edit is cancelled', async () => {
    shown = [olderRow];
    const chat = renderChat({messages: shown});
    fireEvent(chat.screen.getByText('Older row'), 'onLongPress', {
      nativeEvent: {pageX: 0, pageY: 0},
    });
    await act(async () => {
      fireEvent.press(chat.screen.getByText(menuLabels.edit));
    });
    rerender(chat);
    expect(chat.input().props.value).toBe('Older row');

    fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
    rerender(chat);

    expect(chat.input().props.value).toBe('');
    expect(composerChips(chat)).toEqual([]);
  });

  it('keeps the left chat draft when a chat switch ends a plain Edit', async () => {
    drafts.set('session-1', 'earlier');
    drafts.set('session-2', 'two');
    shown = [olderRow];
    const chat = renderChat({messages: shown});
    expect(chat.input().props.value).toBe('earlier');
    fireEvent(chat.screen.getByText('Older row'), 'onLongPress', {
      nativeEvent: {pageX: 0, pageY: 0},
    });
    await act(async () => {
      fireEvent.press(chat.screen.getByText(menuLabels.edit));
    });
    rerender(chat);
    expect(chat.input().props.value).toBe('Older row');

    runInAction(() => {
      store.isEditMode = false;
      store.editingMessageId = null;
      chatSessionStore.activeSessionId = 'session-2';
    });
    rerender(chat);

    expect(drafts.get('session-1')).toBe('earlier');
    expect(chat.input().props.value).toBe('two');
  });

  it('keeps the composer when Try again on a fitting row ends the edit', async () => {
    const {chat} = await setUp();
    overRows.clear();

    await regenerate(chat, 'reply one');
    rerender(chat);

    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({text: 'Older row'}),
      {replaceFromId: 'older-row'},
    );
    expectRestored(chat);
  });

  it('keeps the snapshot through an over-budget composer send, then restores on cancel', async () => {
    const {chat} = await setUp();
    composerOverOnce = true;

    await act(async () => {
      chat.pressSend();
    });
    expect(chat.onSendPress).not.toHaveBeenCalled();
    expect(chat.screen.getByTestId('budget-cancel')).toBeTruthy();

    fireEvent.press(chat.screen.getByTestId('budget-cancel'));
    fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
    rerender(chat);

    expectRestored(chat);
  });
});

describe('ChatView suggested prompts', () => {
  it('a suggested prompt send keeps staged attachments in the composer', async () => {
    const staged = ref('staged-for-later');
    const chat = renderChat({
      messages: [],
      activePal: {
        id: 'pal-with-prompts',
        name: 'Pal',
        greeting: {text: '', suggestedPrompts: ['Tell me more']},
      } as any,
    });
    await chat.attach(staged);

    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('suggested-prompt-chip-0'));
    });

    expect(chat.onSendPress).toHaveBeenCalledWith({
      type: 'text',
      text: 'Tell me more',
    });
    expect(chat.screen.getByText('staged-for-later.pdf')).toBeTruthy();
    expect(documentStore.isHeld(staged.id)).toBe(true);
  });
});
