import React from 'react';
import {Dimensions} from 'react-native';
import {BottomSheetModal} from '@gorhom/bottom-sheet';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {render} from '../../../../jest/test-utils';

import {Sheet} from '../Sheet';

const screenHeight = Dimensions.get('screen').height;

describe('Sheet', () => {
  beforeEach(() => {
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 24,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  afterEach(() => {
    (useSafeAreaInsets as jest.Mock).mockReturnValue({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it('passes the top safe-area inset and resolved percentage snap points', () => {
    const {UNSAFE_getByType} = render(<Sheet snapPoints={['50%']} />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.topInset).toBe(24);
    expect(modal.props.snapPoints).toEqual([screenHeight / 2]);
  });

  it('keeps the full-height snap point', () => {
    const {UNSAFE_getByType} = render(<Sheet displayFullHeight />);

    expect(UNSAFE_getByType(BottomSheetModal).props.snapPoints).toEqual([
      screenHeight - 24 - 16,
    ]);
  });

  it('enables dynamic sizing without snap points', () => {
    const {UNSAFE_getByType} = render(<Sheet />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.snapPoints).toBeUndefined();
    expect(modal.props.enableDynamicSizing).toBe(true);
  });
});
