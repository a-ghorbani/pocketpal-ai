import React from 'react';
import {Dimensions, Keyboard} from 'react-native';
import {BottomSheetModal, useBottomSheetInternal} from '@gorhom/bottom-sheet';
import {
  useSafeAreaFrame,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {act, render} from '../../../../jest/test-utils';

import {Sheet} from '../Sheet';
import {SheetBackground} from '../SheetBackground';

const fullScreenFrame = {x: 0, y: 0, width: 390, height: 844};
const PERCENT_SNAP_POINTS = ['50%'];

const setFrameHeight = (height: number) => {
  (useSafeAreaFrame as jest.Mock).mockReturnValue({...fullScreenFrame, height});
};

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
    (useSafeAreaFrame as jest.Mock).mockReturnValue(fullScreenFrame);
  });

  it('passes the top safe-area inset and resolved percentage snap points', () => {
    const {UNSAFE_getByType} = render(<Sheet snapPoints={['50%']} />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.topInset).toBe(24);
    expect(modal.props.snapPoints).toEqual([fullScreenFrame.height / 2]);
  });

  it('renders the touch-taking SheetBackground', () => {
    const {UNSAFE_getByType} = render(<Sheet />);

    expect(UNSAFE_getByType(BottomSheetModal).props.backgroundComponent).toBe(
      SheetBackground,
    );
  });

  it('resolves percentages against an app window shorter than the screen', () => {
    setFrameHeight(400);
    const {UNSAFE_getByType} = render(<Sheet snapPoints={['50%']} />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.snapPoints).toEqual([200]);
    expect(modal.props.maxDynamicContentSize).toBe(360);
  });

  it('re-resolves percentages and the full-height cap when only the window resizes', () => {
    const {UNSAFE_getByType, rerender} = render(
      <Sheet snapPoints={PERCENT_SNAP_POINTS} />,
    );

    setFrameHeight(600);
    rerender(<Sheet snapPoints={PERCENT_SNAP_POINTS} />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.snapPoints).toEqual([300]);
    expect(modal.props.maxDynamicContentSize).toBe(560);
  });

  it('keeps the full-height snap point', () => {
    const {UNSAFE_getByType} = render(<Sheet displayFullHeight />);

    expect(UNSAFE_getByType(BottomSheetModal).props.snapPoints).toEqual([
      fullScreenFrame.height - 24 - 16,
    ]);
  });

  describe('when the screen rotates', () => {
    const portrait = {
      screen: Dimensions.get('screen'),
      window: Dimensions.get('window'),
    };
    const landscape = {
      ...portrait.screen,
      width: portrait.screen.height,
      height: portrait.screen.width,
    };

    afterEach(() => {
      act(() => {
        Dimensions.set(portrait);
      });
    });

    describe('with the keyboard up', () => {
      const focusSheetInput = (target?: number) => {
        (useBottomSheetInternal as jest.Mock).mockReturnValue({
          animatedKeyboardState: {get: () => ({target})},
        });
      };

      beforeEach(() => {
        jest.spyOn(Keyboard, 'dismiss');
      });

      afterEach(() => {
        (useBottomSheetInternal as jest.Mock).mockReturnValue(null);
        jest.restoreAllMocks();
      });

      it('dismisses the keyboard of a focused sheet input', () => {
        focusSheetInput(42);
        render(<Sheet snapPoints={['60%']} />);
        expect(Keyboard.dismiss).not.toHaveBeenCalled();

        act(() => {
          Dimensions.set({screen: landscape, window: landscape});
        });

        expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
      });

      it('leaves the keyboard alone when no sheet input is focused', () => {
        focusSheetInput(undefined);
        render(<Sheet snapPoints={['60%']} />);

        act(() => {
          Dimensions.set({screen: landscape, window: landscape});
        });

        expect(Keyboard.dismiss).not.toHaveBeenCalled();
      });

      it('leaves the keyboard alone when only the window changes', () => {
        focusSheetInput(42);
        render(<Sheet snapPoints={['60%']} />);

        act(() => {
          Dimensions.set({
            screen: portrait.screen,
            window: {...portrait.window, height: portrait.window.height / 2},
          });
        });

        expect(Keyboard.dismiss).not.toHaveBeenCalled();
      });

      it('leaves the keyboard alone when only the app frame changes', () => {
        focusSheetInput(42);
        const {rerender} = render(<Sheet snapPoints={PERCENT_SNAP_POINTS} />);

        setFrameHeight(400);
        rerender(<Sheet snapPoints={PERCENT_SNAP_POINTS} />);

        expect(Keyboard.dismiss).not.toHaveBeenCalled();
      });
    });
  });

  it('enables dynamic sizing without snap points', () => {
    const {UNSAFE_getByType} = render(<Sheet />);

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.snapPoints).toBeUndefined();
    expect(modal.props.enableDynamicSizing).toBe(true);
  });

  it('passes change and animate handlers through unchanged', () => {
    const onChange = jest.fn();
    const onAnimate = jest.fn();
    const {UNSAFE_getByType} = render(
      <Sheet onChange={onChange} onAnimate={onAnimate} />,
    );

    const modal = UNSAFE_getByType(BottomSheetModal);
    expect(modal.props.onChange).toBe(onChange);
    expect(modal.props.onAnimate).toBe(onAnimate);
  });
});
