import React from 'react';
import {TouchableOpacity} from 'react-native';
import {StackNavigationProp} from '@react-navigation/stack';
import {useNavigation} from '@react-navigation/native';

import {styles} from './styles';
import {ArrowLeftMdIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';
import type {RootStackParamList} from '../../utils/types';

export const HeaderLeft: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  return (
    <TouchableOpacity
      style={[styles.menuIcon]}
      testID="back-button"
      accessibilityLabel="Go back"
      onPress={() => navigation.goBack()}>
      <ArrowLeftMdIcon stroke={theme.colors.foregroundPrimary} />
    </TouchableOpacity>
  );
};
