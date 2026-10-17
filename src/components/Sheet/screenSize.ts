import {useSyncExternalStore} from 'react';
import {Dimensions} from 'react-native';
import {useSafeAreaFrame} from 'react-native-safe-area-context';

const listeners = new Set<() => void>();
let subscription: ReturnType<typeof Dimensions.addEventListener> | undefined;

const notifyListeners = () => listeners.forEach(listener => listener());

const subscribeToScreen = (listener: () => void) => {
  listeners.add(listener);
  subscription ??= Dimensions.addEventListener('change', notifyListeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.remove();
      subscription = undefined;
    }
  };
};

const getScreenWidth = () => Dimensions.get('screen').width;
const getScreenHeight = () => Dimensions.get('screen').height;

const useScreenWidth = () =>
  useSyncExternalStore(subscribeToScreen, getScreenWidth);

export const useScreenHeight = () =>
  useSyncExternalStore(subscribeToScreen, getScreenHeight);

const sameLength = (a: number, b: number) => Math.abs(a - b) < 1;

export const useAppWindowFillsScreen = () => {
  const frame = useSafeAreaFrame();
  const screenWidth = useScreenWidth();
  const screenHeight = useScreenHeight();

  return (
    sameLength(
      Math.max(frame.width, frame.height),
      Math.max(screenWidth, screenHeight),
    ) &&
    sameLength(
      Math.min(frame.width, frame.height),
      Math.min(screenWidth, screenHeight),
    )
  );
};
