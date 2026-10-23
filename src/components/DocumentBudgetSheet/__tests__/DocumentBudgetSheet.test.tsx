import React from 'react';

import {Keyboard} from 'react-native';

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
    expect(getByText('Already in this chat: ~6k tokens')).toBeTruthy();
    expect(getByText('notes.txt · searched')).toBeTruthy();
  });

  it('switches to the history-overflow actions', () => {
    const h = handlers();
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
        {...h}
      />,
    );
    expect(queryByTestId('budget-remove')).toBeNull();
    expect(queryByTestId('budget-edit-message')).toBeNull();
    fireEvent.press(getByTestId('budget-new-chat'));
    expect(h.onNewChat).toHaveBeenCalled();
  });

  it.each(['new', 'history'] as const)(
    'only explains a %s overflow on a resend',
    reason => {
      const h = handlers();
      const onIncreaseContext = jest.fn();
      const {getByTestId, queryByTestId, getByText} = render(
        <DocumentBudgetSheet
          isVisible
          resend
          verdict={{
            kind: 'over',
            needed: 9100,
            available: 3072,
            newDocs: [{ref: pdf, tokens: 9000, mode: 'full'}],
            historyDocTokens: 6000,
            reason,
          }}
          onIncreaseContext={onIncreaseContext}
          {...h}
        />,
      );
      expect(getByTestId('budget-body').props.children).toContain(
        'Nothing was removed or sent.',
      );
      expect(getByText('big.pdf · ~9k tokens')).toBeTruthy();
      expect(queryByTestId('budget-search-instead')).toBeNull();
      expect(queryByTestId('budget-choose-pages')).toBeNull();
      expect(queryByTestId('budget-remove')).toBeNull();
      expect(queryByTestId('budget-new-chat')).toBeNull();
      expect(queryByTestId('budget-edit-message')).toBeNull();
      fireEvent.press(getByTestId('budget-increase-context'));
      expect(onIncreaseContext).toHaveBeenCalled();
      fireEvent.press(getByTestId('budget-cancel'));
      expect(h.onClose).toHaveBeenCalled();
    },
  );

  it('offers no Search instead next to the history actions', () => {
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
        {...handlers()}
      />,
    );
    expect(queryByTestId('budget-search-instead')).toBeNull();
    expect(queryByTestId('budget-new-doc')).toBeNull();
    expect(queryByTestId('budget-remove')).toBeNull();
    expect(getByTestId('budget-new-chat')).toBeTruthy();
  });

  it('dismisses the keyboard when it opens so its actions stay visible', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    render(
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
        {...handlers()}
      />,
    );
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });
});
