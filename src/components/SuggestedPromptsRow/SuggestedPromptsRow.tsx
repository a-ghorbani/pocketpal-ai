import React, {useMemo} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

interface SuggestedPromptsRowProps {
  prompts: string[];
  /**
   * Invoked when the user taps a chip. Consumer is responsible for sending
   * the prompt (auto-send, per Pal spec UX). The prompt string is passed
   * verbatim as typed by the Pal author.
   */
  onSelect: (prompt: string) => void;
  /**
   * When true, chips render dimmed and taps are ignored. Use when no model
   * is loaded — matches the send-button disabled behavior.
   */
  disabled?: boolean;
}

export const SuggestedPromptsRow: React.FC<SuggestedPromptsRowProps> = ({
  prompts,
  onSelect,
  disabled = false,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!prompts || prompts.length === 0) {
    return null;
  }

  return (
    <View testID="suggested-prompts-row">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {prompts.map((prompt, idx) => (
          <Pressable
            key={`${idx}-${prompt.slice(0, 16)}`}
            onPress={() => onSelect(prompt)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{disabled}}
            accessibilityLabel={`Use prompt: ${prompt}`}
            testID={`suggested-prompt-chip-${idx}`}
            style={({pressed}) => [
              styles.chip,
              pressed && !disabled ? styles.chipPressed : null,
              disabled ? styles.chipDisabled : null,
            ]}>
            <Text style={styles.chipText} numberOfLines={2}>
              {prompt}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};
