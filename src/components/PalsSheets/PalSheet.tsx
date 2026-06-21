import React, {
  useContext,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {Alert, View, TextInput as RNTextInput} from 'react-native';

import {z} from 'zod';
import {observer} from 'mobx-react-lite';
import {Button} from 'react-native-paper';
import {zodResolver} from '@hookform/resolvers/zod';
import {useForm, FormProvider, Controller} from 'react-hook-form';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {FormField} from './FormField';
import type {PalFormData} from './types';
import {ColorSection} from './ColorSection';
import {TalentSection} from './TalentSection';
import {ModelSelector} from './ModelSelector';
import {GreetingSection} from './GreetingSection';
import {SectionDivider} from './SectionDivider';
import {ModelNotAvailable} from './ModelNotAvailable';
import {SystemPromptSection} from './SystemPromptSection';
import {GenerationSettings} from './GenerationSettings';
import {DynamicParameterForm} from '../DynamicParameters';

import {palStore} from '../../store';

import type {Pal, TalentRef} from '../../types/pal';

import {L10nContext} from '../../utils';
import {validateCompletionSettings} from '../../utils/modelSettings';

import {Tabs} from '../ui';

import {Sheet} from '..';

type PalFormTab = 'general' | 'generation';

interface PalSheetProps {
  isVisible: boolean;
  onClose: () => void;
  pal: Partial<Pal>; // Single prop for both create and edit scenarios
}

const INITIAL_STATE: PalFormData = {
  name: '',
  description: '',
  defaultModel: undefined,
  useAIPrompt: false,
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  color: undefined,
  promptGenerationModel: undefined,
  generatingPrompt: '',
  completionSettings: undefined,
  talents: [],
  greetingText: '',
  suggestedPrompts: [],
};

export const PalSheet: React.FC<PalSheetProps> = observer(
  ({isVisible, onClose, pal}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Active form tab (General | Generation)
    const [activeTab, setActiveTab] = useState<PalFormTab>('general');

    // Mirror of the form's completionSettings for the Generation tab.
    const [currentCompletionSettings, setCurrentCompletionSettings] = useState<
      Record<string, any> | undefined
    >(pal.completionSettings);

    // Determine if we're editing an existing pal or creating a new one
    const isEditing = !!pal.id;

    // Use the parameter schema from the pal object
    const activeSchema = useMemo(() => {
      return pal.parameterSchema || [];
    }, [pal.parameterSchema]);

    // Create dynamic validation schema
    const validationSchema = useMemo(() => {
      const baseSchema = z.object({
        name: z
          .string()
          .min(1, l10n.components.palSheet.validation.nameRequired),
        description: z.string().nullable().optional(),
        defaultModel: z.any().optional(),
        useAIPrompt: z.boolean(),
        systemPrompt: z.string(),
        originalSystemPrompt: z.string().nullable().optional(),
        isSystemPromptChanged: z.boolean(),
        color: z.tuple([z.string(), z.string()]).optional(),
        promptGenerationModel: z.any().optional(),
        generatingPrompt: z.string().nullable().optional(),
        completionSettings: z.record(z.string(), z.any()).optional(),
        talents: z.array(z.string()).optional(),
        greetingText: z.string().optional(),
        suggestedPrompts: z.array(z.string()).optional(),
      });

      // Add dynamic parameter validation
      const dynamicFields: Record<string, z.ZodTypeAny> = {};
      activeSchema.forEach(param => {
        if (param.required) {
          dynamicFields[param.key] = z
            .string()
            .min(1, `${param.label} is required`);
        } else {
          dynamicFields[param.key] = z.string().optional();
        }
      });

      return baseSchema.extend(dynamicFields);
    }, [activeSchema, l10n]);

    // This is used for "Enter" on an text field to focus the next one
    const inputRefs = useRef<{[key: string]: RNTextInput | null}>({});
    const [isSaving, setIsSaving] = useState(false);

    // Manages values, errors, touches & makes Zod the source of truth for validation.
    const methods = useForm<PalFormData>({
      resolver: zodResolver(validationSchema) as any,
      defaultValues: INITIAL_STATE,
    });

    // Watch the current defaultModel value to update ModelNotAvailable component
    const currentDefaultModel = methods.watch('defaultModel');

    // Handler for updating completion settings
    const handleUpdateCompletionSettings = useCallback(
      (settings: Record<string, any> | undefined) => {
        // Update both the form and our local state
        methods.setValue('completionSettings', settings);
        setCurrentCompletionSettings(settings);
      },
      [methods],
    );

    // Initialize form with pal data
    useEffect(() => {
      const formData: PalFormData = {
        name: pal.name || '',
        description: pal.description || '',
        defaultModel: pal.defaultModel,
        useAIPrompt: pal.useAIPrompt || false,
        systemPrompt: pal.systemPrompt || '',
        originalSystemPrompt: pal.originalSystemPrompt || '',
        isSystemPromptChanged: pal.isSystemPromptChanged || false,
        color: pal.color,
        promptGenerationModel: pal.promptGenerationModel,
        generatingPrompt: pal.generatingPrompt || '',
        completionSettings: pal.completionSettings,
        talents: pal.pact?.talents?.map(t => t.name) ?? [],
        greetingText: pal.greeting?.text ?? '',
        suggestedPrompts: pal.greeting?.suggestedPrompts ?? [],
        ...pal.parameters, // Spread dynamic parameters
      };
      setCurrentCompletionSettings(pal.completionSettings);
      methods.reset(formData);
    }, [pal, methods]);

    const resetForm = useCallback(() => {
      const formData: PalFormData = {
        name: pal.name || '',
        description: pal.description || '',
        defaultModel: pal.defaultModel,
        useAIPrompt: pal.useAIPrompt || false,
        systemPrompt: pal.systemPrompt || '',
        originalSystemPrompt: pal.originalSystemPrompt || '',
        isSystemPromptChanged: pal.isSystemPromptChanged || false,
        color: pal.color,
        promptGenerationModel: pal.promptGenerationModel,
        generatingPrompt: pal.generatingPrompt || '',
        completionSettings: pal.completionSettings,
        talents: pal.pact?.talents?.map(t => t.name) ?? [],
        greetingText: pal.greeting?.text ?? '',
        suggestedPrompts: pal.greeting?.suggestedPrompts ?? [],
        ...pal.parameters, // Spread dynamic parameters
      };
      methods.reset(formData);
    }, [pal, methods]);

    useEffect(() => {
      resetForm();
    }, [resetForm]);

    const handleClose = () => {
      resetForm();
      onClose();
    };

    // Validation for dynamic parameters
    const validateDynamicFields = async () => {
      const parameterKeys = activeSchema.map(param => param.key);
      const result = await methods.trigger(parameterKeys);

      const formState = methods.getValues();
      if (formState.useAIPrompt) {
        if (!formState.generatingPrompt) {
          methods.setError('generatingPrompt', {
            message:
              l10n.components.palSheet.validation.generatingPromptRequired,
          });
        }
        if (!formState.promptGenerationModel) {
          methods.setError('promptGenerationModel', {
            message: l10n.components.palSheet.validation.promptModelRequired,
          });
        }
        return Boolean(
          formState.generatingPrompt &&
            formState.promptGenerationModel &&
            result,
        );
      }
      return result;
    };

    const onSubmit = async (data: PalFormData) => {
      if (isSaving) {
        return; // Prevent double submission
      }

      // Block submit on invalid completion settings (out-of-range numbers,
      // non-numeric input in numeric fields). The folded Generation tab edits
      // the form's completionSettings directly, so validate before persisting.
      if (data.completionSettings) {
        const {errors} = validateCompletionSettings(data.completionSettings);
        if (Object.keys(errors).length > 0) {
          Alert.alert(
            l10n.components.chatGenerationSettingsSheet.invalidValues,
            l10n.components.chatGenerationSettingsSheet.pleaseCorrect +
              '\n' +
              Object.entries(errors)
                .map(([key, msg]) => `• ${key}: ${msg}`)
                .join('\n'),
            [{text: l10n.components.chatGenerationSettingsSheet.ok}],
          );
          return;
        }
      }

      setIsSaving(true);
      try {
        // Extract dynamic parameters from form data
        const parameters: Record<string, any> = {};
        activeSchema.forEach(param => {
          parameters[param.key] = data[param.key];
        });

        // For templated pals, systemPrompt should always contain the template (with placeholders)
        // The rendered prompt is generated on-demand, not stored
        const systemPrompt = data.systemPrompt;
        const originalSystemPrompt = data.originalSystemPrompt;

        // Build pact from selected talents
        // Always pass pact explicitly — using `undefined` would skip the
        // update in PalRepository (it checks `if (updates.pact !== undefined)`)
        const selectedTalents = data.talents ?? [];
        const pact =
          selectedTalents.length > 0
            ? {
                talents: selectedTalents.map(name => ({
                  name,
                  necessity: 'required' as const,
                })),
              }
            : {talents: [] as TalentRef[]};

        // Empty-object sentinel clears stale greeting via PalRepository's
        // `!== undefined` update gate. Greeting text is not trimmed (raw
        // length matches the wire-side text predicate); prompts are trimmed
        // + de-empted here as an editor-side UX cleanup.
        const greetingText = data.greetingText ?? '';
        const cleanedPrompts = (data.suggestedPrompts ?? [])
          .map(p => p.trim())
          .filter(p => p.length > 0);
        const hasGreeting =
          greetingText.length > 0 || cleanedPrompts.length > 0;
        const greeting: Pal['greeting'] = hasGreeting
          ? cleanedPrompts.length > 0
            ? {text: greetingText, suggestedPrompts: cleanedPrompts}
            : {text: greetingText}
          : {text: '', suggestedPrompts: []};

        // Create pal data
        // For updates, if we don't set values, it will preserve the original pal's values
        const palData: Partial<Pal> = {
          type: pal.type || 'local',
          name: data.name,
          description: data.description,
          defaultModel: data.defaultModel,
          useAIPrompt: data.useAIPrompt,
          systemPrompt,
          originalSystemPrompt,
          isSystemPromptChanged: data.isSystemPromptChanged,
          color: data.color,
          promptGenerationModel: data.promptGenerationModel,
          generatingPrompt: data.generatingPrompt,
          parameters,
          parameterSchema: activeSchema,
          source: pal.source || 'local',
          capabilities: pal.capabilities || {},
          // Include (local) completion settings if they exist
          completionSettings: data.completionSettings,
          pact,
          greeting,
        };

        if (isEditing) {
          // Update existing pal
          await palStore.updatePal(pal.id!, palData);
        } else {
          // Create new pal
          await palStore.createPal(palData as Omit<Pal, 'id'>);
        }

        handleClose();
      } catch (error) {
        console.error('Error saving pal:', error);
        // TODO: Show error message to user
        // For now, we'll just log the error and not close the sheet
        // so the user can try again
      } finally {
        setIsSaving(false);
      }
    };

    // Determine sheet title - simple and clear
    const getSheetTitle = () => {
      if (isEditing) {
        return l10n.components.palSheet.title.edit;
      }

      // For new pals, check capabilities for specific types
      if (pal.capabilities?.video) {
        return l10n.components.palSheet.title.newVideoPal;
      }

      // Default to "New Pal" for all other types (assistant, roleplay, etc.)
      return l10n.components.palSheet.title.newPal;
    };

    // Determine if we should show parameters section
    const showParametersSection = activeSchema.length > 0;

    const tabItems = [
      {value: 'general', label: l10n.components.palSheet.tabGeneral},
      {value: 'generation', label: l10n.components.palSheet.tabGeneration},
    ];

    return (
      <>
        <Sheet
          title={getSheetTitle()}
          isVisible={isVisible}
          displayFullHeight
          onClose={handleClose}>
          <FormProvider {...methods}>
            <Tabs
              style={styles.tabs}
              variant="underline"
              items={tabItems}
              selectedValue={activeTab}
              onChange={value => setActiveTab(value as PalFormTab)}
            />
            <Sheet.ScrollView
              bottomOffset={16}
              contentContainerStyle={styles.scrollviewContainer}>
              {activeTab === 'general' ? (
                <View style={styles.form} testID="pal-form-tab-general">
                  <FormField
                    ref={ref => {
                      inputRefs.current.name = ref;
                    }}
                    name="name"
                    label={
                      l10n.components.assistantPalSheet?.palName || 'Pal Name'
                    }
                    placeholder={
                      l10n.components.assistantPalSheet?.palNamePlaceholder ||
                      'Enter pal name'
                    }
                    required
                    onSubmitEditing={() =>
                      inputRefs.current.description?.focus()
                    }
                  />

                  <FormField
                    ref={ref => {
                      inputRefs.current.description = ref;
                    }}
                    name="description"
                    label={l10n.components.palSheet.description}
                    placeholder={
                      l10n.components.palSheet.descriptionPlaceholder
                    }
                    multiline
                    onSubmitEditing={() =>
                      inputRefs.current.defaultModel?.focus()
                    }
                  />

                  <Controller
                    name="defaultModel"
                    control={methods.control}
                    render={({
                      field: {onChange, value},
                      fieldState: {error},
                    }) => (
                      <ModelSelector
                        value={value}
                        onChange={onChange}
                        label={
                          l10n.components.assistantPalSheet?.defaultModel ||
                          'Default Model'
                        }
                        placeholder={
                          l10n.components.assistantPalSheet
                            ?.defaultModelPlaceholder || 'Select model'
                        }
                        error={!!error}
                        helperText={error?.message}
                        testID="pal-default-model-selector"
                      />
                    )}
                  />

                  <ModelNotAvailable
                    model={pal.defaultModel}
                    currentlySelectedModel={currentDefaultModel}
                    closeSheet={handleClose}
                  />

                  {showParametersSection && (
                    <>
                      <SectionDivider
                        label={l10n.components.palSheet.parameters}
                      />
                      <DynamicParameterForm schema={activeSchema} />
                    </>
                  )}

                  <SystemPromptSection
                    validateFields={validateDynamicFields}
                    closeSheet={handleClose}
                    parameterSchema={activeSchema}
                  />

                  <GreetingSection />

                  <ColorSection />

                  <TalentSection />
                </View>
              ) : (
                <View testID="pal-form-tab-generation">
                  <GenerationSettings
                    palName={pal.name || 'Pal'}
                    completionSettings={currentCompletionSettings}
                    onUpdateSettings={handleUpdateCompletionSettings}
                  />
                </View>
              )}
            </Sheet.ScrollView>

            <Sheet.Actions>
              <View style={styles.actions}>
                <Button
                  style={styles.actionBtn}
                  mode="text"
                  onPress={handleClose}>
                  {l10n.common?.cancel || 'Cancel'}
                </Button>
                <Button
                  style={styles.actionBtn}
                  mode="contained"
                  loading={isSaving}
                  disabled={isSaving}
                  onPress={methods.handleSubmit(onSubmit)}
                  testID="submit-button">
                  {isEditing
                    ? l10n.common.save
                    : l10n.components.assistantPalSheet.create}
                </Button>
              </View>
            </Sheet.Actions>
          </FormProvider>
        </Sheet>
      </>
    );
  },
);
