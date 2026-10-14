import React from 'react';
import {Dimensions, Keyboard} from 'react-native';
import {BottomSheetModal} from '@gorhom/bottom-sheet';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {act, render} from '../../../../jest/test-utils';

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

  describe('keyboard hide after a clamped lift', () => {
    let hideKeyboard: () => void;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.spyOn(Keyboard, 'addListener').mockImplementation(((
        event: string,
        listener: () => void,
      ) => {
        if (event === 'keyboardDidHide') {
          hideKeyboard = listener;
        }
        return {remove: jest.fn()};
      }) as never);
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    const renderAt = (index: number, onChange = jest.fn()) => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const {UNSAFE_getByType} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} onChange={onChange} />,
      );
      act(() => {
        UNSAFE_getByType(BottomSheetModal).props.onChange(index, 0, 0);
      });
      act(() => {
        hideKeyboard();
        jest.runOnlyPendingTimers();
      });
      return ref.current;
    };

    it('snaps back to the highest detent when the lift was recorded off-detent', () => {
      expect(renderAt(1043).snapToIndex).toHaveBeenCalledWith(0);
    });

    it('leaves a sheet resting on a detent alone', () => {
      expect(renderAt(0).snapToIndex).not.toHaveBeenCalled();
    });

    it('forwards the change to the caller', () => {
      const onChange = jest.fn();
      renderAt(0, onChange);
      expect(onChange).toHaveBeenCalledWith(0, 0, 0);
    });
  });
});
