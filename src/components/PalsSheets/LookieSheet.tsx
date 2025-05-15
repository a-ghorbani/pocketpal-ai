import React, {
  useContext,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';
import {Button} from 'react-native-paper';
import {observer} from 'mobx-react-lite';
import {useForm, FormProvider, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {Sheet} from '..';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {palStore} from '../../store';
import {modelStore} from '../../store/ModelStore';
import {FormField} from './FormField';
import {SystemPromptSection} from './SystemPromptSection';
import {ColorSection} from './ColorSection';
import {ModelSelector} from './ModelSelector';
import {createSchemaWithL10n, PalType, type CameraPalFormData} from './types';
import {ModelNotAvailableMulti} from './ModelNotAvailableMulti';
import {SectionDivider} from './SectionDivider';

interface LookieSheetProps {
  isVisible: boolean;
  onClose: () => void;
  editPal?: CameraPalFormData & {id: string};
}

// Model IDs for the vision and projection models
const LLM_MODEL_ID =
  'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/SmolVLM2-500M-Video-Instruct-Q8_0.gguf';
const MMPROJ_MODEL_ID =
  'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf';

// Initial state for the form
const INITIAL_STATE: Omit<CameraPalFormData, 'palType'> = {
  name: 'Lookie',
  defaultModel: modelStore.models.find(m => m.id === LLM_MODEL_ID),
  projectionModel: modelStore.models.find(m => m.id === MMPROJ_MODEL_ID),
  useAIPrompt: false,
  systemPrompt:
    'You are Lookie, an AI assistant that analyzes images. ' +
    'Provide brief, concise descriptions of what you see in the camera. ' +
    'If unsure about something, be honest about it.',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  color: ['#4CAF50', '#81C784'], // Green colors
};

export const LookieSheet: React.FC<LookieSheetProps> = observer(
  ({isVisible, onClose, editPal}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Create localized schema using current l10n context
    const schemas = useMemo(() => createSchemaWithL10n(l10n), [l10n]);
    const cameraFormSchema = schemas.cameraSchema;

    const inputRefs = useRef<{[key: string]: RNTextInput | null}>({});

    const methods = useForm<CameraPalFormData>({
      resolver: zodResolver(cameraFormSchema),
      defaultValues: {...INITIAL_STATE, palType: PalType.CAMERA},
    });

    useEffect(() => {
      if (editPal) {
        methods.reset(editPal);
      }
    }, [editPal, methods]);

    const resetForm = useCallback(() => {
      if (editPal) {
        methods.reset(editPal);
      } else {
        methods.reset({...INITIAL_STATE, palType: PalType.CAMERA});
      }
    }, [editPal, methods]);

    useEffect(() => {
      resetForm();
    }, [resetForm]);

    const handleClose = () => {
      resetForm();
      onClose();
    };

    const validateCameraFields = async () => {
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

    const onSubmit = (data: CameraPalFormData) => {
      if (editPal) {
        palStore.updatePal(editPal.id, data);
      } else {
        palStore.addPal(data);
      }
      handleClose();
    };

    return (
      <Sheet
        title={editPal ? 'Edit Lookie Pal' : 'Create Lookie Pal'}
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
                label="Pal Name"
                placeholder="Enter a name for your Lookie Pal"
                required
              />

              <SectionDivider label="Required Models" />

              <Controller
                name="defaultModel"
                control={methods.control}
                render={({field: {onChange, value}, fieldState: {error}}) => (
                  <ModelSelector
                    value={value}
                    onChange={onChange}
                    label="Vision Model"
                    placeholder="Select a vision model"
                    error={!!error}
                    helperText={
                      error?.message ||
                      'The main model that processes images and generates responses'
                    }
                    inputRef={ref => (inputRefs.current.defaultModel = ref)}
                    filter={model => model.modelType === 'vision'}
                  />
                )}
              />

              <Controller
                name="projectionModel"
                control={methods.control}
                render={({field: {onChange, value}, fieldState: {error}}) => (
                  <ModelSelector
                    value={value}
                    onChange={onChange}
                    label="Projection Model"
                    placeholder="Select a projection model"
                    error={!!error}
                    helperText={
                      error?.message ||
                      "Required for processing images before they're sent to the vision model"
                    }
                    inputRef={ref => (inputRefs.current.projectionModel = ref)}
                    filter={model => model.modelType === 'projection'}
                  />
                )}
              />

              <ModelNotAvailableMulti
                primaryModel={
                  editPal?.defaultModel || methods.getValues().defaultModel
                }
                secondaryModelId={
                  editPal?.projectionModel?.id ||
                  methods.getValues().projectionModel?.id ||
                  MMPROJ_MODEL_ID
                }
                closeSheet={handleClose}
              />

              <SystemPromptSection
                validateFields={validateCameraFields}
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
                {editPal ? l10n.common.save : 'Create'}
              </Button>
            </View>
          </Sheet.Actions>
        </FormProvider>
      </Sheet>
    );
  },
);
