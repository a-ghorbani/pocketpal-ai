import React from 'react';

import {render} from '../../../../../jest/test-utils';
import {RadioButton} from '../RadioButton';
import {RadioSection} from '../RadioSection';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('RadioButton', () => {
  it('templates testID per value', () => {
    const {getByTestId} = render(
      <RadioButton
        value="a"
        groupValue="a"
        onSelect={() => {}}
        accessibilityLabel="A"
      />,
    );
    expect(getByTestId('ds-radio-a')).toBeTruthy();
  });
});

describe('RadioSection', () => {
  it('renders a list of RadioButtons', () => {
    const {getByTestId} = render(
      <RadioSection
        label="Pick one"
        helperText="hint"
        groupValue="a"
        onSelect={() => {}}
        options={[
          {value: 'a', label: 'A'},
          {value: 'b', label: 'B'},
        ]}
      />,
    );
    expect(getByTestId('ds-radio-section')).toBeTruthy();
    expect(getByTestId('ds-radio-a')).toBeTruthy();
    expect(getByTestId('ds-radio-b')).toBeTruthy();
  });
});

runSnapshotMatrix(
  'RadioButton',
  ({variant: _v, size, value}) => (
    <RadioButton
      size={size}
      value="a"
      groupValue={value ? 'a' : 'b'}
      onSelect={() => {}}
      accessibilityLabel="A"
    />
  ),
  {
    variants: ['default'] as const,
    sizes: ['s', 'm', 'l'] as const,
    values: [true, false] as const,
    langs: ['fa'] as const,
  },
);
