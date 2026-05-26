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
    expect(getByTestId('ui-radio-a')).toBeTruthy();
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
    expect(getByTestId('ui-radio-section')).toBeTruthy();
    expect(getByTestId('ui-radio-a')).toBeTruthy();
    expect(getByTestId('ui-radio-b')).toBeTruthy();
  });
});

runSnapshotMatrix(
  'RadioButton',
  ({variant: _v, size: _s, value, state}) => (
    <RadioButton
      value="a"
      groupValue={value ? 'a' : 'b'}
      onSelect={() => {}}
      accessibilityLabel="A"
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
