import React from 'react';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {Dropdown} from '../Dropdown';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

const options = [
  {value: 'a', label: 'Alpha'},
  {value: 'b', label: 'Beta'},
];

describe('Dropdown', () => {
  it('defaults to testID=ds-dropdown and role=button', () => {
    const {getByTestId} = render(
      <Dropdown value="a" options={options} onChange={() => {}} />,
    );
    expect(getByTestId('ds-dropdown').props.accessibilityRole).toBe('button');
  });

  it('opens menu on press', () => {
    const onChange = jest.fn();
    const {getByTestId, getByText} = render(
      <Dropdown value="a" options={options} onChange={onChange} />,
    );
    fireEvent.press(getByTestId('ds-dropdown'));
    expect(getByText('Beta')).toBeTruthy();
    fireEvent.press(getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

runSnapshotMatrix(
  'Dropdown',
  ({variant: _v, size}) => (
    <Dropdown size={size} value="a" options={options} onChange={() => {}} />
  ),
  {
    variants: ['standard'] as const,
    sizes: ['s', 'm', 'l'] as const,
    langs: ['fa'] as const,
  },
);
