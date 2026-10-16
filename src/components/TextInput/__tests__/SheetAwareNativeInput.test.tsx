import React from 'react';
import {Dimensions, Keyboard, TextInput as NativeTextInput} from 'react-native';
import {
  BottomSheetTextInput,
  useBottomSheetInternal,
} from '@gorhom/bottom-sheet';
import {useSafeAreaFrame} from 'react-native-safe-area-context';

import {fireEvent, render} from '../../../../jest/test-utils';
import {
  mockSheetContext,
  type MockSheetContext,
} from '../../../../jest/sheetContext';

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
const otherField = {};
const screen = Dimensions.get('screen');

const setFrame = (width: number, height: number) => {
  mockUseSafeAreaFrame.mockReturnValue({x: 0, y: 0, width, height});
};
const fullScreen = () => setFrame(screen.width, screen.height);
const windowed = () => setFrame(screen.width, screen.height - 100);

let sheet: MockSheetContext;

const enterSheet = (state = {}) => {
  sheet = mockSheetContext(state);
  mockUseBottomSheetInternal.mockImplementation(() => sheet);
};

const mockNodeHandles = (mountTag: number | null = OWN_TAG) =>
  jest
    .spyOn(require('react-native'), 'findNodeHandle')
    .mockImplementation(instance => {
      if (instance === otherField) {
        return OTHER_TAG;
      }
      return instance ? mountTag : null;
    });

const focusMovesTo = (field: object | null) =>
  jest
    .spyOn(NativeTextInput.State, 'currentlyFocusedInput')
    .mockReturnValue(field as never);

const focusEvent = (target = OWN_TAG) => ({nativeEvent: {target}});

