import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {render} from '../../../../../jest/test-utils';
import {measuresIncludeStatusBar} from '../../../../utils/edgeToEdge';
import {Dropdown} from '../Dropdown';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

const options = [
  {value: 'a', label: 'Alpha'},
  {value: 'b', label: 'Beta'},
];

jest.mock('../../../../utils/edgeToEdge', () => ({
  measuresIncludeStatusBar: jest.fn(() => false),
}));

describe('Dropdown', () => {
  afterEach(() => {
    (measuresIncludeStatusBar as jest.Mock).mockReturnValue(false);
  });

  it('defaults to testID=ui-dropdown and role=button', () => {
    const {getByTestId} = render(
      <Dropdown value="a" options={options} onChange={() => {}} />,
    );
    expect(getByTestId('ui-dropdown').props.accessibilityRole).toBe('button');
  });

  it('opens menu on press', () => {
    const onChange = jest.fn();
    const {getByTestId, getByText} = render(
      <Dropdown value="a" options={options} onChange={onChange} />,
    );
    fireEvent.press(getByTestId('ui-dropdown'));
    expect(getByText('Beta')).toBeTruthy();
    fireEvent.press(getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('gives the trigger a >=44pt touch target', () => {
    const {getByTestId} = render(
      <Dropdown value="a" options={options} onChange={() => {}} />,
    );
    const trigger = getByTestId('ui-dropdown');
    const flattened = Array.isArray(trigger.props.style)
      ? Object.assign({}, ...trigger.props.style.flat())
      : trigger.props.style;
    expect(flattened.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('marks the currently-selected option in the open menu', () => {
    const {getByTestId, UNSAFE_root} = render(
      <Dropdown value="a" options={options} onChange={() => {}} />,
    );
    fireEvent.press(getByTestId('ui-dropdown'));
    // Paper renders leadingIcon='check' as an icon on the selected item only.
    const checks = UNSAFE_root.findAll(
      node =>
        typeof node.props?.source === 'string' && node.props.source === 'check',
    );
    expect(checks.length).toBe(1);
  });

  it('passes statusBarHeight 0 when RN measures in edge-to-edge window coordinates', () => {
    (measuresIncludeStatusBar as jest.Mock).mockReturnValue(true);
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 47,
      right: 0,
      bottom: 34,
      left: 0,
    });
    const PaperMenu = require('react-native-paper').Menu;
    const {getByTestId, UNSAFE_getByType} = render(
      <Dropdown value="a" options={options} onChange={() => {}} />,
    );
    fireEvent.press(getByTestId('ui-dropdown'));

    expect(UNSAFE_getByType(PaperMenu).props.statusBarHeight).toBe(0);
  });
});

runSnapshotMatrix(
  'Dropdown',
  ({variant: _v, size, state}) => (
    <Dropdown
      size={size}
      value="a"
      options={options}
      onChange={() => {}}
      disabled={state === 'disabled'}
    />
  ),
  {
    variants: ['standard'] as const,
    sizes: ['s', 'm', 'l'] as const,
    langs: ['fa'] as const,
  },
);
