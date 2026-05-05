import React from 'react';

import {render} from '../../../../jest/test-utils';

import {PendingIndicator} from '../PendingIndicator';

describe('PendingIndicator', () => {
  it('renders the dot-row container with the documented testID', () => {
    const {getByTestId} = render(<PendingIndicator />);
    expect(getByTestId('pending-indicator')).toBeTruthy();
  });
});
