import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {observer} from 'mobx-react';

import {useTheme} from '../../hooks';
import type {Theme} from '../../utils/types';
import {onboardingIllustrations} from '../../assets/onboarding/illustrations';
import {OnboardingScaffold} from './components/OnboardingScaffold';
import {OnboardingBottomBar} from './components/OnboardingBottomBar';
import {OnboardingSkipButton} from './components/OnboardingSkipButton';
import {OnboardingArrowGlyph} from './components/OnboardingArrowGlyph';
import {ItalicAccentTitle} from './components/ItalicAccentTitle';
import {HighlightText} from './components/HighlightText';
import {useOnboardingHandlers} from './useOnboardingHandlers';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    illustration: {
      paddingVertical: theme.spacing.l,
      paddingHorizontal: theme.spacing.l,
      width: '100%',
      alignItems: 'center',
    },
    cards: {
      width: '100%',
      aspectRatio: 369 / 217,
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
          <Image
            source={onboardingIllustrations.screen3Cards}
            style={styles.cards}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no"
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
