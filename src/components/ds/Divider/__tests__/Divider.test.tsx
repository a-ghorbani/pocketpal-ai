import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {Divider} from '../Divider';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Divider', () => {
  it('defaults to testID=ds-divider', () => {
    const {getByTestId} = render(<Divider />);
    expect(getByTestId('ds-divider')).toBeTruthy();
  });
});

runSnapshotMatrix('Divider', ({variant}) => <Divider variant={variant} />, {
  variants: ['horizontal', 'vertical'] as const,
  sizes: ['default'] as const,
  states: ['default'] as const,
});
