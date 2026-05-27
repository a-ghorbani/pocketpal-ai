import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {ComparisonCards} from '../ComparisonCards';

describe('ComparisonCards', () => {
  it('renders both labels and the vs divider', () => {
    const {getByText} = render(
      <ComparisonCards
        leftLabel="On device"
        rightLabel="Cloud"
        vsLabel="VS"
      />,
    );
    expect(getByText('On device')).toBeTruthy();
    expect(getByText('Cloud')).toBeTruthy();
    expect(getByText('VS')).toBeTruthy();
  });

  it('matches the snapshot baseline', () => {
    const {toJSON} = render(
      <ComparisonCards
        leftLabel="On device"
        rightLabel="Cloud"
        vsLabel="VS"
      />,
    );
    expect(toJSON()).toMatchSnapshot();
  });
});
