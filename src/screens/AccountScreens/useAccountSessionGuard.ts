import {useEffect} from 'react';

import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import {authService} from '../../services';

import {RootStackParamList} from '../../utils/types';

/**
 * Callers must be `observer`s: the render-time read below is what makes a
 * later flip of `isAuthenticated` reach the effect at all.
 */
export const useAccountSessionGuard = (expectedAuthenticated: boolean) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const isAuthenticated = authService.isAuthenticated;

  useEffect(() => {
    if (isAuthenticated !== expectedAuthenticated) {
      navigation.popToTop();
    }
  }, [isAuthenticated, expectedAuthenticated, navigation]);
};
