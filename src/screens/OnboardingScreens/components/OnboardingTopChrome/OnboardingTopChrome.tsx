import React, {useCallback, useContext} from 'react';
import {View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {observer} from 'mobx-react';

import {Stepper} from '../../../../components/ui';
import {useTheme} from '../../../../hooks';
import {uiStore} from '../../../../store';
import {L10nContext} from '../../../../utils';
import {OnboardingSkipButton} from '../OnboardingSkipButton';
import {createStyles} from './styles';

export type OnboardingChromeStep =
  | 'splash'
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | null;

/**
 * Persistent onboarding top chrome — Stepper + top-right action — rendered
 * once at the OnboardingStack level, overlaid above the navigator. Driven
 * by the active route name (mapped to a step) so the chrome stays put
 * while the screen body slides in/out underneath.
 *
 * Per-step contract:
 *   - splash / unknown → hidden
 *   - 1..4             → Stepper(current=N) + Skip
 *   - 5                → no Stepper + Skip (matches the topic-pick screens)
 *   - 6                → no Stepper + "Skip for now" (telegraphs that the
 *                        deferred action is downloading, not browsing copy)
 */
export const OnboardingTopChrome: React.FC<{step: OnboardingChromeStep}> =
  observer(({step}) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const styles = createStyles(theme, insets.top);
    const navigation = useNavigation<any>();
    const l10n = useContext(L10nContext);
    const t = l10n.onboarding;

    const onSkip = useCallback(() => {
      uiStore.completeOnboarding({
        topic: uiStore.onboardingState.selectedTopic,
        modelId: null,
      });
    }, []);

    if (step === null || step === 'splash') {
      return null;
    }

    const showStepper = step >= 1 && step <= 4;
    let topRight: React.ReactNode = null;
    if (step >= 1 && step <= 5) {
      topRight = <OnboardingSkipButton label={t.skip} onPress={onSkip} />;
    } else if (step === 6) {
      topRight = (
        <OnboardingSkipButton label={t.skipForNow} onPress={onSkip} />
      );
    }

    return (
      <View pointerEvents="box-none" style={styles.root}>
        <View pointerEvents="box-none" style={styles.band}>
          {showStepper ? (
            <View pointerEvents="none" style={styles.stepperSlot}>
              <Stepper
                total={4}
                current={step as number}
                style={styles.stepperOverride}
              />
            </View>
          ) : null}
          {topRight ? <View style={styles.topRightSlot}>{topRight}</View> : null}
        </View>
      </View>
    );
  });

/** Map a React Navigation route name to a chrome step. */
export const chromeStepFromRouteName = (
  name: string | undefined,
  routes: {
    SPLASH: string;
    STEP_1: string;
    STEP_2: string;
    STEP_3: string;
    STEP_4: string;
    STEP_5: string;
    STEP_6: string;
  },
): OnboardingChromeStep => {
  switch (name) {
    case routes.SPLASH:
      return 'splash';
    case routes.STEP_1:
      return 1;
    case routes.STEP_2:
      return 2;
    case routes.STEP_3:
      return 3;
    case routes.STEP_4:
      return 4;
    case routes.STEP_5:
      return 5;
    case routes.STEP_6:
      return 6;
    default:
      return null;
  }
};
