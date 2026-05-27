import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {
  ArrowRightGlyph,
  ChevronLeftGlyph,
} from '../../../assets/onboarding/illustrations';
import {DownloadIcon} from '../../../assets/icons';
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
      // Figma 888:33641: 48×48, radius ml=16, bg secondary/default,
      // border 0.5 light-grey.
      width: 48,
      height: 48,
      borderRadius: theme.radius.ml,
      borderWidth: theme.stroke.sm,
      borderColor: theme.colors.outlineVariant,
      backgroundColor: theme.colors.secondaryContainer,
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
      <ArrowRightGlyph width={13} height={13} fill={glyphColor} />
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
            <ChevronLeftGlyph
              width={12}
              height={20}
              fill={theme.colors.onBackground}
            />
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
