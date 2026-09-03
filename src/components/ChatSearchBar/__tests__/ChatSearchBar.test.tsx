import React from 'react';

import {render, fireEvent} from '../../../../jest/test-utils';

import {ChatSearchBar} from '../ChatSearchBar';
import {chatSessionStore} from '../../../store';

describe('ChatSearchBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (chatSessionStore as any).searchQuery = '';
    (chatSessionStore as any).isSearchMode = true;
  });

  it('renders search input', () => {
    const {getByTestId} = render(<ChatSearchBar matchCount={0} />);
    expect(getByTestId('chat-search-input')).toBeTruthy();
  });

  it('renders close button', () => {
    const {getByTestId} = render(<ChatSearchBar matchCount={0} />);
    expect(getByTestId('search-close-button')).toBeTruthy();
  });

  it('calls exitSearchMode when close button is pressed', () => {
    const {getByTestId} = render(<ChatSearchBar matchCount={0} />);
    fireEvent.press(getByTestId('search-close-button'));
    expect(chatSessionStore.exitSearchMode).toHaveBeenCalled();
  });

  it('calls setSearchQuery on text change', () => {
    const {getByTestId} = render(<ChatSearchBar matchCount={0} />);
    fireEvent.changeText(getByTestId('chat-search-input'), 'test query');
    expect(chatSessionStore.setSearchQuery).toHaveBeenCalledWith('test query');
  });

  it('shows match count when there are matches', () => {
    (chatSessionStore as any).searchQuery = 'hello';
    const {getByText} = render(<ChatSearchBar matchCount={5} />);
    expect(getByText('5')).toBeTruthy();
  });

  it('shows no results text when query exists but no matches', () => {
    (chatSessionStore as any).searchQuery = 'xyz';
    const {getByText} = render(<ChatSearchBar matchCount={0} />);
    expect(getByText('No results')).toBeTruthy();
  });

  it('does not show match count when query is empty', () => {
    (chatSessionStore as any).searchQuery = '';
    const {queryByText} = render(<ChatSearchBar matchCount={0} />);
    expect(queryByText('No results')).toBeNull();
  });
});
