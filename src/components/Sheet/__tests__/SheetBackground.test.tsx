import React from 'react';
import {StyleSheet} from 'react-native';
import type {SharedValue} from 'react-native-reanimated';
import {render} from '@testing-library/react-native';

import {SheetBackground} from '../SheetBackground';

const sharedValue = {value: 0} as SharedValue<number>;

describe('SheetBackground', () => {
  it('keeps touches gorhom would pass through, so a tap inside the sheet never reaches the backdrop', () => {
    const {getByLabelText} = render(
      <SheetBackground
        pointerEvents="none"
        style={{backgroundColor: 'red'}}
        animatedIndex={sharedValue}
        animatedPosition={sharedValue}
      />,
    );

    expect(getByLabelText('Bottom Sheet').props.pointerEvents).toBeUndefined();
  });

  it("matches gorhom's default background, with the caller's style on top", () => {
    const {getByLabelText} = render(
      <SheetBackground
        style={{backgroundColor: 'red'}}
        animatedIndex={sharedValue}
        animatedPosition={sharedValue}
      />,
    );

    const background = getByLabelText('Bottom Sheet');
    expect(background.props.accessible).toBe(true);
    expect(background.props.accessibilityRole).toBe('adjustable');
    expect(StyleSheet.flatten(background.props.style)).toEqual({
      backgroundColor: 'red',
      borderRadius: 15,
    });
  });
});
