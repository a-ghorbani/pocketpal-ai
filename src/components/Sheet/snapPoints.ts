import type {BottomSheetModalProps} from '@gorhom/bottom-sheet';

const FULL_HEIGHT_TOP_GAP = 16;

export const fullHeightSnapPoint = (
  containerHeight: number,
  insetsTop: number,
) => containerHeight - insetsTop - FULL_HEIGHT_TOP_GAP;

export const resolveSnapPoints = (
  snapPoints: BottomSheetModalProps['snapPoints'],
  containerHeight: number,
  insetsTop: number,
): BottomSheetModalProps['snapPoints'] => {
  if (!Array.isArray(snapPoints)) {
    return snapPoints;
  }
  const maxHeight = fullHeightSnapPoint(containerHeight, insetsTop);
  return snapPoints.map(point =>
    typeof point === 'string'
      ? Math.min(
          (Number(point.split('%')[0]) * containerHeight) / 100,
          maxHeight,
        )
      : point,
  );
};
