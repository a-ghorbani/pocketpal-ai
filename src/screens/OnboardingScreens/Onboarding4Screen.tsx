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
      alignItems: 'center',
      justifyContent: 'center',
    },
    image: {
      width: 170,
      height: 286,
    },
  });

export const Onboarding4Screen: React.FC = observer(() => {
  const {l10n, next, goBack, skip} = useOnboardingHandlers(4);
  const theme = useTheme();
  const styles = createStyles(theme);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={4}
      showStepper
      topRight={<OnboardingSkipButton label={t.skip} onPress={skip} />}
      illustration={
        <View style={styles.illustration}>
          <Image
            source={onboardingIllustrations.screen4Shield}
            style={styles.image}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      }
      title={
        <ItalicAccentTitle
          title={t.screen4.title}
          accent={t.screen4.titleAccent}
        />
      }
      body={
        <HighlightText body={t.screen4.body} phrases={[t.screen4.highlight]} />
      }
      bottomBar={
        <OnboardingBottomBar
          primaryLabel={t.screen4.cta}
          primaryTrailing={<OnboardingArrowGlyph />}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
