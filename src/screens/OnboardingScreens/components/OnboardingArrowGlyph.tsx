import React from 'react';
import {StyleSheet, Text} from 'react-native';

import {useTheme} from '../../../hooks';

export type OnboardingArrowGlyphProps = {
  /** Glyph to render — defaults to a right arrow. */
  glyph?: '→' | '↓';
};

const styles = StyleSheet.create({
  base: {marginLeft: 6},
});

/**
 * Trailing arrow text glyph appended to the bottom-bar CTA labels —
 * `→` for forward steps, `↓` for screen 6 download. Token-bound color.
 */
export const OnboardingArrowGlyph: React.FC<OnboardingArrowGlyphProps> = ({
  glyph = '→',
}) => {
  const theme = useTheme();
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.base, {color: theme.colors.onPrimary}]}>
      {glyph}
    </Text>
  );
};
