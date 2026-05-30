import React, {useState} from 'react';
import {View} from 'react-native';
import {createStackNavigator} from '@react-navigation/stack';

import {ROUTES} from '../../utils/navigationConstants';
import {SplashScreen} from './SplashScreen';
import {Onboarding1Screen} from './Onboarding1Screen';
import {Onboarding2Screen} from './Onboarding2Screen';
import {Onboarding3Screen} from './Onboarding3Screen';
import {Onboarding4Screen} from './Onboarding4Screen';
import {Onboarding5Screen} from './Onboarding5Screen';
import {Onboarding6Screen} from './Onboarding6Screen';
import {
  OnboardingTopChrome,
  chromeStepFromRouteName,
  type OnboardingChromeStep,
} from './components/OnboardingTopChrome';

const Stack = createStackNavigator();

/**
 * Onboarding navigator with persistent top chrome (Stepper + Skip/Audio).
 * The chrome is rendered once and overlaid above the navigator, so it
 * stays anchored while screen bodies slide in/out underneath. Chrome
 * contents derive from the active route via screenListeners.
 */
export const OnboardingStack: React.FC = () => {
  const [chromeStep, setChromeStep] = useState<OnboardingChromeStep>('splash');
  return (
    <View style={{flex: 1}}>
      <Stack.Navigator
        screenOptions={{headerShown: false, gestureEnabled: false}}
        initialRouteName={ROUTES.ONBOARDING.SPLASH}
        screenListeners={{
          state: e => {
            const state = e.data?.state as
              | {index?: number; routes?: {name?: string}[]}
              | undefined;
            const active =
              state?.routes && typeof state.index === 'number'
                ? state.routes[state.index]?.name
                : undefined;
            setChromeStep(chromeStepFromRouteName(active, ROUTES.ONBOARDING));
          },
        }}>
        <Stack.Screen name={ROUTES.ONBOARDING.SPLASH} component={SplashScreen} />
        <Stack.Screen
          name={ROUTES.ONBOARDING.STEP_1}
          component={Onboarding1Screen}
        />
        <Stack.Screen
          name={ROUTES.ONBOARDING.STEP_2}
          component={Onboarding2Screen}
        />
        <Stack.Screen
          name={ROUTES.ONBOARDING.STEP_3}
          component={Onboarding3Screen}
        />
        <Stack.Screen
          name={ROUTES.ONBOARDING.STEP_4}
          component={Onboarding4Screen}
        />
        <Stack.Screen
          name={ROUTES.ONBOARDING.STEP_5}
          component={Onboarding5Screen}
        />
        <Stack.Screen
          name={ROUTES.ONBOARDING.STEP_6}
          component={Onboarding6Screen}
        />
      </Stack.Navigator>
      <OnboardingTopChrome step={chromeStep} />
    </View>
  );
};
