import React from 'react';
import {Dimensions, Keyboard, TextInput as NativeTextInput} from 'react-native';
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from '@gorhom/bottom-sheet';
import {useSafeAreaFrame} from 'react-native-safe-area-context';

import {fireEvent, render} from '../../../../jest/test-utils';

import {
  renderSheetAwareInput,
  SheetAwareNativeInput,
} from '../SheetAwareNativeInput';
import {TextInput} from '../TextInput';

const mockUseBottomSheetInternal = useBottomSheetInternal as jest.Mock;
const mockUseSafeAreaFrame = useSafeAreaFrame as jest.Mock;
const jestSetupFrame = mockUseSafeAreaFrame.getMockImplementation();

const OWN_TAG = 42;
const OTHER_TAG = 7;
const screen = Dimensions.get('screen');

const setFrame = (width: number, height: number) => {
  mockUseSafeAreaFrame.mockReturnValue({x: 0, y: 0, width, height});
};
const fullScreen = () => setFrame(screen.width, screen.height);

let keyboardState: {target?: number};
const keyboardStateSet = jest.fn();

const enterSheet = () => {
  keyboardState = {};
  mockUseBottomSheetInternal.mockImplementation(() => ({
    animatedKeyboardState: {
      get: () => keyboardState,
      set: keyboardStateSet.mockImplementation(next => {
        keyboardState = next;
      }),
    },
  }));
};

const focusEvent = (target = OWN_TAG) => ({nativeEvent: {target}});

describe('TextInput sheet registration', () => {
  afterEach(() => {
    mockUseBottomSheetInternal.mockImplementation(() => null);
  });

  it('renders a BottomSheetTextInput inside a sheet context', () => {
    mockUseBottomSheetInternal.mockImplementation(() => ({}));

    const {UNSAFE_getByType} = render(<TextInput testID="x" />);

    expect(UNSAFE_getByType(BottomSheetTextInput).props.testID).toBe('x');
  });

  it('renders a plain native input outside a sheet context', () => {
    const {UNSAFE_queryByType, getByTestId} = render(<TextInput testID="x" />);

    expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
    expect(getByTestId('x').type).toBe('TextInput');
  });

  it.each([
    ['inside', () => ({})],
    ['outside', () => null],
  ])('forwards the ref to the native field %s a sheet', (_, context) => {
    mockUseBottomSheetInternal.mockImplementation(context);
    const ref = jest.fn();

    render(<>{renderSheetAwareInput({ref, style: {}, testID: 'x'})}</>);

    expect(ref).toHaveBeenCalledWith(
      expect.objectContaining({focus: expect.any(Function)}),
    );
  });

  it('lets a caller-supplied render win', () => {
    mockUseBottomSheetInternal.mockImplementation(() => ({}));

    const {UNSAFE_queryByType, getByTestId} = render(
      <TextInput
        testID="x"
        render={props => <NativeTextInput {...props} testID="custom" />}
      />,
    );

    expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
    expect(getByTestId('custom')).toBeTruthy();
  });
});

