import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import React, {useMemo} from 'react';
import {useTheme} from 'react-native-paper';
// import {Extrapolation, interpolate} from 'react-native-reanimated';
// import {useAnimatedStyle} from 'react-native-reanimated';

export const CustomBackdrop = ({
  animatedIndex,
  animatedPosition,
  style,
}: BottomSheetBackdropProps) => {
  const theme = useTheme();

  // const containerAnimatedStyle = useAnimatedStyle(() => ({
  //   opacity: interpolate(
  //     animatedIndex.value,
  //     [-1, 0],
  //     [0, 1],
  //     Extrapolation.CLAMP,
  //   ),
  // }));

  const containerStyle = useMemo(
    () => [
      style,
      {
        backgroundColor: theme.colors.backdrop,
      },
      // containerAnimatedStyle,
    ],
    [style, theme.colors.backdrop],
  );

  return (
    <BottomSheetBackdrop
      animatedIndex={animatedIndex}
      animatedPosition={animatedPosition}
      disappearsOnIndex={-1}
      style={containerStyle}
    />
  );
};
