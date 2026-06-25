import React from 'react';
import {Linking} from 'react-native';

import {fireEvent, render} from '../../../../jest/test-utils';

import {WebSearchResultBubble} from '../WebSearchResultBubble';
import {WebSearchResultsSheet} from '../WebSearchResultsSheet';

jest.mock('../../../assets/icons', () => {
  const {Text} = require('react-native-paper');
  return {
    SearchIcon: () => <Text>search-icon</Text>,
    ChevronRightIcon: () => <Text>chevron-icon</Text>,
  };
});

// Render the Sheet body inline when visible so the result rows are reachable.
jest.mock('../../Sheet/Sheet', () => {
  const {View} = require('react-native');
  const MockSheet = ({children, isVisible, title}: any) =>
    isVisible ? (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        {children}
      </View>
    ) : null;
  MockSheet.ScrollView = ({children, ...props}: any) => (
    <View {...props}>{children}</View>
  );
  return {Sheet: MockSheet};
});

const results = [
  {
    title: 'Perseverance',
    url: 'https://nasa.gov/mars',
    snippet: 'Latest rover update.',
  },
  {
    title: 'Curiosity',
    url: 'https://example.com/curiosity',
    snippet: 'Older mission.',
  },
];

describe('WebSearchResultBubble', () => {
  it('renders a compact trigger with query and result count, not the full list', () => {
    const {getByTestId, getByText, queryByTestId} = render(
      <WebSearchResultBubble query="mars rover" results={results} />,
    );

    expect(getByTestId('web-search-result-trigger')).toBeTruthy();
    expect(getByText(/Searched: mars rover/)).toBeTruthy();
    expect(getByText(/2 results/)).toBeTruthy();
    // The full list is not rendered inline — only in the sheet on tap.
    expect(queryByTestId('web-search-results-sheet')).toBeNull();
    expect(queryByTestId('web-search-result-row')).toBeNull();
  });

  it('opens the sheet with the full result list when the trigger is tapped', () => {
    const {getByTestId, getAllByTestId, getByText} = render(
      <WebSearchResultBubble query="mars rover" results={results} />,
    );

    fireEvent.press(getByTestId('web-search-result-trigger'));

    expect(getByTestId('web-search-results-sheet')).toBeTruthy();
    expect(getAllByTestId('web-search-result-row')).toHaveLength(2);
    expect(getByText('Perseverance')).toBeTruthy();
    expect(getByText('https://nasa.gov/mars')).toBeTruthy();
    expect(getByText('Latest rover update.')).toBeTruthy();
  });

  it('renders a non-tappable empty state when there are no results', () => {
    const {getByText, queryByTestId} = render(
      <WebSearchResultBubble query="nothing" results={[]} />,
    );

    expect(getByText('No results for nothing')).toBeTruthy();
    expect(queryByTestId('web-search-result-trigger')).toBeNull();
  });
});

describe('WebSearchResultsSheet', () => {
  it('renders a row per result with title, url and snippet', () => {
    const {getAllByTestId, getByText} = render(
      <WebSearchResultsSheet
        isVisible
        query="mars rover"
        results={results}
        onDismiss={jest.fn()}
      />,
    );

    expect(getAllByTestId('web-search-result-row')).toHaveLength(2);
    expect(getByText('Curiosity')).toBeTruthy();
    expect(getByText('https://example.com/curiosity')).toBeTruthy();
  });

  it('falls back to the URL when a result has no title', () => {
    const {getByTestId, getAllByText} = render(
      <WebSearchResultsSheet
        isVisible
        query="q"
        results={[{title: '', url: 'https://only-url.com', snippet: ''}]}
        onDismiss={jest.fn()}
      />,
    );

    expect(getByTestId('web-search-result-row')).toBeTruthy();
    expect(getAllByText('https://only-url.com').length).toBeGreaterThan(0);
  });

  it('opens an http(s) url in the system browser when a row is tapped', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    const {getAllByTestId} = render(
      <WebSearchResultsSheet
        isVisible
        query="mars rover"
        results={results}
        onDismiss={jest.fn()}
      />,
    );

    fireEvent.press(getAllByTestId('web-search-result-row')[0]);
    expect(openURL).toHaveBeenCalledWith('https://nasa.gov/mars');

    openURL.mockRestore();
  });

  it('does not open a non-http(s) url', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    const {getByTestId} = render(
      <WebSearchResultsSheet
        isVisible
        query="q"
        // eslint-disable-next-line no-script-url
        results={[{title: 'evil', url: 'javascript:alert(1)', snippet: ''}]}
        onDismiss={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('web-search-result-row'));
    expect(openURL).not.toHaveBeenCalled();

    openURL.mockRestore();
  });

  it('renders an empty state when there are no results', () => {
    const {getByTestId, queryAllByTestId} = render(
      <WebSearchResultsSheet
        isVisible
        query="nothing"
        results={[]}
        onDismiss={jest.fn()}
      />,
    );

    expect(getByTestId('web-search-results-sheet-empty')).toBeTruthy();
    expect(queryAllByTestId('web-search-result-row')).toHaveLength(0);
  });
});
