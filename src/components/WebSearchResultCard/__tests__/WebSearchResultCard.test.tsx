import React from 'react';

import {render} from '../../../../jest/test-utils';

import {WebSearchResultCard} from '../WebSearchResultCard';

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
  const {Text: PaperText} = require('react-native-paper');
  return props => <PaperText>{props.name}</PaperText>;
});

describe('WebSearchResultCard', () => {
  it('renders the query header and a row per result', () => {
    const {getByText, getAllByTestId, getByTestId} = render(
      <WebSearchResultCard
        query="mars rover"
        results={[
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
        ]}
      />,
    );
    expect(getByTestId('web-search-result-card')).toBeTruthy();
    expect(getByText('Searched: mars rover')).toBeTruthy();
    expect(getAllByTestId('web-search-result-row')).toHaveLength(2);
    expect(getByText('Perseverance')).toBeTruthy();
    expect(getByText('https://nasa.gov/mars')).toBeTruthy();
    expect(getByText('Latest rover update.')).toBeTruthy();
  });

  it('falls back to the URL when a result has no title', () => {
    const {getAllByText, getByTestId} = render(
      <WebSearchResultCard
        query="q"
        results={[{title: '', url: 'https://only-url.com', snippet: ''}]}
      />,
    );
    expect(getByTestId('web-search-result-row')).toBeTruthy();
    // URL shows in both the title fallback and the url line.
    expect(getAllByText('https://only-url.com').length).toBeGreaterThan(0);
  });

  it('renders an empty state when there are no results', () => {
    const {getByText, getByTestId, queryAllByTestId} = render(
      <WebSearchResultCard query="nothing" results={[]} />,
    );
    expect(getByTestId('web-search-result-empty')).toBeTruthy();
    expect(getByText('No results')).toBeTruthy();
    expect(queryAllByTestId('web-search-result-row')).toHaveLength(0);
  });
});
