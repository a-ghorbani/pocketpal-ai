import React from 'react';

import {fireEvent, render} from '../../../../jest/test-utils';

import {DocumentBudgetSheet} from '../DocumentBudgetSheet';
import type {DocumentRef} from '../../../services/documents/types';

jest.mock('../../Sheet', () => {
  const {View} = require('react-native');
  const Sheet: any = ({children, isVisible}: any) =>
    isVisible ? <View>{children}</View> : null;
  Sheet.ScrollView = ({children}: any) => <View>{children}</View>;
  Sheet.Actions = ({children}: any) => <View>{children}</View>;
  return {Sheet};
});

const pdf: DocumentRef = {
  id: 'pdf-1',
  name: 'big.pdf',
  kind: 'pdf',
  byteSize: 1,
  pageCount: 40,
  charCount: 36000,
  tokenEstimate: 9000,
};
const text: DocumentRef = {
  ...pdf,
  id: 'txt-1',
  name: 'notes.txt',
  kind: 'text',
};

const handlers = () => ({
  onChoosePages: jest.fn(),
  onRemove: jest.fn(),
  onSearchInstead: jest.fn(),
  onNewChat: jest.fn(),
  onClose: jest.fn(),
});

describe('DocumentBudgetSheet', () => {
  it('offers choose pages, remove, increase context and cancel for a local PDF', () => {
    const h = handlers();
    const onIncreaseContext = jest.fn();
    const {getByTestId, queryByTestId} = render(
      <DocumentBudgetSheet
        isVisible
        verdict={{
          kind: 'over',
          needed: 9100,
          available: 3072,
          newDocs: [{ref: pdf, tokens: 9000, mode: 'searched'}],
          historyDocTokens: 0,
          reason: 'new',
        }}
        onIncreaseContext={onIncreaseContext}
        {...h}
      />,
    );
    fireEvent.press(getByTestId('budget-choose-pages'));
    expect(h.onChoosePages).toHaveBeenCalledWith(pdf);
    fireEvent.press(getByTestId('budget-remove'));
    expect(h.onRemove).toHaveBeenCalledWith(pdf);
    fireEvent.press(getByTestId('budget-increase-context'));
    expect(onIncreaseContext).toHaveBeenCalled();
    fireEvent.press(getByTestId('budget-cancel'));
    expect(h.onClose).toHaveBeenCalled();
    expect(queryByTestId('budget-new-chat')).toBeNull();
    expect(queryByTestId('budget-history')).toBeNull();
    expect(queryByTestId('budget-search-instead')).toBeNull();
  });

  it('offers only remove and cancel for a remote text file, with the earlier total', () => {
    const {getByTestId, queryByTestId, getByText} = render(
      <DocumentBudgetSheet
        isVisible
        verdict={{
          kind: 'over',
          needed: 9200,
          available: 7168,
          newDocs: [{ref: text, tokens: 3000, mode: 'searched'}],
          historyDocTokens: 6000,
          reason: 'new',
        }}
        {...handlers()}
      />,
    );
    expect(getByTestId('budget-remove')).toBeTruthy();
    expect(queryByTestId('budget-choose-pages')).toBeNull();
    expect(queryByTestId('budget-increase-context')).toBeNull();
    expect(getByText('Already in this chat: ~6.0k tokens')).toBeTruthy();
    expect(getByText('notes.txt · searched')).toBeTruthy();
  });

  it('switches to the history-overflow actions', () => {
    const h = handlers();
    const onEditMessage = jest.fn();
    const {getByTestId, queryByTestId} = render(
      <DocumentBudgetSheet
        isVisible
        verdict={{
          kind: 'over',
          needed: 6100,
          available: 3072,
          newDocs: [],
          historyDocTokens: 6000,
          reason: 'history',
        }}
        onEditMessage={onEditMessage}
        {...h}
      />,
    );
    expect(queryByTestId('budget-remove')).toBeNull();
    fireEvent.press(getByTestId('budget-new-chat'));
    expect(h.onNewChat).toHaveBeenCalled();
    fireEvent.press(getByTestId('budget-edit-message'));
    expect(onEditMessage).toHaveBeenCalled();
  });

  it('offers Search instead on a new full document next to the history actions (RK)', () => {
    const h = handlers();
    const small = {...text, id: 'small', name: 'small.md', tokenEstimate: 300};
    const {getByTestId, queryByTestId} = render(
      <DocumentBudgetSheet
        isVisible
        verdict={{
          kind: 'over',
          needed: 6100,
          available: 3072,
          newDocs: [{ref: small, tokens: 300, mode: 'full'}],
          historyDocTokens: 6000,
          reason: 'history',
        }}
        {...h}
      />,
    );
    fireEvent.press(getByTestId('budget-search-instead'));
    expect(h.onSearchInstead).toHaveBeenCalledWith(small);
    expect(queryByTestId('budget-remove')).toBeNull();
    expect(getByTestId('budget-new-chat')).toBeTruthy();
  });
});
