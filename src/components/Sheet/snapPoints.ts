import {useSyncExternalStore} from 'react';
import {Dimensions} from 'react-native';
import type {BottomSheetModalProps} from '@gorhom/bottom-sheet';

const FULL_HEIGHT_TOP_GAP = 16;

export const fullHeightSnapPoint = (screenHeight: number, insetsTop: number) =>
  screenHeight - insetsTop - FULL_HEIGHT_TOP_GAP;

export const resolveSnapPoints = (
  snapPoints: BottomSheetModalProps['snapPoints'],
  screenHeight: number,
  insetsTop: number,
): BottomSheetModalProps['snapPoints'] => {
  if (!Array.isArray(snapPoints)) {
    return snapPoints;
  }
  const maxHeight = fullHeightSnapPoint(screenHeight, insetsTop);
  return snapPoints.map(point =>
    typeof point === 'string'
      ? Math.min((Number(point.split('%')[0]) * screenHeight) / 100, maxHeight)
      : point,
  );
};

const subscribeToScreen = (onChange: () => void) => {
  const subscription = Dimensions.addEventListener('change', onChange);
  return () => subscription.remove();
};

const getScreenHeight = () => Dimensions.get('screen').height;

export const useScreenHeight = () =>
  useSyncExternalStore(subscribeToScreen, getScreenHeight);
