import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {createStyles} from './styles';
import {useTheme} from '../../hooks';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

interface CodeBlockHeaderProps {
  language: string;
  content: string;
}

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const CodeBlockHeader: React.FC<CodeBlockHeaderProps> = ({
  language,
  content,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const handleCopy = () => {
    ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
    Clipboard.setString(content.trim());
  };

  return (
    <View style={styles.codeHeader}>
      <Text style={styles.codeLanguage} numberOfLines={1} ellipsizeMode="tail">
        {language}
      </Text>
      <TouchableOpacity onPress={handleCopy}>
        <Icon name="content-copy" style={styles.iconContainer} />
      </TouchableOpacity>
    </View>
  );
};