describe('TextInput sheet registration', () => {
  afterEach(() => {
    mockUseBottomSheetInternal.mockImplementation(() => null);
  });

  it('renders RN TextInput, not BottomSheetTextInput, inside a sheet context', () => {
    enterSheet();

    const {UNSAFE_getByType, UNSAFE_queryByType, getByTestId} = render(
      <TextInput testID="x" />,
    );

    expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
    expect(UNSAFE_getByType(NativeTextInput).props.testID).toBe('x');
    expect(getByTestId('x').type).toBe('TextInput');
  });

  it('renders a plain native input outside a sheet context', () => {
    const {UNSAFE_queryByType, getByTestId} = render(<TextInput testID="x" />);

    expect(UNSAFE_queryByType(BottomSheetTextInput)).toBeNull();
    expect(getByTestId('x').type).toBe('TextInput');
  });

  it.each([
    ['inside', () => enterSheet()],
    [
      'outside',
      () => mockUseBottomSheetInternal.mockImplementation(() => null),
    ],
  ])('forwards the ref to the native field %s a sheet', (_, context) => {
    context();
    const ref = jest.fn();

    render(<>{renderSheetAwareInput({ref, style: {}, testID: 'x'})}</>);

    expect(ref).toHaveBeenCalledWith(
      expect.objectContaining({focus: expect.any(Function)}),
    );
  });

  it('lets a caller-supplied render win', () => {
    enterSheet();

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

  const focus = (getByTestId: (id: string) => unknown, target = OWN_TAG) => {
    fireEvent(getByTestId('x') as never, 'focus', focusEvent(target));
  };

  const blur = (getByTestId: (id: string) => unknown, target = OWN_TAG) => {
    fireEvent(getByTestId('x') as never, 'blur', focusEvent(target));
  };

  beforeEach(() => {
    onFocus = jest.fn();
    onBlur = jest.fn();
    ref = jest.fn();
    enterSheet();
    mockNodeHandles();
    focusMovesTo(null);
    jest.spyOn(Keyboard, 'dismiss');
  });

  afterEach(() => {
    mockUseBottomSheetInternal.mockImplementation(() => null);
    mockUseSafeAreaFrame.mockReset();
    mockUseSafeAreaFrame.mockImplementation(jestSetupFrame);
    jest.restoreAllMocks();
  });

  describe('lifecycle', () => {
    it('registers its tag at mount and removes it at unmount', () => {
      const {unmount} = renderInput();

      expect([...sheet.textInputNodesRef.current]).toEqual([OWN_TAG]);

      unmount();

      expect(sheet.textInputNodesRef.current.size).toBe(0);
    });

    it.each([
      ['clears its own target', OWN_TAG, undefined],
      ["leaves another input's target", OTHER_TAG, OTHER_TAG],
    ])('%s at unmount', (_, heldTarget, expectedTarget) => {
      const {unmount} = renderInput();
      sheet.keyboardState = {target: heldTarget};

      unmount();

      expect(sheet.keyboardState.target).toBe(expectedTarget);
    });

    it('registers nothing and writes nothing when the field has no tag', () => {
      mockNodeHandles(null);
      const {unmount} = renderInput();

      expect(sheet.textInputNodesRef.current.size).toBe(0);

      unmount();

      expect(sheet.animatedKeyboardState.set).not.toHaveBeenCalled();
    });
  });

  describe('ref', () => {
    it('passes the native field to a callback ref, then null at unmount', () => {
      const {unmount} = renderInput();

      expect(ref).toHaveBeenLastCalledWith(
        expect.objectContaining({focus: expect.any(Function)}),
      );

      unmount();

      expect(ref).toHaveBeenLastCalledWith(null);
    });

    it('fills an object ref, then clears it at unmount', () => {
      const objectRef = React.createRef<NativeTextInput>();
      const {unmount} = render(<SheetAwareNativeInput ref={objectRef} />);

      expect(objectRef.current).toEqual(
        expect.objectContaining({focus: expect.any(Function)}),
      );

      unmount();

      expect(objectRef.current).toBeNull();
    });
  });

  describe('on focus and blur', () => {
    it.each([
      ['equals', 0],
      ['is just short of', 0.4],
    ])(
      'sets its own target, then calls onFocus, when the frame %s the screen',
      (_, shortBy) => {
        setFrame(screen.width - shortBy, screen.height - shortBy);
        const {getByTestId} = renderInput();

        focus(getByTestId);

        expect(sheet.keyboardState.target).toBe(OWN_TAG);
        expect(sheet.animatedKeyboardState.set).toHaveBeenCalledTimes(1);
        expect(onFocus).toHaveBeenCalledTimes(1);
        expect(onFocus).toHaveBeenCalledWith(focusEvent());
        expect(
          sheet.animatedKeyboardState.set.mock.invocationCallOrder[0],
        ).toBeLessThan(onFocus.mock.invocationCallOrder[0]);
      },
    );

    it('passes blur to the caller once', () => {
      fullScreen();
      const {getByTestId} = renderInput();
      focus(getByTestId);

      blur(getByTestId);

      expect(onBlur).toHaveBeenCalledTimes(1);
      expect(onBlur).toHaveBeenCalledWith(focusEvent());
    });

    it('keeps its target when focus moves to another sheet input', () => {
      fullScreen();
      const {getByTestId} = renderInput();
      focus(getByTestId);
      sheet.textInputNodesRef.current.add(OTHER_TAG);
      focusMovesTo(otherField);

      blur(getByTestId);

      expect(sheet.keyboardState.target).toBe(OWN_TAG);
    });

    it.each([
      ['shorter', screen.width, screen.height - 100],
      ['narrower', screen.width - 100, screen.height],
    ])(
      'sets its own target when the window is %s than the screen',
      (_, width, height) => {
        setFrame(width, height);
        const {getByTestId} = renderInput();

        focus(getByTestId);

        expect(sheet.keyboardState.target).toBe(OWN_TAG);
      },
    );

    it('keeps its target when focus moves to another sheet input in a window smaller than the screen', () => {
      windowed();
      const {getByTestId} = renderInput();
      focus(getByTestId);
      sheet.textInputNodesRef.current.add(OTHER_TAG);
      focusMovesTo(otherField);

      blur(getByTestId);

      expect(sheet.keyboardState.target).toBe(OWN_TAG);
    });

    it.each([
      ['nothing', null],
      ['an input outside the sheet', otherField],
    ])('clears its target when focus moves to %s', (_, next) => {
      fullScreen();
      const {getByTestId} = renderInput();
      focus(getByTestId);
      focusMovesTo(next);

      blur(getByTestId);

      expect(sheet.keyboardState.target).toBeUndefined();
    });
  });

  it.each([
    ['full screen', fullScreen],
    ['windowed', windowed],
  ])("never clears another input's target on blur, %s", (_, frame) => {
    enterSheet({target: OTHER_TAG});
    frame();
    const {getByTestId} = renderInput();

    blur(getByTestId);

    expect(sheet.keyboardState.target).toBe(OTHER_TAG);
    expect(sheet.animatedKeyboardState.set).not.toHaveBeenCalled();
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
      expect(sheet.textInputNodesRef.current.size).toBe(0);
      expect(sheet.animatedKeyboardState.set).not.toHaveBeenCalled();
      expect(Keyboard.dismiss).not.toHaveBeenCalled();
      expect(addEventListener).not.toHaveBeenCalled();
      expect(mockUseSafeAreaFrame).not.toHaveBeenCalled();
      expect(onFocus).toHaveBeenCalledTimes(1);
    });
  });
});
