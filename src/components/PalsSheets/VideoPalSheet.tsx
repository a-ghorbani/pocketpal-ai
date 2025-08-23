import React, {
  useContext,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';

import {observer} from 'mobx-react-lite';
import {Button, Text} from 'react-native-paper';
import {zodResolver} from '@hookform/resolvers/zod';
import {InputSlider} from '../InputSlider';
import {useForm, FormProvider, Controller, useWatch} from 'react-hook-form';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {FormField} from './FormField';
import {ColorSection} from './ColorSection';
import {ModelSelector} from './ModelSelector';
import {SectionDivider} from './SectionDivider';
import {ModelNotAvailable} from './ModelNotAvailable';
import {SystemPromptSection} from './SystemPromptSection';
import {createSchemaWithL10n, PalType, type VideoPalFormData} from './types';

import {palStore} from '../../store';
import {modelStore} from '../../store/ModelStore';

import {L10nContext} from '../../utils';

import {Sheet} from '..';

interface VideoPalSheetProps {
  isVisible: boolean;
  onClose: () => void;
  editPal?: VideoPalFormData & {id: string};
}

// Default model for video pals
const DEFAULT_VIDEO_MODEL_ID =
  'ggml-org/SmolVLM-500M-Instruct-GGUF/SmolVLM-500M-Instruct-Q8_0.gguf';

// Initial state for the form
const INITIAL_STATE: Omit<VideoPalFormData, 'palType'> = {
  name: 'Lookie',
  defaultModel: undefined, // Will be set to SmolVLM if available
  useAIPrompt: false,
  systemPrompt:
    'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  color: ['#9E204F', '#F6E1EA'],
  captureInterval: 3000, // Default to 3 second
};

export const VideoPalSheet: React.FC<VideoPalSheetProps> = observer(
  ({isVisible, onClose, editPal}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Create localized schema using current l10n context
    const schemas = useMemo(() => createSchemaWithL10n(l10n), [l10n]);
    const videoFormSchema = schemas.videoSchema;

    const inputRefs = useRef<{[key: string]: RNTextInput | null}>({});

    const methods = useForm<VideoPalFormData>({
      resolver: zodResolver(videoFormSchema),
      defaultValues: {...INITIAL_STATE, palType: PalType.VIDEO},
    });

    // Watch the defaultModel field to get reactive updates
    const watchedDefaultModel = useWatch({
      control: methods.control,
      name: 'defaultModel',
    });

    const resetForm = useCallback(() => {
      if (editPal) {
        methods.reset(editPal);
      } else {
        // Set default model to SmolVLM regardless of download status
        // This shows users which model they need to download
        const defaultModel = modelStore.models.find(
          model => model.id === DEFAULT_VIDEO_MODEL_ID,
        );
        methods.reset({
          ...INITIAL_STATE,
          palType: PalType.VIDEO,
          defaultModel: defaultModel || undefined,
        });
      }
    }, [editPal, methods]);

    useEffect(() => {
      resetForm();
    }, [resetForm]);

    const handleClose = () => {
      resetForm();
      onClose();
    };

    const validateVideoFields = async () => {
      const formState = methods.getValues();
      if (formState.useAIPrompt) {
        if (!formState.generatingPrompt) {
          methods.setError('generatingPrompt', {
            message:
              l10n.components.assistantPalSheet.validation
                .generatingPromptRequired,
          });
        }
        if (!formState.promptGenerationModel) {
          methods.setError('promptGenerationModel', {
            message:
              l10n.components.assistantPalSheet.validation.promptModelRequired,
          });
        }
        return Boolean(
          formState.generatingPrompt && formState.promptGenerationModel,
        );
      }
      return true;
    };

    const onSubmit = (data: VideoPalFormData) => {
      if (editPal) {
        palStore.updatePal(editPal.id, data);
      } else {
        palStore.addPal(data);
      }
      handleClose();
    };

    return (
      <Sheet
        title={
          editPal
            ? l10n.components.lookiePalSheet.title.edit
            : l10n.components.lookiePalSheet.title.create
        }
        isVisible={isVisible}
        displayFullHeight
        onClose={handleClose}>
        <FormProvider {...methods}>
          <Sheet.ScrollView
            bottomOffset={16}
            contentContainerStyle={styles.scrollviewContainer}>
            <View style={styles.form}>
              <FormField
                ref={ref => (inputRefs.current.name = ref)}
                name="name"
                label={l10n.components.lookiePalSheet.palName}
                placeholder={l10n.components.lookiePalSheet.palNamePlaceholder}
                required
              />

              <SectionDivider
                label={l10n.components.lookiePalSheet.requiredModelsSection}
              />

              <Controller
                name="defaultModel"
                control={methods.control}
                render={({field: {onChange, value}, fieldState: {error}}) => (
                  <ModelSelector
                    value={value}
                    onChange={onChange}
                    label={l10n.components.lookiePalSheet.visionModel}
                    placeholder={
                      l10n.components.lookiePalSheet.visionModelPlaceholder
                    }
                    error={!!error}
                    helperText={error?.message}
                    inputRef={ref => (inputRefs.current.defaultModel = ref)}
                    filter={model => Boolean(model.supportsMultimodal)}
                  />
                )}
              />

              <ModelNotAvailable
                model={editPal?.defaultModel || watchedDefaultModel}
                closeSheet={handleClose}
              />

              <SectionDivider
                label={l10n.components.lookiePalSheet.captureInterval}
              />

              <Controller
                name="captureInterval"
                control={methods.control}
                render={({field: {onChange, value}}) => (
                  <View style={styles.sliderContainer}>
                    <Text style={styles.sliderLabel}>
                      {l10n.components.lookiePalSheet.captureInterval}: {value}{' '}
                      {l10n.video.captureIntervalUnit}
                    </Text>
                    <InputSlider
                      value={value}
                      onValueChange={onChange}
                      min={500}
                      max={5000}
                      step={500}
                      showRangeLabel={true}
                      unit="ms"
                    />
                  </View>
                )}
              />

              <SystemPromptSection
                validateFields={validateVideoFields}
                closeSheet={handleClose}
              />
              <ColorSection />
            </View>
          </Sheet.ScrollView>

          <Sheet.Actions>
            <View style={styles.actions}>
              <Button
                style={styles.actionBtn}
                mode="text"
                onPress={handleClose}>
                {l10n.common.cancel}
              </Button>
              <Button
                style={styles.actionBtn}
                mode="contained"
                onPress={methods.handleSubmit(onSubmit)}>
                {editPal
                  ? l10n.common.save
                  : l10n.components.lookiePalSheet.create}
              </Button>
            </View>
          </Sheet.Actions>
        </FormProvider>
      </Sheet>
    );
  },
);
