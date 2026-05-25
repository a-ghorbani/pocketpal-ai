import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {Switch} from '../Switch';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Switch', () => {
  it('defaults to testID=ui-switch', () => {
    const {getByTestId} = render(
      <Switch value={false} onValueChange={() => {}} accessibilityLabel="x" />,
    );
    expect(getByTestId('ui-switch')).toBeTruthy();
  });

  it('forwards accessibilityLabel to Paper Switch', () => {
    const {getByLabelText} = render(
      <Switch
        value
        onValueChange={() => {}}
        accessibilityLabel="Enable dark mode"
      />,
    );
    expect(getByLabelText('Enable dark mode')).toBeTruthy();
  });
});

runSnapshotMatrix(
  'Switch',
  ({variant: _v, size, value}) => (
    <Switch
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
