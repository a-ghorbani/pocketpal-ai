import * as React from 'react';
import {runInAction} from 'mobx';
import {pick} from '@react-native-documents/picker';

import {textMessage, user} from '../../../../jest/fixtures';
import {sessionFixtures} from '../../../../jest/fixtures/chatSessions';
import {l10n} from '../../../locales';
import * as memoryEstimator from '../../../utils/memoryEstimator';
import {ChatView} from '../ChatView';
import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {chatSessionStore, modelStore, uiStore} from '../../../store';
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

const mockReload: {finish?: (success: boolean, target: number) => void} = {};
jest.mock('../../IncreaseContextSheet', () => {
  const {Pressable} = require('react-native');
  return {
    IncreaseContextSheet: ({onReloadStart, onClose, onReloadResult}: any) => (
      <Pressable
        testID="mock-reload-start"
        onPress={() => {
          mockReload.finish = onReloadResult;
          onReloadStart();
          onClose();
        }}
      />
    ),
  };
});

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
      expect(chat.screen.getByText('40 pages · ~20k tokens')).toBeTruthy(),
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

  it("leaves another chip's range sheet open when an earlier range finishes", async () => {
    const other = ref('y', {pageCount: 40, tokenEstimate: 20000});
    let finish: (result: any) => void = () => {};
    setDocumentPageRange.mockImplementationOnce(
      () => new Promise(resolve => (finish = resolve)),
    );
    const chat = renderChat();
    await chat.attach(fortyPages);
    await chat.attach(other);
    await chooseRange(chat, '3', '5');

    fireEvent.press(chat.screen.getByText('y.pdf'));
    await waitFor(() => chat.screen.getByTestId('document-range-from'));
    await act(async () => {
      finish({
        status: 'ready',
        ref: {...fortyPages, pageRange: {from: 3, to: 5}, tokenEstimate: 1400},
      });
    });

    expect(chat.screen.getByTestId('document-range-from')).toBeTruthy();
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
    expect(store.isEditMode).toBe(true);
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

  it.each([
    ['more after the sent text', 'Summarise and more', 'and more'],
    ['something else', 'Other words', 'Other words'],
  ])(
    'keeps what was typed during the check when it is %s',
    async (_label, typed, kept) => {
      let answer: (plan: unknown) => void = () => {};
      const evaluateSendBudget = jest
        .fn()
        .mockImplementation(async (message: {text: string}) =>
          message.text === 'Summarise'
            ? new Promise(resolve => (answer = resolve))
            : {verdict: {kind: 'fits'}, newModes: []},
        );
      const chat = renderChat({evaluateSendBudget});
      await chat.attach(big);
      chat.type('Summarise');
      await act(async () => {
        chat.pressSend();
      });
      chat.type(typed);

      await act(async () => {
        answer({verdict: {kind: 'fits'}, newModes: []});
      });

      expect(chat.onSendPress).toHaveBeenCalledWith(
        expect.objectContaining({text: 'Summarise'}),
      );
      expect(chat.input().props.value).toBe(kept);
    },
  );

  it.each([
    ['a leading space', ' hello'],
    ['a leading newline', '\nhello'],
    ['surrounding whitespace', '  hello \n'],
  ])('clears a sent message that began with %s', async (_label, typed) => {
    const chat = renderChat();
    chat.type(typed);

    await act(async () => {
      chat.pressSend();
    });

    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({text: 'hello'}),
    );
    expect(chat.input().props.value).toBe('');
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

  it('keeps an edited send held until the send settles', async () => {
    store.isEditMode = true;
    store.editingMessageId = 'edited';
    let heldAtSend: boolean | undefined;
    const evaluateSendBudget = jest
      .fn()
      .mockResolvedValue({verdict: {kind: 'fits'}});
    const chat = renderChat({evaluateSendBudget});
    chat.onSendPress.mockImplementation(async () => {
      await Promise.resolve();
      heldAtSend = documentStore.isHeld('big');
      return undefined;
    });
    await chat.attach(big);
    chat.type('rewritten');

    await act(async () => {
      chat.pressSend();
    });

    expect(chat.onSendPress).toHaveBeenCalledWith(expect.anything(), {
      replaceFromId: 'edited',
    });
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

  it('offers New chat, not per-document actions or Edit message', async () => {
    const evaluateSendBudget = jest.fn().mockResolvedValue({verdict: overflow});
    const chat = renderChat({evaluateSendBudget, messages: [earlierRow]});
    chat.type('thanks');

    await act(async () => {
      chat.pressSend();
    });

    expect(chat.onSendPress).not.toHaveBeenCalled();
    expect(chat.screen.getByTestId('budget-new-chat')).toBeTruthy();
    expect(chat.screen.getByTestId('budget-cancel')).toBeTruthy();
    expect(chat.screen.queryByTestId('budget-edit-message')).toBeNull();
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
    (chatSessionStore.getDraft as jest.Mock).mockImplementation(
      (key: string) => (key === '__new_chat__' ? 'new chat draft' : ''),
    );
    const chat = renderChat({
      evaluateSendBudget,
      messages: [earlierRow],
      isVisionEnabled: true,
    });
    await chat.attach(pending);
    fireEvent.press(chat.screen.getByLabelText('Add attachment'));
    await waitFor(() => chat.screen.getByTestId('attach-gallery'));
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('attach-gallery'));
    });
    chat.type('thanks');
    await act(async () => {
      chat.pressSend();
    });

    fireEvent.press(chat.screen.getByTestId('budget-new-chat'));
    act(() => chat.screen.rerender(chat.element({messages: []})));

    expect(chat.input().props.value).toBe('thanks\nnew chat draft');
    expect(chat.screen.getByText('carried.pdf')).toBeTruthy();
    expect(chat.screen.getAllByLabelText(/^Image preview/)).toHaveLength(1);
    expect(documentStore.isHeld(pending.id)).toBe(true);
    expect(chatSessionStore.saveDraft).not.toHaveBeenCalledWith(
      'session-1',
      expect.anything(),
    );
    (chatSessionStore.getDraft as jest.Mock).mockReset().mockReturnValue('');
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

  it('restoring an undone send keeps every chip without a cap or a warning', async () => {
    const sent = ['s1', 's2', 's3', 's4', 's5'].map(id => ref(id));
    let settle!: (undone: UndoneSend | undefined) => void;
    const chat = renderChat();
    chat.onSendPress.mockImplementationOnce(
      () =>
        new Promise<UndoneSend | undefined>(resolve => {
          settle = resolve;
        }),
    );
    for (const doc of sent) {
      await chat.attach(doc);
    }
    chat.type('Summarise');
    await act(async () => {
      chat.pressSend();
    });
    await chat.attach(ref('n1'));
    await chat.attach(ref('n2'));

    await act(async () => {
      settle({
        message: {type: 'text', text: 'Summarise', documents: sent},
        sessionId: 'session-1',
      });
    });

    expect(
      chat.screen.queryAllByTestId(/^composer-document-[a-z0-9]+$/),
    ).toHaveLength(7);
    expect(uiStore.setChatWarning).not.toHaveBeenCalled();
  });

  it('puts a send that found no model back in the composer', async () => {
    const p = ref('p');
    const chat = renderChat({isVisionEnabled: true});
    await chat.attach(p);
    fireEvent.press(chat.screen.getByLabelText('Add attachment'));
    await waitFor(() => chat.screen.getByTestId('attach-gallery'));
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('attach-gallery'));
    });
    chat.type('draft');
    (chat.onSendPress as jest.Mock).mockImplementationOnce(
      async (message: any) => ({message, sessionId: 'session-1'}),
    );

    await act(async () => {
      chat.pressSend();
    });

    expect(chat.input().props.value).toBe('draft');
    expect(chat.screen.getAllByLabelText(/^Image preview/)).toHaveLength(1);
    expect(chat.screen.getByText('p.pdf')).toBeTruthy();
    expect(documentStore.isHeld(p.id)).toBe(true);
  });

  it('keeps a new-chat send that found no model when its report creates the chat', async () => {
    const p = ref('p');
    chatSessionStore.activeSessionId = null as any;
    const chat = renderChat({messages: [], isVisionEnabled: true});
    await chat.attach(p);
    chat.type('go');
    (chat.onSendPress as jest.Mock).mockImplementationOnce(
      async (message: any) => {
        chatSessionStore.activeSessionId = 'created-by-report';
        return {message, sessionId: 'created-by-report'};
      },
    );

    await act(async () => {
      chat.pressSend();
    });
    act(() => chat.screen.rerender(chat.element({messages: []})));

    expect(chat.input().props.value).toBe('go');
    expect(chat.screen.getByText('p.pdf')).toBeTruthy();
    expect(chatSessionStore.saveDraft).not.toHaveBeenCalledWith(
      '__new_chat__',
      'go',
    );
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

  describe('that no longer fits', () => {
    const olderDoc = ref('older-doc');
    const withDoc = {...question, documents: [olderDoc]};
    const overVerdict = {
      kind: 'over' as const,
      reason: 'new' as const,
      needed: 9100,
      available: 3072,
      newDocs: [{ref: olderDoc, tokens: 9000, mode: 'full' as const}],
      historyDocTokens: 0,
    };
    const gate = (verdict: object) =>
      jest
        .fn()
        .mockImplementation(async (message: {text: string}) =>
          message.text === 'Earlier question' ? {...fits, verdict} : fits,
        );

    const staged = async (chat: ReturnType<typeof renderChat>) => {
      await chat.attach(ref('p'));
      await stageImage(chat);
      chat.type('draft');
    };

    const expectExplainedOnly = (chat: ReturnType<typeof renderChat>) => {
      expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
      expect(chat.screen.getByTestId('budget-body').props.children).toContain(
        'Nothing was removed or sent.',
      );
      expect(chat.screen.queryByTestId('budget-remove')).toBeNull();
      expect(chat.screen.queryByTestId('budget-new-chat')).toBeNull();
      expect(chat.screen.queryByTestId('budget-edit-message')).toBeNull();
      expect(chat.input().props.value).toBe('draft');
      expect(chat.screen.getAllByLabelText(/^Image preview/)).toHaveLength(1);
      expect(chat.screen.getByText('p.pdf')).toBeTruthy();
      expect(documentStore.isHeld('p')).toBe(true);
    };

    it('explains a gate overflow and changes nothing', async () => {
      const chat = renderChat({
        messages: [answer, withDoc],
        isVisionEnabled: true,
        evaluateSendBudget: gate(overVerdict),
      });
      await staged(chat);

      await regenerateAnswer(chat);

      expect(chat.onSendPress).not.toHaveBeenCalled();
      expect(chatSessionStore.enterEditMode).not.toHaveBeenCalled();
      expectExplainedOnly(chat);
    });

    it('explains an overflow found under the lease and changes nothing', async () => {
      const chat = renderChat({
        messages: [answer, withDoc],
        isVisionEnabled: true,
        evaluateSendBudget: gate({kind: 'unknown'}),
      });
      (chat.onSendPress as jest.Mock).mockImplementationOnce(
        async (message: any) => ({
          message,
          sessionId: 'session-1',
          verdict: overVerdict,
        }),
      );
      await staged(chat);

      await regenerateAnswer(chat);

      expect(chat.onSendPress).toHaveBeenCalledWith(
        expect.objectContaining({text: 'Earlier question'}),
        {replaceFromId: 'question-row', resend: true},
      );
      expectExplainedOnly(chat);
      expect(chat.screen.queryByText('Earlier question\ndraft')).toBeNull();
    });

    it('keeps edit mode when it happens while editing', async () => {
      store.isEditMode = true;
      store.editingMessageId = 'other-row';
      const chat = renderChat({
        messages: [answer, withDoc],
        isVisionEnabled: true,
        evaluateSendBudget: gate(overVerdict),
      });
      await staged(chat);

      await regenerateAnswer(chat);

      expect(store.isEditMode).toBe(true);
      expect(store.editingMessageId).toBe('other-row');
      expect(chatSessionStore.exitEditMode).not.toHaveBeenCalled();
      expectExplainedOnly(chat);
    });
  });

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
      {replaceFromId: 'question-row', resend: true},
    );
    expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
    expect(heldDuringSend).toBe(true);
    expect(chat.input().props.value).toBe('draft');
    expect(chat.screen.getByText('staged-chip.pdf')).toBeTruthy();
    expect(chat.screen.getAllByLabelText(/^Image preview/)).toHaveLength(1);
    expect(documentStore.isHeld(staged.id)).toBe(true);
  });
});

