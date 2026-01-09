import React from 'react';
import {TouchableOpacity} from 'react-native';
import {DrawerNavigationProp} from '@react-navigation/drawer';
import {useNavigation} from '@react-navigation/native';

import {styles} from './styles';
import {MenuIcon} from '../../assets/icons';
import {useTheme} from '../../hooks';

export const HeaderLeft: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<DrawerNavigationProp<any>>();

  return (
    <TouchableOpacity
      style={[styles.menuIcon]}
      testID="menu-button"
      accessibilityLabel="Open drawer"
      onPress={() => navigation.openDrawer()}>
      <MenuIcon stroke={theme.colors.primary} />
    </TouchableOpacity>
  );
};
