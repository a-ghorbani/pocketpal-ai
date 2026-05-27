import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {onboardingIllustrations} from '../../assets/onboarding/illustrations';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {OnboardingSkipButton} from './components/OnboardingSkipButton';
import {OnboardingArrowGlyph} from './components/OnboardingArrowGlyph';
import {ItalicAccentTitle} from './components/ItalicAccentTitle';
import {useOnboardingHandlers} from './useOnboardingHandlers';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    body: {
      ...theme.typography.bodyM,
      color: theme.colors.textSecondary,
    },
    illustration: {
      paddingVertical: theme.spacing.l,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hero: {
      width: 112,
      height: 112,
    },
  });

export const Onboarding1Screen: React.FC = observer(() => {
  const {l10n, next, skip} = useOnboardingHandlers(1);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={1}
      showStepper
      topRight={<OnboardingSkipButton label={t.skip} onPress={skip} />}
      illustration={
        <View style={styles.illustration}>
          <Image
            source={onboardingIllustrations.splashMark}
            style={styles.hero}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel={t.screen1.titleAccent ?? ''}
          />
        </View>
      }
      title={
        <ItalicAccentTitle
          title={t.screen1.title}
          accent={t.screen1.titleAccent}
        />
      }
      body={<Text style={styles.body}>{t.screen1.body}</Text>}
      bottomBar={
        <OnboardingBottomBar
          primaryLabel={t.screen1.cta}
          primaryTrailing={<OnboardingArrowGlyph />}
          onPrimary={next}
          showBack={false}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
