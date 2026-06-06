import React from 'react';
import {Pressable, Text, View} from 'react-native';

import {ArrowRightGlyph} from '../../../../assets/onboarding/illustrations';
import {ChevronLeftLgIcon, DownloadIcon} from '../../../../assets/icons';
import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

export type OnboardingBottomBarProps = {
  /** Visible label on the primary button. Omit for back-only bars. */
  primaryLabel?: string;
  /** Trailing glyph appended to the primary label. Default: arrow. */
  primaryGlyph?: 'arrow-right' | 'download';
  /** Glyph position: 'leading' (left of label) or 'trailing' (right). */
  primaryGlyphPosition?: 'leading' | 'trailing';
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  showBack?: boolean;
  onBack?: () => void;
  backAccessibilityLabel: string;
  /**
   * If true, render an opaque rounded-top elevated card matching
   * Figma `887:30028` (used by screen 6). Default false — the bar
   * sits flush against the canvas.
   */
  elevated?: boolean;
};

export const OnboardingBottomBar: React.FC<OnboardingBottomBarProps> = ({
  primaryLabel,
  primaryGlyph = 'arrow-right',
  primaryGlyphPosition = 'trailing',
  primaryDisabled,
  onPrimary,
  showBack = true,
  onBack,
  backAccessibilityLabel,
  elevated = false,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme, elevated);
  const glyphColor = primaryDisabled
    ? theme.colors.onSurfaceVariant
    : theme.colors.background;
  const glyph =
    primaryGlyph === 'download' ? (
      <DownloadIcon width={20} height={20} stroke={glyphColor} />
    ) : (
      <View style={styles.glyphBox}>
        <ArrowRightGlyph width={13} height={13} fill={glyphColor} />
      </View>
    );
  const hasPrimary = primaryLabel !== undefined && onPrimary !== undefined;
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            testID="onboarding-back"
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            onPress={onBack}
            style={styles.backBtn}>
            {/* Figma `746:26300` chevron-left lg variant — native
                viewBox 6.5×11.5. Fill baked into the SVG export
                (#181715, matches `onBackground` in light). */}
            <ChevronLeftLgIcon width={6.5} height={11.5} />
          </Pressable>
        ) : null}
        {hasPrimary ? (
          <Pressable
            testID="onboarding-primary"
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            disabled={primaryDisabled}
            onPress={onPrimary}
            style={[
              styles.primaryBtn,
              primaryDisabled ? styles.primaryBtnDisabled : null,
            ]}>
            {primaryGlyphPosition === 'leading' ? glyph : null}
            <Text
              style={[
                styles.primaryLabel,
                primaryDisabled ? styles.primaryLabelDisabled : null,
              ]}>
              {primaryLabel}
            </Text>
            {primaryGlyphPosition === 'trailing' ? glyph : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};
