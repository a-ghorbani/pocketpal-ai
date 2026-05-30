import React, {useCallback, useContext} from 'react';
import {StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {observer} from 'mobx-react';

import {Stepper} from '../../../components/ui';
import {useTheme} from '../../../hooks';
import type {Theme} from '../../../utils/types';
import {uiStore} from '../../../store';
import {L10nContext} from '../../../utils';
import {OnboardingSkipButton} from './OnboardingSkipButton';
import {OnboardingAudioButton} from './OnboardingAudioButton';

export type OnboardingChromeStep =
  | 'splash'
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | null;

const createStyles = (theme: Theme, topInset: number) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    band: {
      height: topInset + 60,
      position: 'relative',
    },
    // Stepper sits 30pt below the safe-area inset, horizontally centered
    // on the screen frame. Slot is non-interactive so taps fall through
    // to whatever sits underneath in that band.
    stepperSlot: {
      position: 'absolute',
      top: topInset + 30,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    stepperOverride: {
      alignSelf: 'center',
    },
    topRightSlot: {
      position: 'absolute',
      top: topInset + 16,
      right: 16,
    },
  });

/**
 * Persistent onboarding top chrome — Stepper + top-right action — rendered
 * once at the OnboardingStack level, overlaid above the navigator. Driven
 * by the active route name (mapped to a step) so the chrome stays put
 * while the screen body slides in/out underneath.
 *
 * Per-step contract:
 *   - splash / unknown → hidden
 *   - 1..4             → Stepper(current=N) + Skip
 *   - 5                → no Stepper + Audio(screen5 text)
 *   - 6                → no Stepper + Audio(screen6 text)
 *
 * Screen-5's in-header Back chevron is NOT part of chrome — it stays
 * per-screen since it only appears on one screen.
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
    if (step >= 1 && step <= 4) {
      topRight = <OnboardingSkipButton label={t.skip} onPress={onSkip} />;
    } else if (step === 5) {
      topRight = (
        <OnboardingAudioButton
          titleText={t.screen5.title}
          bodyText={t.screen5.body}
          accessibilityLabel={t.audio}
        />
      );
    } else if (step === 6) {
      topRight = (
        <OnboardingAudioButton
          titleText={t.screen6.title}
          bodyText={t.screen6.body}
          accessibilityLabel={t.audio}
        />
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