describe('ChatView edit mode', () => {
  const menuLabels = l10n.en.components.chatView.menuItems;
  const store = chatSessionStore as any;
  let shown: any[] = [];
  const drafts = new Map<string, string>();
  const older = ref('older-doc');
  const olderRow = {
    ...textMessage,
    id: 'older-row',
    author: user,
    text: 'Older row',
    documents: [older],
  };

  beforeEach(() => {
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
  /** The mock store is not observable, so a fresh prop stands in for its change. */
  const rerender = (chat: ReturnType<typeof renderChat>) =>
    act(() => chat.screen.rerender(chat.element({messages: [...shown]})));

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

  const fitsPlan = {
    newModes: [],
    fullLoad: 0,
    room: undefined,
    excerptBudget: 0,
    verdict: {kind: 'fits' as const},
  };
  const pressMenu = async (
    chat: ReturnType<typeof renderChat>,
    rowText: string,
    label: string,
  ) => {
    fireEvent(chat.screen.getByText(rowText), 'onLongPress', {
      nativeEvent: {pageX: 0, pageY: 0},
    });
    await act(async () => {
      fireEvent.press(chat.screen.getByText(label));
    });
    rerender(chat);
  };
  const stageImage = async (chat: ReturnType<typeof renderChat>) => {
    fireEvent.press(chat.screen.getByLabelText('Add attachment'));
    await waitFor(() => chat.screen.getByTestId('attach-gallery'));
    await act(async () => {
      fireEvent.press(chat.screen.getByTestId('attach-gallery'));
    });
  };
  const images = (chat: ReturnType<typeof renderChat>) =>
    chat.screen
      .queryAllByLabelText(/^Image preview/)
      .map(node => node.props.source.uri);
  /** The hook ends edit mode under the lease, right before it removes rows. */
  const endsEditUnderLease = async () => {
    chatSessionStore.exitEditMode();
    return undefined;
  };

  describe.each([
    ['with documents', [older]],
    ['without documents', undefined],
  ])('in a chat %s', (_label, documents) => {
    const rowM = {
      ...textMessage,
      id: 'm',
      author: user,
      text: 'Question m',
      documents,
    };
    const rowR = {
      ...textMessage,
      id: 'r',
      author: user,
      text: 'Question r',
      documents,
    };
    const answer = (id: string, text: string) => ({
      ...textMessage,
      id,
      author: {id: 'assistant'},
      text,
    });
    const props = () => ({
      isVisionEnabled: true,
      evaluateSendBudget: jest.fn().mockResolvedValue(fitsPlan),
    });

    it.each([
      ['at or above the edited row', 'Answer early', [rowM, rowR]],
      ['below the edited row', 'Answer late', [rowR, rowM]],
    ])(
      'Try again on a row %s replaces from that row and clears the composer',
      async (_where, answerText, [newer, earlier]) => {
        shown = [
          answer('a-late', 'Answer late'),
          newer,
          answer('a-early', 'Answer early'),
          earlier,
        ];
        const chat = renderChat({messages: shown, ...props()});
        await pressMenu(chat, 'Question m', menuLabels.edit);
        expect(store.editingMessageId).toBe('m');
        chat.onSendPress.mockImplementationOnce(endsEditUnderLease);

        await pressMenu(chat, answerText, menuLabels.regenerate);

        expect(chat.onSendPress).toHaveBeenCalledWith(
          expect.objectContaining({text: 'Question r'}),
          {replaceFromId: 'r', resend: true},
        );
        expect(store.isEditMode).toBe(false);
        expect(chat.input().props.value).toBe('');
        expect(composerChips(chat)).toEqual([]);
      },
    );

    it('Edit then send replaces from the edited row and clears the composer', async () => {
      shown = [answer('a1', 'Answer one'), rowM];
      const chat = renderChat({messages: shown, ...props()});
      await pressMenu(chat, 'Question m', menuLabels.edit);
      chat.onSendPress.mockImplementationOnce(endsEditUnderLease);
      chat.type('Question m, rewritten');

      await act(async () => {
        chat.pressSend();
      });
      rerender(chat);

      expect(chat.onSendPress).toHaveBeenCalledWith(
        expect.objectContaining({text: 'Question m, rewritten'}),
        {replaceFromId: 'm'},
      );
      expect(store.isEditMode).toBe(false);
      expect(chat.input().props.value).toBe('');
      expect(images(chat)).toEqual([]);
      expect(composerChips(chat)).toEqual([]);
    });

    it('Try again outside edit mode replaces from that row and keeps the composer', async () => {
      shown = [answer('a1', 'Answer one'), rowM];
      const chat = renderChat({messages: shown, ...props()});
      await stageImage(chat);
      chat.type('draft');

      await pressMenu(chat, 'Answer one', menuLabels.regenerate);

      expect(chat.onSendPress).toHaveBeenCalledWith(
        expect.objectContaining({text: 'Question m'}),
        {replaceFromId: 'm', resend: true},
      );
      expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
      expect(chat.input().props.value).toBe('draft');
      expect(images(chat)).toEqual(['file:///staged.jpg']);
    });

    it('Edit then cancel leaves an empty composer', async () => {
      shown = [answer('a1', 'Answer one'), rowM];
      const chat = renderChat({messages: shown, ...props()});
      await pressMenu(chat, 'Question m', menuLabels.edit);

      fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
      rerender(chat);

      expect(chat.onSendPress).not.toHaveBeenCalled();
      expect(chat.input().props.value).toBe('');
      expect(composerChips(chat)).toEqual([]);
    });
  });

  describe.each([
    ['with documents', [older]],
    ['without documents', undefined],
  ])('while an earlier send is still running, in a chat %s', (_label, docs) => {
    const row = {...olderRow, documents: docs};
    const startPendingSend = async (chat: ReturnType<typeof renderChat>) => {
      chat.onSendPress.mockImplementationOnce(() => new Promise(() => {}));
      chat.type('first message');
      await act(async () => {
        chat.pressSend();
      });
    };

    it('clears the composer when a plain Edit is cancelled', async () => {
      shown = [row];
      const chat = renderChat({messages: shown});
      await startPendingSend(chat);
      await pressMenu(chat, 'Older row', menuLabels.edit);
      expect(chat.input().props.value).toBe('Older row');

      fireEvent.press(chat.screen.getByTestId('edit-bar-cancel'));
      rerender(chat);

      expect(chat.input().props.value).toBe('');
      expect(composerChips(chat)).toEqual([]);
    });

    it('keeps the left chat draft when a chat switch ends a plain Edit', async () => {
      drafts.set('session-2', 'two');
      shown = [row];
      const chat = renderChat({messages: shown});
      await startPendingSend(chat);
      drafts.set('session-1', 'earlier');
      await pressMenu(chat, 'Older row', menuLabels.edit);

      runInAction(() => {
        store.isEditMode = false;
        store.editingMessageId = null;
        chatSessionStore.activeSessionId = 'session-2';
      });
      rerender(chat);

      expect(drafts.get('session-1')).toBe('earlier');
      expect(chat.input().props.value).toBe('two');
    });
  });

  it('sends an edit cancelled during the budget check as that edit, so it is handed back', async () => {
    shown = [olderRow];
    let current: ReturnType<typeof renderChat> | undefined;
    const chat = renderChat({
      messages: shown,
      evaluateSendBudget: jest
        .fn()
        .mockImplementation(async (message: {text: string}) => {
          if (message.text === 'Older row, rewritten' && current) {
            chatSessionStore.exitEditMode();
            await act(async () => {
              current!.screen.rerender(
                current!.element({messages: [...shown]}),
              );
            });
          }
          return fitsPlan;
        }),
    });
    current = chat;
    await pressMenu(chat, 'Older row', menuLabels.edit);
    chat.type('Older row, rewritten');
    (chat.onSendPress as jest.Mock).mockImplementationOnce(
      async (message: any) => ({message, sessionId: 'session-1'}),
    );

    await act(async () => {
      chat.pressSend();
    });
    rerender(chat);

    expect(chat.onSendPress).toHaveBeenCalledWith(
      expect.objectContaining({text: 'Older row, rewritten'}),
      {replaceFromId: 'older-row'},
    );
    expect(store.isEditMode).toBe(false);
    expect(chat.input().props.value).toBe('Older row, rewritten');
  });

  describe('Increase context from the budget sheet while editing', () => {
    let memory: jest.SpyInstance;
    afterEach(() => {
      memory.mockRestore();
      runInAction(() => {
        (modelStore as any).activeContextSettings = undefined;
        (modelStore as any).largestSuccessfulLoad = undefined;
      });
    });

    const startReload = async () => {
      const overVerdict = {
        kind: 'over' as const,
        reason: 'new' as const,
        needed: 9100,
        available: 3072,
        newDocs: [{ref: older, tokens: 9000, mode: 'searched' as const}],
        historyDocTokens: 0,
      };
      runInAction(() => {
        modelStore.models = [
          {id: 'local-model', name: 'local', isDownloaded: true} as any,
        ];
        modelStore.activeModelId = 'local-model';
        (modelStore as any).activeContextSettings = {n_ctx: 2048};
        (modelStore as any).largestSuccessfulLoad = 1e12;
      });
      memory = jest
        .spyOn(memoryEstimator, 'getModelMemoryRequirement')
        .mockReturnValue(1);
      shown = [olderRow];
      const chat = renderChat({
        messages: shown,
        evaluateSendBudget: jest
          .fn()
          .mockImplementation(async (message: {text: string}) =>
            message.text === 'Older row, rewritten'
              ? {...fitsPlan, verdict: overVerdict}
              : fitsPlan,
          ),
      });
      await pressMenu(chat, 'Older row', menuLabels.edit);
      chat.type('Older row, rewritten');
      await act(async () => {
        chat.pressSend();
      });
      fireEvent.press(chat.screen.getByTestId('budget-increase-context'));
      fireEvent.press(chat.screen.getByTestId('mock-reload-start'));

      return chat;
    };

    it('keeps the edit and its composer across the reload', async () => {
      const chat = await startReload();
      act(() => chatSessionStore.exitEditMode());
      rerender(chat);
      act(() => mockReload.finish?.(true, 4096));
      rerender(chat);

      expect(chat.input().props.value).toBe('Older row, rewritten');
      expect(composerChips(chat)).toEqual(['older-doc.pdf']);
      expect(chatSessionStore.enterEditMode).toHaveBeenLastCalledWith(
        'older-row',
      );
      expect(store.editingMessageId).toBe('older-row');
    });

    it('drops the kept edit when another chat opens during the reload', async () => {
      drafts.set('session-1', 'earlier');
      drafts.set('session-2', 'two');
      const chat = await startReload();
      act(() => chatSessionStore.exitEditMode());
      rerender(chat);
      (chatSessionStore.enterEditMode as jest.Mock).mockClear();

      runInAction(() => {
        chatSessionStore.activeSessionId = 'session-2';
      });
      rerender(chat);
      act(() => mockReload.finish?.(true, 4096));
      rerender(chat);

      expect(chat.input().props.value).toBe('two');
      expect(composerChips(chat)).toEqual([]);
      expect(drafts.get('session-1')).toBe('earlier');
      expect(chatSessionStore.enterEditMode).not.toHaveBeenCalled();
    });
  });

  it('clears the composer when edit mode ends from outside', async () => {
    shown = [olderRow];
    const chat = renderChat({messages: shown});
    await pressMenu(chat, 'Older row', menuLabels.edit);

    act(() => chatSessionStore.exitEditMode());
    rerender(chat);

    expect(chat.input().props.value).toBe('');
    expect(composerChips(chat)).toEqual([]);
  });

  it('gives an edited send that did not go out back to the composer, still editing', async () => {
    const overVerdict = {
      kind: 'over' as const,
      reason: 'new' as const,
      needed: 9100,
      available: 3072,
      newDocs: [{ref: older, tokens: 9000, mode: 'searched' as const}],
      historyDocTokens: 0,
    };
    shown = [olderRow];
    const chat = renderChat({
      messages: shown,
      isVisionEnabled: true,
      evaluateSendBudget: jest.fn().mockResolvedValue(fitsPlan),
    });
    await pressMenu(chat, 'Older row', menuLabels.edit);
    await stageImage(chat);
    chat.type('Older row, rewritten');
    (chat.onSendPress as jest.Mock).mockImplementationOnce(
      async (message: any) => ({
        message,
        sessionId: 'session-1',
        verdict: overVerdict,
      }),
    );

    await act(async () => {
      chat.pressSend();
    });
    rerender(chat);

    expect(store.editingMessageId).toBe('older-row');
    expect(chat.input().props.value).toBe('Older row, rewritten');
    expect(images(chat)).toEqual(['file:///staged.jpg']);
    expect(composerChips(chat)).toEqual(['older-doc.pdf']);
    expect(documentStore.isHeld(older.id)).toBe(true);
    expect(chat.screen.getByTestId('budget-remove')).toBeTruthy();
  });

  it('a Try again that ends the edit while an edited send waits does not clear what comes back', async () => {
    const rowR = {
      ...textMessage,
      id: 'r',
      author: user,
      text: 'Question r',
    };
    const answer = {
      ...textMessage,
      id: 'a1',
      author: {id: 'assistant'},
      text: 'Answer one',
    };
    shown = [answer, rowR, olderRow];
    const chat = renderChat({
      messages: shown,
      isVisionEnabled: true,
      evaluateSendBudget: jest.fn().mockResolvedValue(fitsPlan),
    });
    await pressMenu(chat, 'Older row', menuLabels.edit);
    let finishResend: () => void = () => {};
    let finishSend: (undone: any) => void = () => {};
    (chat.onSendPress as jest.Mock)
      .mockImplementationOnce(
        () =>
          new Promise<undefined>(resolve => {
            finishResend = () => {
              chatSessionStore.exitEditMode();
              resolve(undefined);
            };
          }),
      )
      .mockImplementationOnce(
        () => new Promise(resolve => (finishSend = resolve)),
      );
    await pressMenu(chat, 'Answer one', menuLabels.regenerate);
    chat.type('Older row, rewritten');
    await act(async () => {
      chat.pressSend();
    });
    const edited = (chat.onSendPress as jest.Mock).mock.calls[1][0];
    expect((chat.onSendPress as jest.Mock).mock.calls[1][1]).toEqual({
      replaceFromId: 'older-row',
    });
    chat.type('typed meanwhile');

    await act(async () => {
      finishResend();
    });
    rerender(chat);
    expect(chat.input().props.value).toBe('typed meanwhile');

    await act(async () => {
      finishSend({message: edited, sessionId: 'session-1'});
    });
    rerender(chat);

    expect(store.isEditMode).toBe(false);
    expect(chat.input().props.value).toBe(
      'Older row, rewritten\ntyped meanwhile',
    );
    expect(composerChips(chat)).toEqual(['older-doc.pdf']);
  });

  it('New chat from the sheet during a plain Edit carries the edited content', async () => {
    drafts.set('session-1', 'earlier');
    const overflow = {
      kind: 'over' as const,
      needed: 6100,
      available: 3072,
      newDocs: [],
      historyDocTokens: 6000,
      reason: 'history' as const,
    };
    shown = [olderRow];
    const chat = renderChat({
      messages: shown,
      isVisionEnabled: true,
      evaluateSendBudget: jest.fn().mockResolvedValue({verdict: overflow}),
    });
    (chatSessionStore.resetActiveSession as jest.Mock).mockImplementationOnce(
      () =>
        runInAction(() => {
          store.isEditMode = false;
          store.editingMessageId = null;
          chatSessionStore.activeSessionId = null as any;
        }),
    );
    await pressMenu(chat, 'Older row', menuLabels.edit);
    await stageImage(chat);
    chat.type('Older row, rewritten');
    await act(async () => {
      chat.pressSend();
    });

    fireEvent.press(chat.screen.getByTestId('budget-new-chat'));
    act(() => chat.screen.rerender(chat.element({messages: []})));

    expect(chat.input().props.value).toBe('Older row, rewritten');
    expect(images(chat)).toEqual(['file:///staged.jpg']);
    expect(composerChips(chat)).toEqual(['older-doc.pdf']);
    expect(documentStore.isHeld(older.id)).toBe(true);
    expect(drafts.get('session-1')).toBe('earlier');
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
