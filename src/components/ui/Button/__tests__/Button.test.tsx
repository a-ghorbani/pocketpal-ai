import React from 'react';
import {fireEvent} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {Button} from '../Button';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Button', () => {
  it('renders with label, defaults to testID=ui-button + role=button', () => {
    const {getByTestId, getByText} = render(<Button label="Save" />);
    expect(getByText('Save')).toBeTruthy();
    const el = getByTestId('ui-button');
    expect(el.props.accessibilityRole).toBe('button');
  });

  it('uses label as accessibilityLabel when no explicit override', () => {
    const {getByTestId} = render(<Button label="Save" />);
    expect(getByTestId('ui-button').props.accessibilityLabel).toBe('Save');
  });

  it('respects explicit accessibilityLabel over label', () => {
    const {getByTestId} = render(
      <Button label="Save" accessibilityLabel="Save changes to model" />,
    );
    expect(getByTestId('ui-button').props.accessibilityLabel).toBe(
      'Save changes to model',
    );
  });

  it('calls onPress', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(<Button label="Go" onPress={onPress} />);
    fireEvent.press(getByTestId('ui-button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks press when disabled', () => {
    const onPress = jest.fn();
    const {getByTestId} = render(
      <Button label="Go" onPress={onPress} disabled />,
    );
    fireEvent.press(getByTestId('ui-button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

runSnapshotMatrix(
  'Button',
  ({variant, size, state}) => (
    <Button
      variant={variant}
      size={size}
      label="Save"
      disabled={state === 'disabled'}
    />
  ),
  {
    variants: ['primary', 'secondary', 'tertiary', 'destructive'] as const,
    sizes: ['s', 'm', 'l'] as const,
    langs: ['fa'] as const,
  },
);
