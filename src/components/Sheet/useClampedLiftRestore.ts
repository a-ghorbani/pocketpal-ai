import {RefObject, useCallback, useEffect, useRef} from 'react';
import {Keyboard} from 'react-native';
import type {BottomSheetModalProps} from '@gorhom/bottom-sheet';
import type {BottomSheetModalMethods} from '@gorhom/bottom-sheet/lib/typescript/types';

type SnapPoints = BottomSheetModalProps['snapPoints'];
type OnChange = NonNullable<BottomSheetModalProps['onChange']>;

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
// detent and leaves the sheet lifted. Snap back once gorhom has seen the hide.
export const useClampedLiftRestore = (
  sheetRef: RefObject<BottomSheetModalMethods | null>,
  snapPoints: SnapPoints,
  onChange?: OnChange,
): OnChange => {
  const currentIndex = useRef(-1);
  const snapPointsRef = useRef(snapPoints);
  snapPointsRef.current = snapPoints;

  useEffect(() => {
    let frame: number | null = null;
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      const highestIndex = detentCount(snapPointsRef.current) - 1;
      if (currentIndex.current > highestIndex) {
        frame = requestAnimationFrame(() =>
          sheetRef.current?.snapToIndex(highestIndex),
        );
      }
    });
    return () => {
      subscription.remove();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, [sheetRef]);

  return useCallback<OnChange>(
    (index, position, type) => {
      currentIndex.current = index;
      onChange?.(index, position, type);
    },
    [onChange],
  );
};
