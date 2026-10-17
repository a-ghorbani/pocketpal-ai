import {renderHook, act} from '@testing-library/react-hooks';

import {user} from '../../../jest/fixtures';

import {useMessageActions} from '../useMessageActions';
import * as documentStore from '../../services/documents/store';
import type {DocumentRef} from '../../services/documents/types';
import {chatSessionStore} from '../../store';
import {MessageType} from '../../utils/types';

const releaseDocuments = jest.spyOn(documentStore, 'releaseDocuments');

const doc: DocumentRef = {
  id: 'a-pdf',
  name: 'a.pdf',
  kind: 'pdf',
  byteSize: 1,
  pageCount: 9,
  charCount: 36000,
  tokenEstimate: 9000,
};

const userRow: MessageType.Text = {
  id: 'u1',
  author: user,
  createdAt: 1,
  type: 'text',
  text: 'Summarise',
  documents: [doc],
};
const assistantRow: MessageType.Text = {
  id: 'a1',
  author: {id: 'assistant'},
  createdAt: 2,
  type: 'text',
  text: 'Summary',
};
const messages = [assistantRow, userRow];

const over = {
  kind: 'over' as const,
  needed: 9100,
  available: 3072,
  newDocs: [{ref: doc, tokens: 9000, mode: 'searched' as const}],
  historyDocTokens: 0,
  reason: 'new' as const,
};

const setup = (verdict: any) => {
  const handleSendPress = jest.fn().mockResolvedValue(undefined);
  const evaluateSendBudget = jest.fn().mockResolvedValue({verdict});
  const onBudgetOver = jest.fn();
  const setInputText = jest.fn();
  const setInputDocuments = jest.fn((refs: DocumentRef[]) =>
    documentStore.setComposerHeld(refs.map(ref => ref.id)),
  );
  const {result} = renderHook(() =>
    useMessageActions({
      user,
      messages,
      handleSendPress,
      setInputText,
      setInputDocuments,
      evaluateSendBudget,
      onBudgetOver,
    }),
  );
  return {
    result,
    handleSendPress,
    evaluateSendBudget,
    onBudgetOver,
    setInputText,
    setInputDocuments,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  chatSessionStore.activeSessionId = 'session-1';
  chatSessionStore.sessions = [
    {id: 'session-1', title: 's', date: '', messages} as any,
  ];
});

afterEach(() => {
  documentStore.setComposerHeld([]);
});

describe('useMessageActions with documents', () => {
  it('regenerates with the same refs after the budget passes', async () => {
    const t = setup({kind: 'fits'});

    await act(async () => {
      await t.result.current.handleTryAgain(assistantRow);
    });

    expect(t.evaluateSendBudget).toHaveBeenCalledWith(
      expect.objectContaining({documents: [doc]}),
      {excludeFromId: 'u1'},
    );
    expect(chatSessionStore.removeMessagesFromId).toHaveBeenCalledWith(
      'u1',
      true,
    );
    expect(t.handleSendPress).toHaveBeenCalledWith(
      {text: 'Summarise', type: 'text', imageUris: undefined, documents: [doc]},
      {preChecked: true},
    );
    expect(releaseDocuments).not.toHaveBeenCalled();
  });

  it('removes nothing and opens the row in edit mode when it no longer fits', async () => {
    const t = setup(over);

    await act(async () => {
      await t.result.current.handleTryAgain(userRow);
    });

    expect(chatSessionStore.removeMessagesFromId).not.toHaveBeenCalled();
    expect(t.handleSendPress).not.toHaveBeenCalled();
    expect(chatSessionStore.enterEditMode).toHaveBeenCalledWith('u1');
    expect(t.setInputText).toHaveBeenCalledWith('Summarise');
    expect(t.setInputDocuments).toHaveBeenCalledWith([doc]);
    expect(t.onBudgetOver).toHaveBeenCalledWith(over);
    expect(documentStore.isHeld('a-pdf')).toBe(true);
  });

  it('holds the refs from before the check until the resend settles', async () => {
    const t = setup({kind: 'fits'});
    let heldAtRemoval: boolean | undefined;
    (chatSessionStore.removeMessagesFromId as jest.Mock).mockImplementationOnce(
      async () => {
        heldAtRemoval = documentStore.isHeld('a-pdf');
      },
    );

    await act(async () => {
      await t.result.current.handleTryAgain(userRow);
    });

    expect(heldAtRemoval).toBe(true);
    expect(documentStore.isHeld('a-pdf')).toBe(false);
  });

  it('resends a row whose files are missing without refusing it', async () => {
    const t = setup({kind: 'fits'});

    await act(async () => {
      await t.result.current.handleTryAgain(userRow);
    });

    expect(t.handleSendPress).toHaveBeenCalledWith(
      expect.objectContaining({documents: [doc]}),
      {preChecked: true},
    );
  });

  it('puts the row documents in the composer on edit', async () => {
    const t = setup({kind: 'fits'});

    await act(async () => {
      await t.result.current.handleEdit(userRow);
    });

    expect(t.setInputDocuments).toHaveBeenCalledWith([doc]);
  });
});
