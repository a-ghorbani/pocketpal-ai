import {RefObject, useCallback, useEffect, useRef} from 'react';
import {Keyboard} from 'react-native';
import type {BottomSheetModalProps} from '@gorhom/bottom-sheet';
import type {BottomSheetModalMethods} from '@gorhom/bottom-sheet/lib/typescript/types';

type SnapPoints = BottomSheetModalProps['snapPoints'];
type OnChange = NonNullable<BottomSheetModalProps['onChange']>;
type OnAnimate = NonNullable<BottomSheetModalProps['onAnimate']>;

const detentCount = (snapPoints: SnapPoints) => {
  if (snapPoints === undefined) {
    return 1;
  }
  return Array.isArray(snapPoints)
    ? snapPoints.length
    : snapPoints.get().length;
};

// gorhom 5.2.8 records a keyboard lift clamped at topInset with the highest
// detent's position as its index, so keyboardBlurBehavior="restore" finds no
// detent and leaves the sheet lifted. Snap back unless a close or snap started.
export const useClampedLiftRestore = (
  sheetRef: RefObject<BottomSheetModalMethods | null>,
  snapPoints: SnapPoints,
  onChange?: OnChange,
  onAnimate?: OnAnimate,
): {onChange: OnChange; onAnimate: OnAnimate} => {
  const targetIndex = useRef(-1);
  const snapPointsRef = useRef(snapPoints);
  snapPointsRef.current = snapPoints;

  useEffect(() => {
    let frame: number | null = null;
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      frame = requestAnimationFrame(() => {
        const highestIndex = detentCount(snapPointsRef.current) - 1;
        if (targetIndex.current > highestIndex) {
          sheetRef.current?.snapToIndex(highestIndex);
        }
      });
    });
    return () => {
      subscription.remove();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [sheetRef]);

  const handleChange = useCallback<OnChange>(
    (index, position, type) => {
      targetIndex.current = index;
      onChange?.(index, position, type);
    },
    [onChange],
  );

  const handleAnimate = useCallback<OnAnimate>(
    (fromIndex, toIndex, fromPosition, toPosition) => {
      targetIndex.current = toIndex;
      onAnimate?.(fromIndex, toIndex, fromPosition, toPosition);
    },
    [onAnimate],
  );

  return {onChange: handleChange, onAnimate: handleAnimate};
};
