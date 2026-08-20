import React from 'react';

import {render, fireEvent} from '../../../../jest/test-utils';

import {ChatSearchBar} from '../ChatSearchBar';
import {chatSessionStore} from '../../../store';

describe('ChatSearchBar', () => {
  const setSearchState = (query: string, matches: number, position: number) => {
    (chatSessionStore as any).searchQuery = query;
    (chatSessionStore as any).isSearchMode = true;
    Object.defineProperty(chatSessionStore, 'searchMatchCount', {
      get: () => matches,
      configurable: true,
    });
    Object.defineProperty(chatSessionStore, 'activeMatchPosition', {
      get: () => position,
      configurable: true,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setSearchState('', 0, 0);
  });

  it('renders the input and the close button', () => {
    const {getByTestId} = render(<ChatSearchBar />);
    expect(getByTestId('chat-search-input')).toBeTruthy();
    expect(getByTestId('search-close-button')).toBeTruthy();
  });

  it('calls exitSearchMode when close is pressed', () => {
    const {getByTestId} = render(<ChatSearchBar />);
    fireEvent.press(getByTestId('search-close-button'));
    expect(chatSessionStore.exitSearchMode).toHaveBeenCalled();
  });

  it('calls setSearchQuery on text change', () => {
    const {getByTestId} = render(<ChatSearchBar />);
    fireEvent.changeText(getByTestId('chat-search-input'), 'test query');
    expect(chatSessionStore.setSearchQuery).toHaveBeenCalledWith('test query');
  });

  it('shows position out of total while there are matches', () => {
    setSearchState('hello', 5, 2);
    const {getByTestId} = render(<ChatSearchBar />);
    expect(getByTestId('search-match-count').props.children).toBe('2/5');
  });

  it('shows no-results text when the query matches nothing', () => {
    setSearchState('xyz', 0, 0);
    const {getByText} = render(<ChatSearchBar />);
    expect(getByText('No results')).toBeTruthy();
  });

  it('shows no counter at all when the query is empty', () => {
    const {queryByTestId} = render(<ChatSearchBar />);
    expect(queryByTestId('search-match-count')).toBeNull();
  });

  describe('match navigation', () => {
    it('steps forward and backward through matches', () => {
      setSearchState('hello', 5, 2);
      const {getByTestId} = render(<ChatSearchBar />);

      fireEvent.press(getByTestId('search-next-button'));
      expect(chatSessionStore.goToNextMatch).toHaveBeenCalled();

      fireEvent.press(getByTestId('search-previous-button'));
      expect(chatSessionStore.goToPreviousMatch).toHaveBeenCalled();
    });

    it('advances on submit so the keyboard return key navigates', () => {
      setSearchState('hello', 5, 1);
      const {getByTestId} = render(<ChatSearchBar />);
      fireEvent(getByTestId('chat-search-input'), 'submitEditing');
      expect(chatSessionStore.goToNextMatch).toHaveBeenCalled();
    });

    // Disabled rather than absent, so the control does not shift position
    // between "no results" and "results".
    it('disables both chevrons when there is nothing to navigate', () => {
      setSearchState('xyz', 0, 0);
      const {getByTestId} = render(<ChatSearchBar />);

      expect(
        getByTestId('search-next-button').props.accessibilityState,
      ).toEqual({disabled: true});
      fireEvent.press(getByTestId('search-next-button'));
      expect(chatSessionStore.goToNextMatch).not.toHaveBeenCalled();
    });
  });
});
