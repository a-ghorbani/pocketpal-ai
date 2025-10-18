import {Dimensions, Keyboard, LayoutAnimation, Platform} from 'react-native';

import {renderHook, act} from '@testing-library/react-native';
import {useSafeAreaFrame} from 'react-native-safe-area-context';

import {useKeyboardDimensions} from '../useKeyboardDimensions';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaFrame: jest.fn(),
}));

jest.mock('react-native', () => ({
  Dimensions: {
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    removeEventListener: jest.fn(),
    get: jest.fn().mockReturnValue({height: 800}),
  },
  Keyboard: {
    addListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    removeListener: jest.fn(),
  },
  LayoutAnimation: {
    configureNext: jest.fn(),
    Types: {
      easeInEaseOut: 'easeInEaseOut',
    },
  },
  Platform: {
    OS: 'ios', // android?
  },
}));

describe('useKeyboardDimensions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (useSafeAreaFrame as jest.Mock).mockReturnValue({height: 800, y: 0});

    // Re-setup the mocks after resetAllMocks
    (Dimensions.addEventListener as jest.Mock).mockReturnValue({
      remove: jest.fn(),
    });
    (Keyboard.addListener as jest.Mock).mockReturnValue({
      remove: jest.fn(),
    });
  });

  it('should initialize with the screen height and no keyboard', () => {
    const {result} = renderHook(() => useKeyboardDimensions());

    expect(result.current).toEqual({
      keyboardEndPositionY: 800,
      keyboardHeight: 0,
    });
  });

  it('should update keyboard dimensions on keyboardWillChangeFrame', () => {
    const mockEvent = {
      endCoordinates: {screenY: 600}, // Keyboard's end position
      duration: 250,
      easing: 'easeInEaseOut',
    };

    const {result} = renderHook(() => useKeyboardDimensions());

    act(() => {
      // Trigger the keyboard event to simulate the keyboard appearance
      (Keyboard.addListener as jest.Mock).mock.calls[0][1](mockEvent); // Simulating 'keyboardWillChangeFrame'
    });

    expect(LayoutAnimation.configureNext).toHaveBeenCalledWith({
      duration: 250,
      update: {
        duration: 250,
        type: 'easeInEaseOut',
      },
    });

    expect(result.current).toEqual({
      keyboardEndPositionY: 600,
      keyboardHeight: 200, // 800 - 600
    });
  });

  it('should reset keyboard dimensions on keyboardDidHide (Android)', () => {
    Platform.OS = 'android';
    const {result} = renderHook(() => useKeyboardDimensions(true));

    act(() => {
      // Simulate keyboardDidHide event
      (Keyboard.addListener as jest.Mock).mock.calls[0][1](); // Resetting dimensions
    });

    expect(result.current).toEqual({
      keyboardEndPositionY: 800, // Back to the full screen height
      keyboardHeight: 0,
    });
  });

  it('should add keyboard listeners for Android when `useListenersOnAndroid` is true', () => {
    Platform.OS = 'android';
    renderHook(() => useKeyboardDimensions(true));

    expect(Keyboard.addListener).toHaveBeenCalledWith(
      'keyboardDidHide',
      expect.any(Function),
    );
    expect(Keyboard.addListener).toHaveBeenCalledWith(
      'keyboardDidShow',
      expect.any(Function),
    );
  });

  it('should update keyboardEndPositionY when dimensions change', () => {
    const {result} = renderHook(() => useKeyboardDimensions());
    act(() => {
      const dimensionsChangeHandler = (Dimensions.addEventListener as jest.Mock)
        .mock.calls[0][1];
      dimensionsChangeHandler({window: {height: 1000}});
    });
    expect(result.current.keyboardEndPositionY).toBe(1000);
  });

  it('should remove all listeners on unmount', () => {
    const dimensionsListener = {remove: jest.fn()};
    const keyboardListener = {remove: jest.fn()};

    (Dimensions.addEventListener as jest.Mock).mockReturnValue(
      dimensionsListener,
    );
    (Keyboard.addListener as jest.Mock).mockReturnValue(keyboardListener);

    const {unmount} = renderHook(() => useKeyboardDimensions());

    // Unmount the hook and ensure listeners are removed
    unmount();

    expect(keyboardListener.remove).toHaveBeenCalled();
    expect(dimensionsListener.remove).toHaveBeenCalled();
  });
});