describe('SheetAwareNativeInput keyboard registration', () => {
  let onFocus: jest.Mock;
  let onBlur: jest.Mock;
  let ref: jest.Mock;

  const renderInput = () => {
    const utils = render(
      <SheetAwareNativeInput
        ref={ref}
        testID="x"
        onFocus={onFocus}
        onBlur={onBlur}
      />,
    );
    return {
      ...utils,
      rerenderInput: () =>
        utils.rerender(
          <SheetAwareNativeInput
            ref={ref}
            testID="x"
            onFocus={onFocus}
            onBlur={onBlur}
          />,
        ),
    };
  };

  const focus = (
    getByTestId: (id: string) => unknown,
    target = OWN_TAG,
    heldTarget = target,
  ) => {
    keyboardState = {...keyboardState, target: heldTarget};
    fireEvent(getByTestId('x') as never, 'focus', focusEvent(target));
  };

  beforeEach(() => {
    onFocus = jest.fn();
    onBlur = jest.fn();
    ref = jest.fn();
    keyboardStateSet.mockReset();
    enterSheet();
    jest.spyOn(Keyboard, 'dismiss');
  });

  afterEach(() => {
    mockUseBottomSheetInternal.mockImplementation(() => null);
    mockUseSafeAreaFrame.mockReset();
    mockUseSafeAreaFrame.mockImplementation(jestSetupFrame);
    jest.restoreAllMocks();
  });

  describe('when the app window fills the screen', () => {
    it.each([
      ['equals', 0],
      ['is within 1 dp of', 0.4],
    ])(
      'keeps the focus registered when the frame %s the screen',
      (_, shortBy) => {
        setFrame(screen.width - shortBy, screen.height - shortBy);
        const {getByTestId, UNSAFE_getByType} = renderInput();

        focus(getByTestId);

        expect(UNSAFE_getByType(BottomSheetTextInput)).toBeTruthy();
        expect(keyboardState.target).toBe(OWN_TAG);
        expect(keyboardStateSet).not.toHaveBeenCalled();
        expect(onFocus).toHaveBeenCalledTimes(1);
        expect(onFocus).toHaveBeenCalledWith(focusEvent());
      },
    );

    it('passes blur to the caller once', () => {
      fullScreen();
      const {getByTestId} = renderInput();
      focus(getByTestId);

      fireEvent(getByTestId('x'), 'blur', focusEvent());

      expect(onBlur).toHaveBeenCalledTimes(1);
      expect(onBlur).toHaveBeenCalledWith(focusEvent());
    });
  });

  describe('when the app window is smaller than the screen', () => {
    it.each([
      ['shorter', screen.width, screen.height - 100],
      ['only narrower', screen.width - 100, screen.height],
    ])('clears its own target when the window is %s', (_, width, height) => {
      setFrame(width, height);
      const {getByTestId} = renderInput();

      focus(getByTestId);

      expect(keyboardState.target).toBeUndefined();
      expect(onFocus).toHaveBeenCalledTimes(1);
      expect(onFocus).toHaveBeenCalledWith(focusEvent());
    });

    it('leaves a target held by another input alone', () => {
      setFrame(screen.width, screen.height - 100);
      const {getByTestId} = renderInput();

      focus(getByTestId, OWN_TAG, OTHER_TAG);

      expect(keyboardState.target).toBe(OTHER_TAG);
    });
  });

  describe('when the window changes while focused', () => {
    it('ignores a rotation that transposes the frame before the screen', () => {
      fullScreen();
      const {getByTestId, rerenderInput} = renderInput();
      focus(getByTestId);

      setFrame(screen.height, screen.width);
      rerenderInput();

      expect(Keyboard.dismiss).not.toHaveBeenCalled();
      expect(ref).toHaveBeenCalledTimes(1);
    });

    it('dismisses the keyboard when the window narrows into a split', () => {
      fullScreen();
      const {getByTestId, rerenderInput} = renderInput();
      focus(getByTestId);
      keyboardStateSet.mockClear();

      setFrame(screen.width - 100, screen.height);
      rerenderInput();

      expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
      expect(ref).toHaveBeenCalledTimes(1);
      expect(keyboardStateSet).not.toHaveBeenCalled();
    });

    it('dismisses the keyboard when a narrow window goes full screen', () => {
      setFrame(screen.width - 100, screen.height);
      const {getByTestId, rerenderInput} = renderInput();
      focus(getByTestId);

      fullScreen();
      rerenderInput();

      expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
    });

    it('never dismisses when the keyboard alone shrinks the frame', () => {
      fullScreen();
      const {getByTestId, rerenderInput} = renderInput();
      focus(getByTestId);

      setFrame(screen.width, screen.height - 300);
      rerenderInput();
      fullScreen();
      rerenderInput();

      expect(Keyboard.dismiss).not.toHaveBeenCalled();
    });

    it('keeps a height-only window change focused and gates the next focus', () => {
      fullScreen();
      const {getByTestId, rerenderInput} = renderInput();
      focus(getByTestId);

      setFrame(screen.width, screen.height - 100);
      rerenderInput();
      setFrame(screen.width - 100, screen.height - 100);
      rerenderInput();

      expect(Keyboard.dismiss).not.toHaveBeenCalled();

      fireEvent(getByTestId('x'), 'blur', focusEvent());
      focus(getByTestId);

      expect(keyboardState.target).toBeUndefined();
    });
  });

  describe('when the window changes while not focused', () => {
    it('does not dismiss once the field has blurred', () => {
      fullScreen();
      const {getByTestId, rerenderInput} = renderInput();
      focus(getByTestId);
      fireEvent(getByTestId('x'), 'blur', focusEvent());

      setFrame(screen.width - 100, screen.height);
      rerenderInput();

      expect(Keyboard.dismiss).not.toHaveBeenCalled();
    });

    it.each([
      [
        'full screen to windowed',
        fullScreen,
        () => setFrame(screen.width - 100, screen.height),
        undefined,
      ],
      [
        'windowed to full screen',
        () => setFrame(screen.width - 100, screen.height),
        fullScreen,
        OWN_TAG,
      ],
    ])(
      'does not dismiss on %s, and the next focus follows the new window',
      (_, before, after, expectedTarget) => {
        before();
        const {getByTestId, rerenderInput} = renderInput();

        after();
        rerenderInput();

        expect(Keyboard.dismiss).not.toHaveBeenCalled();

        focus(getByTestId);

        expect(keyboardState.target).toBe(expectedTarget);
      },
    );
  });

  describe('outside a sheet', () => {
    it('renders a plain input and never touches the window or keyboard', () => {
      mockUseBottomSheetInternal.mockImplementation(() => null);
      const addEventListener = jest.spyOn(Dimensions, 'addEventListener');
      mockUseSafeAreaFrame.mockClear();
      setFrame(screen.width - 100, screen.height);
      const {getByTestId, UNSAFE_queryByType, rerenderInput} = renderInput();

      focus(getByTestId);
      fullScreen();
      rerenderInput();

      expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
      expect(keyboardState.target).toBe(OWN_TAG);
      expect(Keyboard.dismiss).not.toHaveBeenCalled();
      expect(addEventListener).not.toHaveBeenCalled();
      expect(mockUseSafeAreaFrame).not.toHaveBeenCalled();
      expect(onFocus).toHaveBeenCalledTimes(1);
    });
  });
});
