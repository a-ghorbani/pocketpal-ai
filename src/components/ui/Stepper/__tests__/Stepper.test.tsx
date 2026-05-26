import React from 'react';
import {I18nManager} from 'react-native';

import {render} from '../../../../../jest/test-utils';
import {Stepper} from '../Stepper';
import {runSnapshotMatrix} from '../../__tests__/helpers/snapshotMatrix';

describe('Stepper', () => {
  afterEach(() => {
    // Reset RTL flag in case a test toggled it.
    I18nManager.isRTL = false;
  });

  it('renders `total` dots and exposes default progressbar a11y', () => {
    const {getByTestId} = render(<Stepper total={4} current={2} />);
    const root = getByTestId('ui-stepper');
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityValue).toEqual({min: 1, max: 4, now: 2});
    expect(root.props.accessibilityLabel).toBe('Step 2 of 4');
    expect(getByTestId('ui-stepper-dot-1')).toBeTruthy();
    expect(getByTestId('ui-stepper-dot-2')).toBeTruthy();
    expect(getByTestId('ui-stepper-dot-3')).toBeTruthy();
    expect(getByTestId('ui-stepper-dot-4')).toBeTruthy();
  });

  it('clamps current to [1, total] with a dev-only warning', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const {getByTestId} = render(<Stepper total={4} current={9} />);
    expect(getByTestId('ui-stepper').props.accessibilityValue).toEqual({
      min: 1,
      max: 4,
      now: 4,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reverses row direction in RTL', () => {
    I18nManager.isRTL = true;
    const {getByTestId} = render(<Stepper total={3} current={1} />);
    const root = getByTestId('ui-stepper');
    const flatStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.filter(Boolean))
      : root.props.style;
    expect(flatStyle.flexDirection).toBe('row-reverse');
  });
});

runSnapshotMatrix(
  'Stepper',
  ({variant}) => <Stepper total={Number(variant)} current={1} />,
  {
    variants: ['2', '3', '4', '5'] as const,
    sizes: ['m'] as const,
    states: ['default'] as const,
    modes: ['light', 'dark'] as const,
  },
);
