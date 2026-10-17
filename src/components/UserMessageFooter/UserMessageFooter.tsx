import React from 'react';
import {GestureResponderEvent, View} from 'react-native';

import {MessageMenuButton} from '../MessageMenuButton';

import {styles} from './styles';

interface UserMessageFooterProps {
  onMenuPress?: (event: GestureResponderEvent) => void;
}

export const UserMessageFooter: React.FC<UserMessageFooterProps> = ({
  onMenuPress,
}) => (
  <View style={styles.container} testID="user-row-footer">
    <MessageMenuButton onPress={onMenuPress} />
  </View>
);
