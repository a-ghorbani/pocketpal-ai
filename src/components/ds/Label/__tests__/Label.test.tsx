import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {Label} from '../Label';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Label', () => {
  it('defaults to testID=ds-label and role=text', () => {
    const {getByTestId} = render(<Label label="Beta" />);
    expect(getByTestId('ds-label').props.accessibilityRole).toBe('text');
  });
});

runSnapshotMatrix(
  'Label',
  ({variant, size}) => <Label variant={variant} size={size} label="Beta" />,
  {
    variants: [
      'informational',
      'status-success',
      'status-warning',
      'status-error',
      'status-info',
    ] as const,
    sizes: ['s', 'm'] as const,
    states: ['default'] as const,
    langs: ['fa'] as const,
  },
);
