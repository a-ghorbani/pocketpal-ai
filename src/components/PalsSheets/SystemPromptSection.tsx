import React, {useContext, useState, useMemo} from 'react';
import {View} from 'react-native';
import {Button, Text, IconButton} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {Controller, useFormContext} from 'react-hook-form';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {FormField} from './FormField';
import {SectionDivider} from './SectionDivider';
import type {PalFormData} from './types';
import {Checkbox} from '../Checkbox';
import {ModelSelector} from './ModelSelector';
import {useStructuredOutput} from '../../hooks/useStructuredOutput';
import {modelStore} from '../../store';
import {generateFinalSystemPrompt} from '../../utils/palshub-template-parser';

import {ModelNotAvailable} from './ModelNotAvailable';
import {L10nContext} from '../../utils';
import type {ParameterDefinition} from '../../types/pal';

interface SystemPromptSectionProps {
  hideGeneratingPrompt?: boolean;
  validateFields?: () => Promise<boolean>;
  closeSheet: () => void;
  parameterSchema?: ParameterDefinition[];
}

export const SystemPromptSection = observer(
  ({
    hideGeneratingPrompt,
    validateFields,
    closeSheet,
    parameterSchema = [],
  }: SystemPromptSectionProps) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const {watch, control, getValues, setValue, clearErrors} =
      useFormContext<PalFormData>();
    const useAIPrompt = watch('useAIPrompt');
    const promptGenerationModel = watch('promptGenerationModel');
    const isLoadingModel = modelStore.isContextLoading;

    const {generate, isGenerating, stop} = useStructuredOutput();

    // Smart display mode state
    const [showTemplateMode, setShowTemplateMode] = useState(false);

    // Check if this is a templated pal
    const systemPrompt = watch('systemPrompt');
    const originalSystemPrompt = watch('originalSystemPrompt');
    // Since systemPrompt might have changed by the user,
    // we need to check first if originalSystemPrompt contains the template.
    // This is relavant for rendering reset buttons.
    const isTemplatedPal = useMemo(() => {
      return (
        parameterSchema.length > 0 &&
        /\{\{[^}]+\}\}/.test(originalSystemPrompt || systemPrompt || '')
      );
    }, [originalSystemPrompt, parameterSchema.length, systemPrompt]);

    // Watch all form values to trigger re-renders when parameters change
    const allFormValues = watch();

    // Collect parameter values for rendering
    const parameters = useMemo(() => {
      const params: Record<string, any> = {};
      parameterSchema.forEach(param => {
        const value = allFormValues[param.key];
        if (value !== undefined) {
          params[param.key] = value;
        }
      });
      return params;
    }, [parameterSchema, allFormValues]);

    // Generate rendered system prompt
    const renderedSystemPrompt = useMemo(() => {
      if (!isTemplatedPal || !systemPrompt) {
        return systemPrompt || '';
      }
      return generateFinalSystemPrompt(systemPrompt, parameters);
    }, [isTemplatedPal, systemPrompt, parameters]);

    const buildGenerationPrompt = () => {
      const formValues = getValues();
      const topic = formValues.generatingPrompt;

      // Build parameter context if parameters exist, excluding technical parameters
      let parameterContext = '';
      if (parameterSchema.length > 0) {
        // Filter out technical parameters that shouldn't influence AI generation
        const technicalParams = ['captureInterval'];

        const filledParameters = parameterSchema
          .filter(param => !technicalParams.includes(param.key))
          .map(param => {
            const value = parameters[param.key];
            if (value && value.trim()) {
              return `- ${param.label}: ${value}`;
            }
            return null;
          })
          .filter(Boolean);

        if (filledParameters.length > 0) {
          parameterContext = [
            '\nUser-defined parameters:',
            filledParameters.join('\n'),
            '\n',
          ].join('\n');
        }
      }

      // Determine pal type based on parameter schema and capabilities
      const isRoleplayPal = parameterSchema.some(
        param => param.key === 'world' || param.key === 'aiRole',
      );
      const isVideoPal = parameterSchema.some(
        param => param.key === 'captureInterval',
      );
      const isAssistantPal = parameterSchema.length === 0;

      if (isRoleplayPal) {
        return [
          'Generate a system prompt for a roleplay AI assistant with the following specifications:',
          `\nScenario Description: "${topic}"`,
          parameterContext,
          'The system prompt should:',
          '- Create an immersive roleplay experience',
          "- Define the AI's character, personality, and behavior",
          '- Establish the setting, world, and context',
          '- Include specific roleplay guidelines and tone',
          '- Be written in second person ("You are...")',
          '- Incorporate all provided parameters naturally',
          '- Be detailed enough to maintain consistent character behavior',
          '\nOutput the system prompt in JSON format with the key "prompt".',
        ].join('\n');
      } else if (isVideoPal) {
        return [
          'Generate a system prompt for a video analysis AI assistant with the following specifications:',
          `\nVideo Analysis Purpose: "${topic}"`,
          parameterContext,
          'The system prompt should:',
          '- Be optimized for real-time video analysis and description',
          '- Emphasize concise, clear communication',
          '- Include guidelines for handling uncertainty',
          '- Specify the tone and response style for video commentary',
          '- Be written in second person ("You are...")',
          '- Focus on visual analysis capabilities',
          '\nOutput the system prompt in JSON format with the key "prompt".',
        ].join('\n');
      } else if (isAssistantPal) {
        return [
          'Generate a concise and professional system prompt for an AI assistant with the following role:',
          `\nAssistant Purpose: "${topic}"`,
          parameterContext,
          'The system prompt should:',
          "- Be clear and direct about the assistant's primary function",
          "- Define the assistant's expertise and capabilities",
          '- Specify the tone and communication style',
          '- Be written in second person ("You are...")',
          '- Be concise but comprehensive',
          '\nOutput the system prompt in JSON format with the key "prompt".',
        ].join('\n');
      } else {
        // Generic fallback for other pal types (e.g., PalsHub pals)
        return [
          'Generate a system prompt for an AI assistant with the following specifications:',
          `\nPurpose & Context: "${topic}"`,
          parameterContext,
          'The system prompt should:',
          "- Be clear about the assistant's role and function",
          '- Incorporate any provided parameters',
          '- Be written in second person ("You are...")',
          '- Be appropriate for the specified context',
          '\nOutput the system prompt in JSON format with the key "prompt".',
        ].join('\n');
      }
    };

    const handleGeneratePrompt = async () => {
      // Validate form fields if validateFields is provided
      if (validateFields) {
        const isValid = await validateFields();
        if (!isValid) {
          return;
        }
      }

      clearErrors('systemPrompt');

      try {
        const selectedModel = getValues().promptGenerationModel;
        if (!selectedModel) {
          console.error('Active model not found');
          return;
        }

        if (modelStore.activeModelId !== selectedModel.id) {
          const context = await modelStore.initContext(selectedModel);
          if (!context) {
            console.error('Failed to initialize context');
            return;
          }
        }

        const schema = {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The system prompt for the assistant scenario',
            },
          },
          required: ['prompt'],
        };

        const generatingPrompt = buildGenerationPrompt();
        const result = await generate(generatingPrompt, schema);
        setValue('systemPrompt', result?.prompt);

        // Only set originalSystemPrompt if it's not already set (preserve PalsHub templates)
        const currentOriginal = getValues('originalSystemPrompt');
        if (!currentOriginal) {
          setValue('originalSystemPrompt', result?.prompt);
        }

        setValue('isSystemPromptChanged', false);
      } catch (err) {
        console.error('Generation error:', err);
      } finally {
      }
    };

    const handleStopGeneration = () => {
      stop();
    };

    const handleReset = () => {
      const originalPrompt = getValues('originalSystemPrompt');
      if (originalPrompt) {
        setValue('systemPrompt', originalPrompt);
        setValue('isSystemPromptChanged', false);
      }
    };

    const handleResetParameters = () => {
      // Reset parameter values to defaults while keeping template
      parameterSchema.forEach(param => {
        let defaultValue: any;
        switch (param.type) {
          case 'select':
            defaultValue = [];
            break;
          case 'datetime_tag':
            defaultValue = '{{datetime}}';
            break;
          default:
            defaultValue = '';
            break;
        }
        setValue(param.key as any, defaultValue);
      });
    };

    const handleToggleTemplateMode = () => {
      setShowTemplateMode(!showTemplateMode);
    };

    const isSystemPromptEdited = watch('isSystemPromptChanged');

    return (
      <>
        <SectionDivider
          label={l10n.components.systemPromptSection.sectionTitle}
        />
        <View style={styles.field}>
          <Controller
            control={control}
            name="useAIPrompt"
            render={({field: {onChange, value}}) => (
              <View style={styles.checkboxContainer}>
                <Checkbox
                  checked={value}
                  onPress={() => {
                    onChange(!value);
                    clearErrors('systemPrompt');
                  }}
                  disabled={isSystemPromptEdited}>
                  <Text>{l10n.components.systemPromptSection.useAIPrompt}</Text>
                </Checkbox>
              </View>
            )}
          />
        </View>

        {useAIPrompt && (
          <>
            <Controller
              name="promptGenerationModel"
              control={control}
              render={({field: {onChange, value}, fieldState: {error}}) => (
                <ModelSelector
                  value={value}
                  onChange={selected => {
                    onChange(selected);
                    clearErrors('promptGenerationModel');
                  }}
                  label={
                    l10n.components.systemPromptSection.modelSelector.label
                  }
                  sublabel={
                    l10n.components.systemPromptSection.modelSelector.sublabel
                  }
                  placeholder={
                    l10n.components.systemPromptSection.modelSelector
                      .placeholder
                  }
                  error={!!error}
                  helperText={error?.message}
                  disabled={isSystemPromptEdited}
                />
              )}
            />
            <ModelNotAvailable
              model={promptGenerationModel}
              closeSheet={closeSheet}
            />
            {!hideGeneratingPrompt && (
              <FormField
                name="generatingPrompt"
                label={
                  l10n.components.systemPromptSection.generatingPrompt.label
                }
                placeholder={
                  l10n.components.systemPromptSection.generatingPrompt
                    .placeholder
                }
                multiline
                required
                disabled={isSystemPromptEdited}
              />
            )}
            <Button
              mode="contained"
              onPress={
                isGenerating ? handleStopGeneration : handleGeneratePrompt
              }
              loading={isGenerating || isLoadingModel}
              disabled={isLoadingModel || isSystemPromptEdited}
              testID="generate-button">
              {isLoadingModel
                ? l10n.components.systemPromptSection.buttons.loadingModel
                : isGenerating
                ? l10n.components.systemPromptSection.buttons.stopGenerating
                : l10n.components.systemPromptSection.buttons.generatePrompt}
            </Button>
          </>
        )}

        {/* Smart System Prompt Display */}
        {isTemplatedPal ? (
          <>
            {/* Template Mode Toggle */}
            <View style={styles.templateModeHeader}>
              <Text style={[theme.fonts.titleMedium]}>
                {showTemplateMode ? 'Template Mode' : 'System Prompt'}
              </Text>
              <IconButton
                icon={showTemplateMode ? 'eye' : 'code-tags'}
                size={20}
                onPress={handleToggleTemplateMode}
                style={styles.toggleButton}
              />
            </View>

            {showTemplateMode ? (
              /* Template Mode - Show raw template */
              <FormField
                name="systemPrompt"
                label="Template (Advanced)"
                sublabel="Edit the raw template with {{parameter}} placeholders"
                placeholder="You are {{role}} in {{setting}}..."
                multiline
                required
                disabled={useAIPrompt && isGenerating}
                onSubmitEditing={() => {
                  setValue('isSystemPromptChanged', true);
                }}
              />
            ) : (
              /* Rendered Mode - Show final prompt */
              <View style={styles.renderedPromptContainer}>
                <Text
                  style={[theme.fonts.bodyMedium, styles.renderedPromptText]}>
                  {renderedSystemPrompt ||
                    'Configure parameters above to see the final prompt...'}
                </Text>
              </View>
            )}

            {/* Enhanced Reset Options for Templated Pals */}
            <View style={styles.resetOptionsContainer}>
              <Button
                mode="text"
                onPress={handleResetParameters}
                style={styles.resetButton}>
                {l10n.components.systemPromptSection.buttons.resetParameters}
              </Button>
              <Button
                mode="text"
                onPress={handleReset}
                style={styles.resetButton}>
                {l10n.components.systemPromptSection.buttons.resetTemplate}
              </Button>
            </View>
          </>
        ) : (
          /* Standard Mode - Non-templated pals */
          <>
            <FormField
              name="systemPrompt"
              label={l10n.components.systemPromptSection.systemPrompt.label}
              sublabel={
                l10n.components.systemPromptSection.systemPrompt.sublabel
              }
              placeholder={
                l10n.components.systemPromptSection.systemPrompt.placeholder
              }
              multiline
              required
              disabled={useAIPrompt && isGenerating}
              onSubmitEditing={() => {
                // Mark as manually changed for non-templated pals
                setValue('isSystemPromptChanged', true);
              }}
            />
            {isSystemPromptEdited && (
              <View style={styles.warningContainer}>
                <Text style={[theme.fonts.bodyMedium, styles.warningText]}>
                  {l10n.components.systemPromptSection.warnings.promptChanged}
                </Text>
                <Button
                  mode="text"
                  onPress={handleReset}
                  style={styles.resetButton}>
                  {l10n.common.reset}
                </Button>
              </View>
            )}
          </>
        )}
      </>
    );
  },
);
