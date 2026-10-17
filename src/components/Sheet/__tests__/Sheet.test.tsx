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

    it('leaves a dismissed sheet closed', () => {
      expect(renderAt(-1).snapToIndex).not.toHaveBeenCalled();
    });

    it('snaps a dynamically sized sheet back to its only detent', () => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const {UNSAFE_getByType} = render(<Sheet ref={ref as never} />);
      act(() => {
        UNSAFE_getByType(BottomSheetModal).props.onChange(1304, 0, 0);
      });
      act(() => {
        hideKeyboard();
        jest.runOnlyPendingTimers();
      });
      expect(ref.current.snapToIndex).toHaveBeenCalledWith(0);
    });

    it('waits a frame after the hide before snapping', () => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const {UNSAFE_getByType} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} />,
      );
      act(() => {
        UNSAFE_getByType(BottomSheetModal).props.onChange(1043, 0, 0);
      });
      act(() => {
        hideKeyboard();
      });
      expect(ref.current.snapToIndex).not.toHaveBeenCalled();
      act(() => {
        jest.runOnlyPendingTimers();
      });
      expect(ref.current.snapToIndex).toHaveBeenCalledTimes(1);
    });

    it('leaves a sheet closed when the close started before the hide', () => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const {UNSAFE_getByType} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} />,
      );
      const modal = UNSAFE_getByType(BottomSheetModal);
      act(() => {
        modal.props.onChange(1043, 0, 0);
        modal.props.onAnimate(1043, -1, 0, 0);
      });
      act(() => {
        hideKeyboard();
        jest.runOnlyPendingTimers();
      });
      expect(ref.current.snapToIndex).not.toHaveBeenCalled();
    });

    it('leaves a sheet closed when the close started during the wait', () => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const {UNSAFE_getByType} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} />,
      );
      const modal = UNSAFE_getByType(BottomSheetModal);
      act(() => {
        modal.props.onChange(1043, 0, 0);
      });
      act(() => {
        hideKeyboard();
        modal.props.onAnimate(1043, -1, 0, 0);
        jest.runOnlyPendingTimers();
      });
      expect(ref.current.snapToIndex).not.toHaveBeenCalled();
    });

    it('forwards the animation start to the caller', () => {
      const onAnimate = jest.fn();
      const {UNSAFE_getByType} = render(
        <Sheet snapPoints={['60%']} onAnimate={onAnimate} />,
      );
      act(() => {
        UNSAFE_getByType(BottomSheetModal).props.onAnimate(0, -1, 10, 20);
      });
      expect(onAnimate).toHaveBeenCalledWith(0, -1, 10, 20);
    });

    it('still sees a close when the caller also listens to animations', () => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const onAnimate = jest.fn();
      const {UNSAFE_getByType} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} onAnimate={onAnimate} />,
      );
      const modal = UNSAFE_getByType(BottomSheetModal);
      act(() => {
        modal.props.onChange(1043, 0, 0);
      });
      act(() => {
        hideKeyboard();
        modal.props.onAnimate(1043, -1, 0, 0);
        jest.runOnlyPendingTimers();
      });
      expect(onAnimate).toHaveBeenCalledWith(1043, -1, 0, 0);
      expect(ref.current.snapToIndex).not.toHaveBeenCalled();
    });

    it('snaps back after a lift that announced its off-detent target', () => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const {UNSAFE_getByType} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} />,
      );
      const modal = UNSAFE_getByType(BottomSheetModal);
      act(() => {
        modal.props.onAnimate(0, 1043, 1304, 144);
        modal.props.onChange(1043, 144, 0);
      });
      act(() => {
        hideKeyboard();
        jest.runOnlyPendingTimers();
      });
      expect(ref.current.snapToIndex).toHaveBeenCalledWith(0);
    });

    it('keeps a pending snap when the parent re-renders after the hide', () => {
      const ref = {current: {} as {snapToIndex: jest.Mock}};
      const {UNSAFE_getByType, rerender} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} />,
      );
      act(() => {
        UNSAFE_getByType(BottomSheetModal).props.onChange(1043, 0, 0);
      });
      act(() => {
        hideKeyboard();
      });
      rerender(<Sheet ref={ref as never} snapPoints={['60%']} />);
      act(() => {
        jest.runOnlyPendingTimers();
      });
      expect(ref.current.snapToIndex).toHaveBeenCalledWith(0);
    });

    it('drops the listener and a pending snap on unmount', () => {
      let methods = {} as {snapToIndex: jest.Mock};
      const ref = {
        get current() {
          return methods;
        },
        set current(next) {
          if (next) {
            methods = next;
          }
        },
      };
      const {UNSAFE_getByType, unmount} = render(
        <Sheet ref={ref as never} snapPoints={['60%']} />,
      );
      const subscription = (Keyboard.addListener as jest.Mock).mock.results[0]
        .value;
      act(() => {
        UNSAFE_getByType(BottomSheetModal).props.onChange(1043, 0, 0);
      });
      act(() => {
        hideKeyboard();
      });
      unmount();
      jest.runOnlyPendingTimers();
      expect(subscription.remove).toHaveBeenCalled();
      expect(methods.snapToIndex).not.toHaveBeenCalled();
    });
  });
});
