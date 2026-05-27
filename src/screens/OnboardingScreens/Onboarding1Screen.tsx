import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {onboardingIllustrationPlaceholders} from '../../assets/onboarding/placeholders';
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
    placeholder: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
    },
    illustration: {
      paddingVertical: theme.spacing.l,
      alignItems: 'center',
      justifyContent: 'center',
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
          <Text style={styles.placeholder}>
            {onboardingIllustrationPlaceholders.screen1Hero}
          </Text>
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
