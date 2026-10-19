import React from 'react';
import {StyleSheet, View} from 'react-native';
import {BottomSheetBackgroundProps} from '@gorhom/bottom-sheet';

export const SheetBackground = ({style}: BottomSheetBackgroundProps) => (
  <View
    accessible
    accessibilityRole="adjustable"
    accessibilityLabel="Bottom Sheet"
    style={[styles.background, style]}
  />
);

const styles = StyleSheet.create({
  background: {
    backgroundColor: 'white',
    borderRadius: 15,
  },
});
