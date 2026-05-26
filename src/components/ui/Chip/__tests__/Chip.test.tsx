import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {Chip} from '../Chip';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Chip', () => {
  it('display variant defaults to role=text', () => {
    const {getByTestId} = render(<Chip variant="display" label="Tag" />);
    expect(getByTestId('ui-chip').props.accessibilityRole).toBe('text');
  });

  it('selectable variant defaults to role=button with selected state', () => {
    const {getByTestId} = render(
      <Chip variant="selectable" label="Tag" selected />,
    );
    const el = getByTestId('ui-chip');
    expect(el.props.accessibilityRole).toBe('button');
    expect(el.props.accessibilityState?.selected).toBe(true);
  });

  it('input variant defaults to role=button', () => {
    const {getByTestId} = render(<Chip variant="input" label="Tag" />);
    expect(getByTestId('ui-chip').props.accessibilityRole).toBe('button');
  });
});

runSnapshotMatrix(
  'Chip',
  ({variant, size, state}) => (
    <Chip
      variant={variant}
      size={size}
      label="Tag"
      selected
      disabled={state === 'disabled'}
    />
  ),
  {
    variants: ['display', 'selectable', 'input'] as const,
    sizes: ['s', 'm'] as const,
    langs: ['fa'] as const,
    rtlCanaryVariant: 'selectable',
  },
);
