import React from 'react';
import {Image} from 'react-native';
import {observer} from 'mobx-react';

import {OnboardingScaffold} from '../components/OnboardingScaffold';
import {OnboardingBottomBar} from '../components/OnboardingBottomBar';
import {OnboardingContent} from '../components/OnboardingContent';
import {ItalicAccentTitle} from '../components/ItalicAccentTitle';
import {HighlightText} from '../components/HighlightText';
import {useOnboardingHandlers} from '../useOnboardingHandlers';
import {styles} from './styles';

// Screen 3 "Cads" composition is a flat illustration in Figma
// (`989:167380`). The asset was re-exported at 1572×925 (~4× density
// of the natural 369×217 layout slot).

const cadsImage = require('../../../assets/onboarding/screen-3-cards.png');

export const Onboarding3Screen: React.FC = observer(() => {
  const {l10n, next, goBack} = useOnboardingHandlers(3);
  const t = l10n.onboarding;
  return (
    <OnboardingScaffold
      step={3}
      illustration={
        <Image
          source={cadsImage}
          style={styles.cards}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      }
      content={
        <OnboardingContent
          eyebrow={t.screen3.eyebrow}
          title={
            <ItalicAccentTitle
              title={t.screen3.title}
              accent={t.screen3.titleAccent}
            />
          }
          body={
            <HighlightText
              body={t.screen3.body}
              phrases={[t.screen3.highlight]}
            />
          }
        />
      }
      bottomBar={
        <OnboardingBottomBar
          primaryLabel={t.screen3.cta}
          onPrimary={next}
          onBack={goBack}
          backAccessibilityLabel={t.back}
        />
      }
    />
  );
});
