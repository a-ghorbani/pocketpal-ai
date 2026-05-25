import React, {useContext} from 'react';
import {View} from 'react-native';
import {Button, IconButton, Text} from 'react-native-paper';
import {useFormContext, Controller} from 'react-hook-form';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {TextInput} from '../../TextInput';
import {SectionDivider} from '../SectionDivider';
import type {PalFormData} from '../types';

import {createStyles} from './styles';

export const GreetingSection = () => {
  const {control} = useFormContext<PalFormData>();
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  const labels = l10n.components.palSheet.greeting;

  return (
    <View testID="greeting-section" style={styles.container}>
      <SectionDivider label={labels.sectionLabel} />

      <View style={styles.field}>
        <Text style={styles.label}>{labels.textLabel}</Text>
        <Controller
          control={control}
          name="greetingText"
          render={({field: {onChange, value}}) => (
            <TextInput
              testID="form-field-greetingText"
              value={typeof value === 'string' ? value : ''}
              onChangeText={onChange}
              placeholder={labels.textPlaceholder}
              multiline
              numberOfLines={3}
            />
          )}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{labels.suggestedPromptsLabel}</Text>
        <Controller
          control={control}
          name="suggestedPrompts"
          render={({field: {onChange, value}}) => {
            const prompts = value ?? [];
            return (
              <View>
                <View style={styles.promptList}>
                  {prompts.map((prompt, idx) => (
                    <View key={idx} style={styles.promptRow}>
                      <View style={styles.promptInput}>
                        <TextInput
                          testID={`suggested-prompt-input-${idx}`}
                          value={typeof prompt === 'string' ? prompt : ''}
                          onChangeText={text =>
                            onChange([
                              ...prompts.slice(0, idx),
                              text,
                              ...prompts.slice(idx + 1),
                            ])
                          }
                          placeholder={labels.promptPlaceholder}
                        />
                      </View>
                      <IconButton
                        testID={`suggested-prompt-remove-${idx}`}
                        icon="close"
                        size={20}
                        accessibilityLabel={labels.removePromptLabel}
                        onPress={() =>
                          onChange(prompts.filter((_, i) => i !== idx))
                        }
                      />
                    </View>
                  ))}
                </View>
                <Button
                  testID="suggested-prompt-add-button"
                  mode="contained-tonal"
                  style={styles.addButton}
                  onPress={() => onChange([...prompts, ''])}>
                  {`+  ${labels.addPromptButton}`}
                </Button>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
};
