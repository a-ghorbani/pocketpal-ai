import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {HighlightText} from '../HighlightText';

describe('HighlightText', () => {
  it('renders the body plain when no phrase matches', () => {
    const {toJSON} = render(
      <HighlightText
        body="Plain copy with nothing to highlight."
        phrases={['totally absent']}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('wraps a single matching phrase in a pill segment', () => {
    const {toJSON} = render(
      <HighlightText
        body="Anytime, with no internet, no signal — nice."
        phrases={['no internet, no signal']}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('wraps multiple distinct phrases in separate pills', () => {
    const {toJSON} = render(
      <HighlightText
        body="No accounts. No cloud. No tracking. We promise."
        phrases={['No accounts.', 'No cloud.', 'No tracking.']}
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });

  it('ignores empty phrase entries (defensive)', () => {
    const {toJSON} = render(
      <HighlightText body="Quick body." phrases={['', 'Quick']} />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
