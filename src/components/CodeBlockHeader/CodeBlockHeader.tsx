import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';

import Clipboard from '@react-native-clipboard/clipboard';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import {IconButton} from 'react-native-paper';

import {CopyIcon} from '../../assets/icons';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

interface CodeBlockHeaderProps {
  language: string;
  content: string;
  wrapLines?: boolean;
  onToggleWrapLines?: () => void;
}

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const CodeBlockHeader: React.FC<CodeBlockHeaderProps> = ({
  language,
  content,
  wrapLines,
  onToggleWrapLines,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const handleCopy = () => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(content);
  };

  return (
    <View style={styles.codeHeader}>
      <Text style={styles.codeLanguage} numberOfLines={1} ellipsizeMode="tail">
        {language}
      </Text>
      <View style={styles.actionsContainer}>
        {onToggleWrapLines && (
          <IconButton
            accessibilityLabel={wrapLines ? 'Disable line wrap' : 'Wrap lines'}
            icon={
              wrapLines
                ? 'format-text-wrapping-overflow'
                : 'format-text-wrapping-wrap'
            }
            iconColor={theme.colors.onSurfaceVariant}
            size={18}
            onPress={onToggleWrapLines}
            style={styles.iconButton}
          />
        )}
        <TouchableOpacity
          accessibilityLabel="Copy code block"
          onPress={handleCopy}
          style={styles.iconTouchable}>
          <CopyIcon
            width={16}
            height={16}
            stroke={theme.colors.onSurfaceVariant}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};
