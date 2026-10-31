import {LayoutChangeEvent} from 'react-native';

import {renderHook, act} from '@testing-library/react-native';

import {useComponentSize} from '../useComponentSize';

describe('useComponentSize', () => {
  it('should return initial size of {height: 0, width: 0}', () => {
    const {result} = renderHook(() => useComponentSize());

    expect(result.current.size).toEqual({height: 0, width: 0});
  });

  it('should update size when onLayout is triggered', () => {
    const {result} = renderHook(() => useComponentSize());

    const mockEvent: LayoutChangeEvent = {
      nativeEvent: {
        layout: {
          height: 100,
          width: 200,
          x: 0,
          y: 0,
        },
      },
      currentTarget: {} as any,
      target: {} as any,
      bubbles: false,
      cancelable: false,
      defaultPrevented: false,
      eventPhase: 0,
      isTrusted: true,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      timeStamp: Date.now(),
      type: 'layout',
      isDefaultPrevented: jest.fn(),
      isPropagationStopped: jest.fn(),
      persist: jest.fn(),
      dispatchConfig: {} as any,
    };

    // Trigger the onLayout callback with the event
    act(() => {
      result.current.onLayout(mockEvent);
    });

    expect(result.current.size).toEqual({height: 100, width: 200});
  });
});
