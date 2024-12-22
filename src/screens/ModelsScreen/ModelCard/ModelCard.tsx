import React, {useCallback, useState, useEffect} from 'react';
import {Alert, Linking, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useNavigation} from '@react-navigation/native';
import {DrawerNavigationProp} from '@react-navigation/drawer';
import {
  Card,
  ProgressBar,
  Button,
  IconButton,
  Text,
  Paragraph,
  TouchableRipple,
  HelperText,
  ActivityIndicator,
  Snackbar,
} from 'react-native-paper';

import {Dialog, Divider} from '../../../components';

import {useTheme, useMemoryCheck, useStorageCheck} from '../../../hooks';

import {createStyles} from './styles';
import {ModelSettings} from '../ModelSettings';

import {uiStore, modelStore} from '../../../store';

import {chatTemplates} from '../../../utils/chat';
import {getModelDescription, L10nContext} from '../../../utils';
import {
  COMPLETION_PARAMS_METADATA,
  validateCompletionSettings,
} from '../../../utils/modelSettings';
import {Model, ModelOrigin, RootDrawerParamList} from '../../../utils/types';

type ChatScreenNavigationProp = DrawerNavigationProp<RootDrawerParamList>;

interface ModelCardProps {
  model: Model;
  activeModelId?: string;
  onFocus?: () => void;
}

