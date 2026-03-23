import {Text, View} from 'react-native';
import React from 'react';

import {useTheme} from '../../hooks';

import {styles} from './styles';
import {CircularActivityIndicator} from '../CircularActivityIndicator';

type LoadingBubbleProps = {
  label: string;
  progress?: number | null;
};

export const LoadingBubble: React.FC<LoadingBubbleProps> = ({
  label,
  progress,
}) => {
  const theme = useTheme();
  const progressValue =
    typeof progress === 'number'
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : null;

  return (
    <View
      style={[
        styles.container,
        {backgroundColor: theme.colors.surfaceVariant},
      ]}>
      <CircularActivityIndicator color={theme.colors.primary} size={16} />
      <Text style={[styles.text, {color: theme.colors.onSurfaceVariant}]}>
        {label}
        ...
        {progressValue !== null ? ` ${progressValue}%` : ''}
      </Text>
    </View>
  );
};
