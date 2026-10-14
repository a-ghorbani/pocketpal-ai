import {Dimensions} from 'react-native';
import {useSafeAreaFrame} from 'react-native-safe-area-context';

import {act, renderHook} from '../../../../jest/test-utils';

import {useAppWindowFillsScreen, useScreenHeight} from '../screenSize';

const initialDimensions = {
  screen: Dimensions.get('screen'),
  window: Dimensions.get('window'),
};
const screen = initialDimensions.screen;
const jestSetupFrame = (useSafeAreaFrame as jest.Mock).getMockImplementation();

const setFrame = (width: number, height: number) => {
  (useSafeAreaFrame as jest.Mock).mockReturnValue({x: 0, y: 0, width, height});
};

describe('useAppWindowFillsScreen', () => {
  afterEach(() => {
    act(() => {
      Dimensions.set(initialDimensions);
    });
    (useSafeAreaFrame as jest.Mock).mockReset();
    (useSafeAreaFrame as jest.Mock).mockImplementation(jestSetupFrame);
    jest.restoreAllMocks();
  });

  it.each([
    ['equals the screen', screen.width, screen.height],
    ['is within 1 dp of the screen', screen.width - 0.4, screen.height - 0.4],
    ['is the screen transposed', screen.height, screen.width],
  ])('is true when the frame %s', (_, width, height) => {
    setFrame(width, height);

    const {result} = renderHook(() => useAppWindowFillsScreen());

    expect(result.current).toBe(true);
  });

  it.each([
    ['shorter', screen.width, screen.height - 100],
    ['narrower', screen.width - 100, screen.height],
  ])('is false when the frame is %s than the screen', (_, width, height) => {
    setFrame(width, height);

    const {result} = renderHook(() => useAppWindowFillsScreen());

    expect(result.current).toBe(false);
  });

  it('re-evaluates when the screen changes', () => {
    setFrame(screen.width, screen.height);
    const {result} = renderHook(() => useAppWindowFillsScreen());

    act(() => {
      Dimensions.set({
        ...initialDimensions,
        screen: {...screen, height: screen.height + 100},
      });
    });

    expect(result.current).toBe(false);
  });
});

describe('screen subscription', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shares one Dimensions listener across consumers', () => {
    const addEventListener = jest.spyOn(Dimensions, 'addEventListener');

    const first = renderHook(() => useScreenHeight());
    const second = renderHook(() => useAppWindowFillsScreen());

    expect(addEventListener).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });

  it('removes the listener once the last consumer unmounts', () => {
    const remove = jest.fn();
    jest
      .spyOn(Dimensions, 'addEventListener')
      .mockReturnValue({remove} as never);

    const first = renderHook(() => useScreenHeight());
    const second = renderHook(() => useScreenHeight());
    first.unmount();
    expect(remove).not.toHaveBeenCalled();

    second.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
