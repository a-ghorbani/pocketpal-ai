import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {Checkbox} from '../Checkbox';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Checkbox', () => {
  it('defaults to testID=ui-checkbox', () => {
    const {getByTestId} = render(
      <Checkbox
        value={false}
        onValueChange={() => {}}
        accessibilityLabel="x"
      />,
    );
    expect(getByTestId('ui-checkbox')).toBeTruthy();
  });
});

runSnapshotMatrix(
  'Checkbox',
  ({variant: _v, size: _s, value, state}) => (
    <Checkbox
      value={value ?? false}
      onValueChange={() => {}}
      accessibilityLabel="x"
      disabled={state === 'disabled'}
    />
  ),
  {
    variants: ['default'] as const,
    sizes: ['default'] as const,
    values: [true, false] as const,
    langs: ['fa'] as const,
  },
);
