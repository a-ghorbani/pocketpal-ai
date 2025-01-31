import React, {useRef} from 'react';
import {Modal, Pressable, Text, View} from 'react-native';
import {useTheme} from '../../hooks/useTheme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {getStyles} from './styles';

interface MessageSelectionViewProps {
  visible: boolean;
  onClose: () => void;
  content: string;
  onTextSelected: (selectedText: string) => void;
}

export const MessageSelectionView: React.FC<MessageSelectionViewProps> = ({
  visible,
  onClose,
  content,
  onTextSelected,
}) => {
  const theme = useTheme();
  const textRef = useRef<Text>(null);
  const styles = getStyles(theme);

  const handleTextSelection = (event: any) => {
    const { selection } = event.nativeEvent;
    if (selection && selection.start !== selection.end) {
      const selectedText = content.substring(selection.start, selection.end);
      onTextSelected(selectedText);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.headerContainer}>
          <Pressable onPress={onClose}>
            {({ pressed }) => (
              <Icon
                name="window-close"
                size={24}
                color={pressed ? theme.colors.surfaceVariant : theme.colors.text}
              />
            )}
          </Pressable>
          <Text style={styles.headerText}>
            Select Text
          </Text>
      </View>

      <Text
        ref={textRef}
        selectable
        selectionColor={theme.colors.surfaceVariant}
        onTextLayout={handleTextSelection}
        style={styles.contentText}
      >
        {content}
      </Text>
      </View>
    </Modal>
  );
};
