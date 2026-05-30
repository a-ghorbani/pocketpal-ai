import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {ArrowRightGlyph} from '../../../assets/onboarding/illustrations';
import {ChevronLeftLgIcon, DownloadIcon} from '../../../assets/icons';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';

export type OnboardingBottomBarProps = {
  /** Visible label on the primary button. */
  primaryLabel: string;
  /** Trailing glyph appended to the primary label. Default: arrow. */
  primaryGlyph?: 'arrow-right' | 'download';
  /** Glyph position: 'leading' (left of label) or 'trailing' (right). */
  primaryGlyphPosition?: 'leading' | 'trailing';
  primaryDisabled?: boolean;
  onPrimary: () => void;
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

const createStyles = (theme: Theme, elevated: boolean) =>
  StyleSheet.create({
    wrapper: {
      paddingTop: theme.spacing.s,
      paddingHorizontal: theme.spacing.m,
      gap: theme.spacing.sm,
      backgroundColor: elevated ? theme.colors.background : 'transparent',
      borderTopLeftRadius: elevated ? theme.radius.l : 0,
      borderTopRightRadius: elevated ? theme.radius.l : 0,
      // Elevation/shadow only when floating over screen 6 content.
      ...(elevated
        ? {
            shadowColor: theme.colors.shadow,
            shadowOffset: {width: 0, height: 2},
            shadowOpacity: 0.08,
            shadowRadius: 4,
            elevation: 4,
          }
        : {}),
    },
    row: {
      flexDirection: 'row',
      gap: theme.spacing.s,
    },
    backBtn: {
      // Figma 888:33641: 48×48, radius ml=16, bg Color/Secondary/Default
      // (#f3f2f2), border 0.5 Color/Border/Light-grey (#e5e3e1).
      width: 48,
      height: 48,
      borderRadius: theme.radius.ml,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.mutedLight,
      backgroundColor: theme.colors.secondaryDefault,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtn: {
      // Figma I888:33571: dark pill, radius ml=16, height 48,
      // padding m/sm, gap xs. We approximate the Figma vertical
      // gradient (from #2a2928 to #0e0d0c) with a solid
      // `colors.primary` (#181715 light) since RN doesn't ship a
      // gradient primitive in our DS layer.
      flex: 1,
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.ml,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outline,
      backgroundColor: theme.colors.onBackground,
    },
    primaryBtnDisabled: {
      backgroundColor: theme.colors.surfaceContainerLow,
      borderColor: theme.colors.outline,
    },
    primaryLabel: {
      ...theme.typography.titleS,
      color: theme.colors.background,
    },
    primaryLabelDisabled: {
      color: theme.colors.onSurfaceVariant,
    },
    // Figma `I888:33571;746:26871`: trailing icon container is 20×20;
    // the glyph itself sits inset ~17.84% on all sides. Centering a
    // 13×13 glyph inside a 20×20 box reproduces the breathing room.
    glyphBox: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

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
      </View>
    </View>
  );
};
