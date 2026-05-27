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
import {HighlightText} from './components/HighlightText';
import {ComparisonCards} from './components/ComparisonCards';
import {useOnboardingHandlers} from './useOnboardingHandlers';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    placeholder: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
    },
    illustration: {
      paddingVertical: theme.spacing.l,
      paddingHorizontal: theme.spacing.l,
      width: '100%',
    },
    cardVisual: {
      ...theme.typography.captionS,
      color: theme.colors.onSurfaceVariant,
      textAlign: 'center',
    },
  });

export const Onboarding3Screen: React.FC = observer(() => {
  const {l10n, next, goBack, skip} = useOnboardingHandlers(3);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={3}
      showStepper
      topRight={<OnboardingSkipButton label={t.skip} onPress={skip} />}
      illustration={
        <View style={styles.illustration}>
          <ComparisonCards
            leftLabel={t.screen3.leftLabel}
            rightLabel={t.screen3.rightLabel}
            vsLabel={t.screen3.vs}
            leftVisual={
              <Text style={styles.cardVisual}>
                {onboardingIllustrationPlaceholders.screen3PhoneCard}
              </Text>
            }
            rightVisual={
              <Text style={styles.cardVisual}>
                {onboardingIllustrationPlaceholders.screen3CloudCard}
              </Text>
            }
          />
        </View>
      }
      title={
        <ItalicAccentTitle
          title={t.screen3.title}
          accent={t.screen3.titleAccent}
        />
      }
      body={
        <HighlightText body={t.screen3.body} phrases={[t.screen3.highlight]} />
      }
      bottomBar={
        <OnboardingBottomBar
          primaryLabel={t.screen3.cta}
          primaryTrailing={<OnboardingArrowGlyph />}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
