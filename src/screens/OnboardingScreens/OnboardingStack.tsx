import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import {ROUTES} from '../../utils/navigationConstants';
import {SplashScreen} from './SplashScreen';
import {Onboarding1Screen} from './Onboarding1Screen';
import {Onboarding2Screen} from './Onboarding2Screen';
import {Onboarding3Screen} from './Onboarding3Screen';
import {Onboarding4Screen} from './Onboarding4Screen';
import {Onboarding5Screen} from './Onboarding5Screen';
import {Onboarding6Screen} from './Onboarding6Screen';

const Stack = createStackNavigator();

export const OnboardingStack: React.FC = () => (
  <Stack.Navigator
    screenOptions={{headerShown: false, gestureEnabled: false}}
    initialRouteName={ROUTES.ONBOARDING.SPLASH}>
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
);
