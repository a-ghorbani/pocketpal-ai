import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {CategoryBadge} from '../CategoryBadge';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('CategoryBadge', () => {
  it('defaults to testID=ui-category-badge and role=text', () => {
    const {getByTestId} = render(<CategoryBadge label="Chat" />);
    expect(getByTestId('ui-category-badge').props.accessibilityRole).toBe(
      'text',
    );
  });
});

runSnapshotMatrix(
  'CategoryBadge',
  ({variant, size}) => (
    <CategoryBadge variant={variant} size={size} label="Chat" />
  ),
  {
    variants: ['neutral', 'primary', 'secondary', 'tertiary'] as const,
    sizes: ['s', 'm'] as const,
    states: ['default'] as const,
    langs: ['fa'] as const,
  },
);
