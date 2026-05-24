import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {Checkbox} from '../Checkbox';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Checkbox', () => {
  it('defaults to testID=ds-checkbox', () => {
    const {getByTestId} = render(
      <Checkbox
        value={false}
        onValueChange={() => {}}
        accessibilityLabel="x"
      />,
    );
    expect(getByTestId('ds-checkbox')).toBeTruthy();
  });
});

runSnapshotMatrix(
  'Checkbox',
  ({variant: _v, size, value}) => (
    <Checkbox
      size={size}
      value={value ?? false}
      onValueChange={() => {}}
      accessibilityLabel="x"
    />
  ),
  {
    variants: ['default'] as const,
    sizes: ['s', 'm', 'l'] as const,
    values: [true, false] as const,
    langs: ['fa'] as const,
  },
);