export const ModelCard: React.FC<ModelCardProps> = observer(
  ({model, activeModelId, onFocus}) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);

    const navigation = useNavigation<ChatScreenNavigationProp>();

    const [snackbarVisible, setSnackbarVisible] = useState(false); // Snackbar visibility
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);

    const {memoryWarning, shortMemoryWarning} = useMemoryCheck(model);
    const {isOk: storageOk, message: storageNOkMessage} =
      useStorageCheck(model);

    const isActiveModel = activeModelId === model.id;
    const isDownloaded = model.isDownloaded;
    const isDownloading = modelStore.isDownloading(model.id);
    const isHfModel = model.origin === ModelOrigin.HF;

    // temporary settings
    const [tempChatTemplate, setTempChatTemplate] = useState(
      model.chatTemplate,
    );
    const [tempCompletionSettings, setTempCompletionSettings] = useState(
      model.completionSettings,
    );

    // Reset temp settings when model changes
    useEffect(() => {
      setTempChatTemplate(model.chatTemplate);
      setTempCompletionSettings(model.completionSettings);
    }, [model]);

    const handleSettingsUpdate = useCallback((name: string, value: any) => {
      setTempChatTemplate(prev => {
        const newTemplate =
          name === 'name' ? chatTemplates[value] : {...prev, [name]: value};
        return newTemplate;
      });
    }, []);

    const handleCompletionSettingsUpdate = useCallback(
      (name: string, value: any) => {
        setTempCompletionSettings(prev => ({
          ...prev,
          [name]: value,
        }));
      },
      [],
    );

    const handleOpenSettings = useCallback(() => {
      setSettingsModalVisible(true);
    }, []);

    const handleCloseSettings = useCallback(() => {
      setSettingsModalVisible(false);
    }, []);

    const handleSaveSettings = useCallback(() => {
      // Convert string values to numbers where needed
      const processedSettings = Object.entries(tempCompletionSettings).reduce(
        (acc, [key, value]) => {
          const metadata = COMPLETION_PARAMS_METADATA[key];
          if (metadata?.validation.type === 'numeric') {
            // Handle numeric conversion
            let numValue: number;
            if (typeof value === 'string') {
              numValue = Number(value);
            } else if (typeof value === 'number') {
              numValue = value;
            } else {
              // If it's neither string nor number, treat as invalid. Most probably won't happen.
              acc.errors[key] = 'Must be a valid number';
              return acc;
            }

            if (Number.isNaN(numValue)) {
              acc.errors[key] = 'Must be a valid number';
            } else {
              acc.settings[key] = numValue;
            }
          } else {
            // For non-numeric values, keep as is
            acc.settings[key] = value;
          }
          return acc;
        },
        {settings: {}, errors: {}} as {
          settings: typeof tempCompletionSettings;
          errors: Record<string, string>;
        },
      );

      // Validate the converted values
      const validationResult = validateCompletionSettings(
        processedSettings.settings,
      );
      const allErrors = {
        ...processedSettings.errors,
        ...validationResult.errors,
      };

      if (Object.keys(allErrors).length > 0) {
        Alert.alert(
          'Invalid Values',
          'Please correct the following:\n' +
            Object.entries(allErrors)
              .map(([key, msg]) => `• ${key}: ${msg}`)
              .join('\n'),
          [{text: 'OK'}],
        );
        return;
      }

      // All validations passed, save the settings
      modelStore.updateModelChatTemplate(model.id, tempChatTemplate);
      modelStore.updateCompletionSettings(model.id, processedSettings.settings);
      handleCloseSettings();
    }, [
      model.id,
      tempChatTemplate,
      tempCompletionSettings,
      handleCloseSettings,
    ]);

    const handleCancelSettings = useCallback(() => {
      // Reset to store values
      setTempChatTemplate(model.chatTemplate);
      setTempCompletionSettings(model.completionSettings);
      handleCloseSettings();
    }, [model.chatTemplate, model.completionSettings, handleCloseSettings]);

    const handleReset = useCallback(() => {
      // Reset to model default values
      modelStore.resetModelChatTemplate(model.id);
      modelStore.resetCompletionSettings(model.id);
      setTempChatTemplate(model.chatTemplate);
      setTempCompletionSettings(model.completionSettings);
    }, [model.id, model.chatTemplate, model.completionSettings]);

    const handleDelete = useCallback(() => {
      if (model.isDownloaded) {
        Alert.alert(
          'Delete Model',
          'Are you sure you want to delete this downloaded model?',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Delete',
              onPress: async () => {
                await modelStore.deleteModel(model);
              },
            },
          ],
        );
      }
    }, [model]);

    const openHuggingFaceUrl = useCallback(() => {
      if (model.hfUrl) {
        Linking.openURL(model.hfUrl).catch(err => {
          console.error('Failed to open URL:', err);
          setSnackbarVisible(true);
        });
      }
    }, [model.hfUrl]);

    const handleRemove = useCallback(() => {
      Alert.alert(
        'Remove Model',
        'Are you sure you want to remove this model from the list?',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => modelStore.removeModelFromList(model),
          },
        ],
      );
    }, [model]);

    const handleWarningPress = () => {
      setSnackbarVisible(true);
    };

    const renderDownloadOverlay = () => (
      <View>
        {!storageOk && (
          <HelperText
            testID="storage-error-text"
            type="error"
            visible={!storageOk}
            padding="none"
            style={styles.storageErrorText}>
            {storageNOkMessage}
          </HelperText>
        )}
        <View style={styles.overlayButtons}>
          {isHfModel && (
            <Button
              testID="remove-model-button"
              icon="delete-outline"
              mode="text"
              textColor={theme.colors.error}
              onPress={handleRemove}
              style={styles.removeButton}>
              Remove
            </Button>
          )}
          {storageOk && (
            <Button
              testID="download-button"
              icon="download"
              mode="text"
              onPress={() => modelStore.checkSpaceAndDownload(model.id)}
              disabled={!storageOk}
              textColor={theme.colors.secondary}
              style={styles.downloadButton}>
              Download
            </Button>
          )}
        </View>
      </View>
    );

    const renderModelLoadButton = () => {
      if (
        modelStore.isContextLoading &&
        modelStore.loadingModel?.id === model.id
      ) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              testID="loading-indicator"
              animating={true}
              color={theme.colors.primary}
            />
          </View>
        );
      }

      const handlePress = () => {
        if (isActiveModel) {
          modelStore.manualReleaseContext();
        } else {
          modelStore
            .initContext(model)
            .then(() => {
              console.log('initialized');
            })
            .catch(e => {
              console.log(`Error: ${e}`);
            });
          if (uiStore.autoNavigatetoChat) {
            navigation.navigate('Chat');
          }
        }
      };

      return (
        <Button
          testID={isActiveModel ? 'offload-button' : 'load-button'}
          icon={isActiveModel ? 'eject' : 'play-circle-outline'}
          mode="text"
          onPress={handlePress}
          style={styles.actionButton}>
          {isActiveModel ? l10n.offload : l10n.load}
        </Button>
      );
    };

    const dialogActions = [
      {
        label: 'Reset',
        onPress: handleReset,
      },
      {
        label: 'Cancel',
        onPress: handleCancelSettings,
      },
      {
        label: 'Save Changes',
        onPress: handleSaveSettings,
        mode: 'contained' as const,
      },
    ];

    return (
      <>
        <Card
          elevation={0}
          style={[
            styles.card,
            {backgroundColor: theme.colors.surface},
            isActiveModel && {backgroundColor: theme.colors.tertiaryContainer},
            {borderColor: theme.colors.primary},
          ]}>
          <View style={styles.cardInner}>
            <View style={styles.cardContent}>
              <View style={styles.headerRow}>
                <View style={styles.modelInfoContainer}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.modelName]}>{model.name}</Text>

                    {model.hfUrl && (
                      <IconButton
                        testID="open-huggingface-url"
                        icon="open-in-new"
                        size={14}
                        iconColor={theme.colors.onSurfaceVariant}
                        onPress={openHuggingFaceUrl}
                        style={styles.hfButton}
                      />
                    )}
                  </View>
                  <Text style={styles.modelDescription}>
                    {getModelDescription(model, isActiveModel, modelStore)}
                  </Text>
                  {model.description && (
                    <View style={styles.descriptionContainer}>
                      <Text style={styles.skillsLabel}>Skills: </Text>
                      <Text style={styles.skillsText}>{model.description}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Display warning icon if there's a memory warning */}
              {shortMemoryWarning && isDownloaded && (
                <TouchableRipple
                  testID="memory-warning-button"
                  onPress={handleWarningPress}
                  style={styles.warningContainer}>
                  <View style={styles.warningContent}>
                    <IconButton
                      icon="alert-circle-outline"
                      iconColor={theme.colors.error}
                      size={20}
                      style={styles.warningIcon}
                    />
                    <Text style={styles.warningText}>{shortMemoryWarning}</Text>
                  </View>
                </TouchableRipple>
              )}

              {isDownloading && (
                <>
                  <ProgressBar
                    testID="download-progress-bar"
                    progress={modelStore.getDownloadProgress(model.id)}
                    color={theme.colors.tertiary}
                    style={styles.progressBar}
                  />
                  {model.downloadSpeed && (
                    <Paragraph style={styles.downloadSpeed}>
                      {model.downloadSpeed}
                    </Paragraph>
                  )}
                </>
              )}
            </View>

            <Divider style={styles.divider} />

            {isDownloaded ? (
              <Card.Actions style={styles.actions}>
                <Button
                  testID="delete-button"
                  icon="delete"
                  mode="text"
                  compact
                  textColor={theme.colors.error}
                  onPress={() => handleDelete()}
                  style={styles.actionButton}>
                  {l10n.delete}
                </Button>
                <View style={styles.settingsContainer}>
                  <Button
                    testID="settings-button"
                    icon="tune"
                    mode="text"
                    compact
                    onPress={handleOpenSettings}>
                    Settings
                  </Button>
                  <IconButton
                    icon="chevron-down"
                    size={14}
                    style={styles.settingsChevron}
                  />
                </View>
                {renderModelLoadButton()}
              </Card.Actions>
            ) : isDownloading ? (
              <Card.Actions style={styles.actions}>
                <View style={styles.overlayButtons}>
                  <Button
                    testID="cancel-button"
                    icon="close"
                    mode="text"
                    textColor={theme.colors.error}
                    onPress={() => modelStore.cancelDownload(model.id)}>
                    {l10n.cancel}
                  </Button>
                </View>
              </Card.Actions>
            ) : (
              renderDownloadOverlay()
            )}
          </View>
        </Card>
        {/* Snackbar to show full memory warning */}
        <Snackbar
          testID="memory-warning-snackbar"
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={Snackbar.DURATION_MEDIUM}
          action={{
            label: l10n.dismiss,
            onPress: () => {
              setSnackbarVisible(false);
            },
          }}>
          {memoryWarning}
        </Snackbar>

        {/* Settings Modal */}
        <Dialog
          dismissable={false}
          visible={settingsModalVisible}
          onDismiss={handleCancelSettings}
          title="Model Settings"
          scrollable
          avoidKeyboard
          actions={dialogActions}>
          <ModelSettings
            chatTemplate={tempChatTemplate}
            completionSettings={tempCompletionSettings}
            onChange={handleSettingsUpdate}
            onCompletionSettingsChange={handleCompletionSettingsUpdate}
            onFocus={onFocus}
          />
        </Dialog>
      </>
    );
  },
);
