import React, {useCallback, useState, useEffect} from 'react';
import {
  Alert,
  Linking,
  View,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useNavigation} from '@react-navigation/native';
import {DrawerNavigationProp} from '@react-navigation/drawer';
import {
  Card,
  ProgressBar,
  Button,
  IconButton,
  Text,
  TouchableRipple,
  ActivityIndicator,
  Snackbar,
  Switch,
  HelperText,
} from 'react-native-paper';

import {ProjectionModelSelector} from '../../../components';

import {useTheme, useMemoryCheck, useStorageCheck} from '../../../hooks';

import {createStyles} from './styles';

import {uiStore, modelStore} from '../../../store';

import {
  Model,
  ModelOrigin,
  ModelType,
  RootDrawerParamList,
} from '../../../utils/types';
import {
  getModelSizeString,
  L10nContext,
  checkModelFileIntegrity,
  getModelSkills,
  formatNumber,
} from '../../../utils';

import {
  LinkExternalIcon,
  TrashIcon,
  SettingsIcon,
  CpuChipIcon,
  EyeIcon,
  ChatIcon,
  XIcon,
  ChevronSelectorVerticalIcon,
  ChevronSelectorExpandedVerticalIcon,
} from '../../../assets/icons';

type ChatScreenNavigationProp = DrawerNavigationProp<RootDrawerParamList>;

interface ModelCardProps {
  model: Model;
  activeModelId?: string;
  onFocus?: () => void;
  onOpenSettings?: () => void;
}

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const ModelCard: React.FC<ModelCardProps> = observer(
  ({model, activeModelId, onOpenSettings}) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);

    const navigation = useNavigation<ChatScreenNavigationProp>();

    const [snackbarVisible, setSnackbarVisible] = useState(false); // Snackbar visibility
    const [integrityError, setIntegrityError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const {memoryWarning, shortMemoryWarning, multimodalWarning} =
      useMemoryCheck(model.size, model.supportsMultimodal);
    const {isOk: storageOk, message: storageNOkMessage} = useStorageCheck(
      model,
      {
        enablePeriodicCheck: true,
        checkInterval: 10000,
      },
    );

    const isActiveModel = activeModelId === model.id;
    const isDownloaded = model.isDownloaded;
    const isDownloading = modelStore.isDownloading(model.id);
    const isHfModel = model.origin === ModelOrigin.HF;

    // Check projection model status for downloaded vision models
    const projectionModelStatus = modelStore.getProjectionModelStatus(model);
    const hasProjectionModelWarning =
      isDownloaded &&
      model.supportsMultimodal &&
      modelStore.getModelVisionPreference(model) && // Only show warning when vision is enabled
      projectionModelStatus.state === 'missing';

    // Check integrity when model is downloaded
    useEffect(() => {
      if (isDownloaded) {
        checkModelFileIntegrity(model).then(({errorMessage}) => {
          setIntegrityError(errorMessage);
        });
      } else {
        setIntegrityError(null);
      }
    }, [isDownloaded, model]);

    const handleDelete = useCallback(() => {
      if (model.isDownloaded) {
        // Special handling for projection models
        if (model.modelType === ModelType.PROJECTION) {
          const canDeleteResult = modelStore.canDeleteProjectionModel(model.id);

          if (!canDeleteResult.canDelete) {
            // Show error dialog with specific reason
            let message =
              canDeleteResult.reason ||
              l10n.models.multimodal.cannotDeleteTitle;

            if (
              canDeleteResult.reason === 'Projection model is currently active'
            ) {
              message = l10n.models.multimodal.cannotDeleteActive;
            } else if (
              canDeleteResult.dependentModels &&
              canDeleteResult.dependentModels.length > 0
            ) {
              const modelNames = canDeleteResult.dependentModels
                .map(m => m.name)
                .join(', ');
              message = `${l10n.models.multimodal.cannotDeleteInUse}\n\n${l10n.models.multimodal.dependentModels} ${modelNames}`;
            }

            Alert.alert(l10n.models.multimodal.cannotDeleteTitle, message, [
              {text: l10n.common.ok, style: 'default'},
            ]);
            return;
          }

          // Show projection-specific confirmation dialog
          Alert.alert(
            l10n.models.multimodal.deleteProjectionTitle,
            l10n.models.multimodal.deleteProjectionMessage,
            [
              {text: l10n.common.cancel, style: 'cancel'},
              {
                text: l10n.common.delete,
                style: 'destructive',
                onPress: async () => {
                  try {
                    await modelStore.deleteModel(model);
                  } catch (error) {
                    console.error('Failed to delete projection model:', error);
                    Alert.alert(
                      l10n.models.multimodal.cannotDeleteTitle,
                      error instanceof Error
                        ? error.message
                        : 'Unknown error occurred',
                      [{text: l10n.common.ok, style: 'default'}],
                    );
                  }
                },
              },
            ],
          );
        } else {
          // Standard model deletion
          Alert.alert(
            l10n.models.modelCard.alerts.deleteTitle,
            l10n.models.modelCard.alerts.deleteMessage,
            [
              {text: l10n.common.cancel, style: 'cancel'},
              {
                text: l10n.common.delete,
                onPress: async () => {
                  await modelStore.deleteModel(model);
                },
              },
            ],
          );
        }
      }
    }, [model, l10n]);

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
        l10n.models.modelCard.alerts.removeTitle,
        l10n.models.modelCard.alerts.removeMessage,
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.models.modelCard.buttons.remove,
            style: 'destructive',
            onPress: () => modelStore.removeModelFromList(model),
          },
        ],
      );
    }, [model, l10n]);

    const handleWarningPress = () => {
      setSnackbarVisible(true);
    };

    const handleProjectionWarningPress = useCallback(() => {
      if (model.defaultProjectionModel) {
        // Try to download the missing projection model
        modelStore.checkSpaceAndDownload(model.defaultProjectionModel);
      }
      // Note: If no default projection model, user can manually select one in the vision controls
    }, [model.defaultProjectionModel]);

    const handleVisionToggle = useCallback(
      async (enabled: boolean) => {
        try {
          await modelStore.setModelVisionEnabled(model.id, enabled);
        } catch (error) {
          console.error('Failed to toggle vision setting:', error);
          // The error is already handled in setModelVisionEnabled (vision state is reverted)
        }
      },
      [model.id],
    );

    const handleProjectionModelSelect = useCallback(
      (projectionModelId: string) => {
        modelStore.setDefaultProjectionModel(model.id, projectionModelId);
      },
      [model.id],
    );

    // Helper function to get model type icon - updated sizes
    const getModelTypeIcon = () => {
      if (model.supportsMultimodal) {
        return (
          <EyeIcon
            width={16}
            height={16}
            stroke={theme.colors.iconModelTypeVision}
          />
        );
      }
      // Default to chat icon for text models
      return (
        <ChatIcon
          width={16}
          height={16}
          stroke={theme.colors.iconModelTypeText}
        />
      );
    };

    // Helper function to get status dot
    const getStatusDot = () => {
      if (!isDownloaded) {
        return null;
      }
      return (
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: isActiveModel
                ? theme.colors.bgStatusActive
                : theme.colors.bgStatusIdle,
            },
          ]}
        />
      );
    };

    // Helper function to toggle expanded state with smooth LayoutAnimation
    const toggleExpanded = useCallback(() => {
      LayoutAnimation.configureNext({
        duration: 300,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.scaleXY,
        },
      });
      setIsExpanded(!isExpanded);
    }, [isExpanded]);

    const renderActionButtons = () => {
      if (isDownloading) {
        // Downloading state - show cancel button
        return (
          <View style={styles.actionButtonsRow}>
            <Button
              testID="cancel-button"
              icon="close"
              mode="outlined"
              onPress={() => modelStore.cancelDownload(model.id)}
              style={[
                styles.primaryActionButton,
                {
                  backgroundColor: theme.colors.errorContainer,
                  borderColor: theme.colors.error,
                },
              ]}
              textColor={theme.colors.error}>
              {l10n.common.cancel}
            </Button>
          </View>
        );
      }

      if (!isDownloaded) {
        // Not downloaded state
        return (
          <View style={styles.actionButtonsRow}>
            <Button
              testID="download-button"
              icon="download"
              mode="outlined"
              onPress={() => modelStore.checkSpaceAndDownload(model.id)}
              disabled={!storageOk}
              style={[
                styles.primaryActionButton,
                storageOk
                  ? {
                      backgroundColor: theme.colors.btnDownloadBg,
                      borderColor: theme.colors.btnDownloadBorder,
                    }
                  : {
                      backgroundColor: theme.colors.surfaceDim,
                      borderColor: theme.colors.outline,
                    },
              ]}
              textColor={theme.colors.btnDownloadText}>
              {l10n.models.modelCard.buttons.download}
            </Button>

            <TouchableOpacity
              testID="settings-button"
              onPress={onOpenSettings}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={l10n.models.modelCard.buttons.settings}>
              <SettingsIcon
                width={16}
                height={16}
                stroke={theme.colors.onSurfaceVariant}
              />
            </TouchableOpacity>

            {isHfModel && (
              <TouchableOpacity
                testID="remove-model-button"
                onPress={handleRemove}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={l10n.models.modelCard.buttons.remove}>
                <XIcon width={20} height={20} stroke={theme.colors.error} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              testID="expand-details-button"
              onPress={toggleExpanded}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={
                isExpanded
                  ? l10n.models.modelCard.accessibility.collapseDetails
                  : l10n.models.modelCard.accessibility.expandDetails
              }>
              {isExpanded ? (
                <ChevronSelectorExpandedVerticalIcon
                  width={16}
                  height={16}
                  stroke={theme.colors.onSurfaceVariant}
                />
              ) : (
                <ChevronSelectorVerticalIcon
                  width={16}
                  height={16}
                  stroke={theme.colors.onSurfaceVariant}
                />
              )}
            </TouchableOpacity>
          </View>
        );
      }

      // Downloaded state - soft blue styling
      return (
        <View style={styles.actionButtonsRow}>
          {renderModelLoadButton()}

          <TouchableOpacity
            testID="settings-button"
            onPress={onOpenSettings}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={l10n.models.modelCard.buttons.settings}>
            <SettingsIcon
              width={16}
              height={16}
              stroke={theme.colors.onSurfaceVariant}
            />
          </TouchableOpacity>

          <TouchableOpacity
            testID="delete-button"
            onPress={() => handleDelete()}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={l10n.common.delete}>
            <TrashIcon width={16} height={16} stroke={theme.colors.error} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="expand-details-button"
            onPress={toggleExpanded}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={
              isExpanded
                ? l10n.models.modelCard.accessibility.collapseDetails
                : l10n.models.modelCard.accessibility.expandDetails
            }>
            {isExpanded ? (
              <ChevronSelectorExpandedVerticalIcon
                width={16}
                height={16}
                stroke={theme.colors.onSurfaceVariant}
              />
            ) : (
              <ChevronSelectorVerticalIcon
                width={16}
                height={16}
                stroke={theme.colors.onSurfaceVariant}
              />
            )}
          </TouchableOpacity>
        </View>
      );
    };

    const renderModelLoadButton = () => {
      if (
        modelStore.isContextLoading &&
        modelStore.loadingModel?.id === model.id
      ) {
        return (
          <Button
            disabled={true}
            style={[
              styles.primaryActionButton,
              {
                backgroundColor: theme.colors.btnPrimaryBg,
                borderColor: theme.colors.btnPrimaryBorder,
              },
            ]}
            textColor={theme.colors.btnPrimaryText}>
            <ActivityIndicator
              testID="loading-indicator"
              animating={true}
              color={theme.colors.btnPrimaryText}
              size="small"
            />
          </Button>
        );
      }

      const handlePress = async () => {
        if (isActiveModel) {
          modelStore.manualReleaseContext();
        } else {
          try {
            await modelStore.initContext(model);
            if (uiStore.autoNavigatetoChat) {
              navigation.navigate('Chat');
            }
          } catch (e) {
            console.log(`Error: ${e}`);
          }
        }
      };

      const getButtonText = () => {
        if (isActiveModel) {
          return l10n.models.modelCard.buttons.offload;
        }
        return l10n.models.modelCard.buttons.load;
      };

      const getButtonStyle = () => {
        if (isActiveModel) {
          return {
            backgroundColor: theme.colors.btnReadyBg,
            borderColor: theme.colors.btnReadyBorder,
          };
        }
        return {
          backgroundColor: theme.colors.btnPrimaryBg,
          borderColor: theme.colors.btnPrimaryBorder,
        };
      };

      const getTextColor = () => {
        if (isActiveModel) {
          return theme.colors.btnReadyText;
        }
        return theme.colors.btnPrimaryText;
      };

      return (
        <Button
          testID={isActiveModel ? 'offload-button' : 'load-button'}
          icon={isActiveModel ? 'eject' : 'play-circle-outline'}
          //mode="contained-tonal"
          onPress={handlePress}
          style={[styles.primaryActionButton, getButtonStyle()]}
          textColor={getTextColor()}>
          {getButtonText()}
        </Button>
      );
    };

    return (
      <>
        <Card elevation={0} style={styles.card}>
          {/* Compact Header */}
          <View style={styles.compactHeader}>
            <View style={styles.headerContent}>
              <View style={styles.headerLeft}>
                <View style={styles.modelTypeIcon}>{getModelTypeIcon()}</View>
                <Text
                  variant="titleSmall"
                  style={styles.compactModelName}
                  numberOfLines={1}
                  ellipsizeMode="middle">
                  {model.name}
                </Text>
              </View>
              <View style={styles.headerRight}>
                <View style={styles.sizeInfo}>
                  <CpuChipIcon
                    width={10}
                    height={10}
                    stroke={theme.colors.onSurfaceVariant}
                  />
                  <Text style={styles.sizeInfoText}>
                    {getModelSizeString(model, isActiveModel, l10n)}
                  </Text>
                </View>
                {getStatusDot()}
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            {/* Storage Error Display */}
            {!storageOk && !isDownloaded && (
              <HelperText
                testID="storage-error-text"
                type="error"
                visible={!storageOk}
                padding="none"
                style={styles.storageErrorText}>
                {storageNOkMessage}
              </HelperText>
            )}

            {/* Display warnings */}
            {(shortMemoryWarning || multimodalWarning) && isDownloaded && (
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
                  <Text style={styles.warningText}>
                    {shortMemoryWarning || multimodalWarning}
                  </Text>
                </View>
              </TouchableRipple>
            )}

            {integrityError && (
              <TouchableRipple
                testID="integrity-warning-button"
                style={styles.warningContainer}>
                <View style={styles.warningContent}>
                  <IconButton
                    icon="alert-circle-outline"
                    iconColor={theme.colors.error}
                    size={20}
                    style={styles.warningIcon}
                  />
                  <Text style={styles.warningText}>{integrityError}</Text>
                </View>
              </TouchableRipple>
            )}

            {/* Download Progress */}
            {isDownloading && (
              <View style={styles.downloadProgressContainer}>
                <ProgressBar
                  testID="download-progress-bar"
                  progress={model.progress / 100}
                  color={theme.colors.tertiary}
                  style={styles.progressBar}
                />
                {model.downloadSpeed && (
                  <Text style={styles.downloadSpeed}>
                    {model.downloadSpeed}
                  </Text>
                )}
              </View>
            )}

            {/* Action Buttons Section */}
            <View style={styles.actionButtonsContainer}>
              {renderActionButtons()}
            </View>

            {isExpanded && (
              <View style={styles.detailsContent}>
                {/* Full Model Name */}
                <View style={styles.fullModelNameContainer}>
                  <Text style={styles.fullModelNameLabel}>
                    {l10n.models.modelCard.labels.modelName}
                  </Text>
                  <Text style={styles.fullModelNameText} selectable={true}>
                    {model.name}
                  </Text>
                </View>

                {/* Description - matching updated React example */}
                {model.capabilities && model.capabilities.length > 0 && (
                  <View style={styles.descriptionContainer}>
                    <Text style={styles.descriptionText}>
                      {getModelSkills(model)
                        .map(
                          skill =>
                            l10n.models.modelCapabilities[
                              skill.labelKey as keyof typeof l10n.models.modelCapabilities
                            ] || skill.labelKey,
                        )
                        .join(', ')}{' '}
                      {l10n.models.modelCard.labels.capabilities}
                    </Text>
                  </View>
                )}

                {/* Vision Toggle for multimodal models */}
                {model.supportsMultimodal && (
                  <View style={styles.visionToggleContainer}>
                    <View
                      testID="vision-skill-touchable"
                      style={styles.visionToggleHeader}>
                      <View style={styles.visionToggleLeft}>
                        <EyeIcon
                          width={16}
                          height={16}
                          stroke={
                            modelStore.getModelVisionPreference(model)
                              ? theme.colors.tertiary
                              : theme.colors.onSurfaceVariant
                          }
                        />
                        <Text style={styles.visionToggleLabel}>
                          {l10n.models.modelCard.labels.vision}
                        </Text>
                      </View>
                      <Switch
                        value={modelStore.getModelVisionPreference(model)}
                        onValueChange={handleVisionToggle}
                        disabled={
                          !projectionModelStatus.isAvailable &&
                          !modelStore.getModelVisionPreference(model) &&
                          model.isDownloaded
                        }
                      />
                    </View>
                    {!projectionModelStatus.isAvailable &&
                      !modelStore.getModelVisionPreference(model) &&
                      model.isDownloaded && (
                        <Text style={styles.visionHelpText}>
                          {l10n.models.modelCard.labels.requiresProjectionModel}
                        </Text>
                      )}
                  </View>
                )}

                {/* Projection Models Management for multimodal models */}
                {model.supportsMultimodal &&
                  modelStore.getModelVisionPreference(model) && (
                    <View style={styles.projectionModelsContainer}>
                      <ProjectionModelSelector
                        model={model}
                        onProjectionModelSelect={handleProjectionModelSelect}
                        showDownloadActions={model.isDownloaded}
                        initialExpanded={true}
                      />
                    </View>
                  )}

                {/* Technical Details Grid - 2x2 layout */}
                <View style={styles.technicalDetailsGrid}>
                  {/* Parameters */}
                  {model.params > 0 && (
                    <View style={styles.technicalDetailCard}>
                      <Text style={styles.technicalDetailLabel}>
                        {l10n.models.modelDescription.parameters}
                      </Text>
                      <Text style={styles.technicalDetailValue}>
                        {formatNumber(model.params, 2, true, false)}
                      </Text>
                    </View>
                  )}

                  {/* Context Length */}
                  {model.hfModel?.specs?.gguf?.context_length && (
                    <View style={styles.technicalDetailCard}>
                      <Text style={styles.technicalDetailLabel}>
                        {l10n.models.modelCard.labels.contextLength}
                      </Text>
                      <Text style={styles.technicalDetailValue}>
                        {model.hfModel.specs.gguf.context_length.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {/* Architecture */}
                  {model.hfModel?.specs?.gguf?.architecture && (
                    <View style={styles.technicalDetailCard}>
                      <Text style={styles.technicalDetailLabel}>
                        {l10n.models.modelCard.labels.architecture}
                      </Text>
                      <Text style={styles.technicalDetailValue}>
                        {model.hfModel.specs.gguf.architecture}
                      </Text>
                    </View>
                  )}

                  {/* Author */}
                  {model.author && (
                    <View style={styles.technicalDetailCard}>
                      <Text style={styles.technicalDetailLabel}>
                        {l10n.models.modelCard.labels.author}
                      </Text>
                      <Text style={styles.technicalDetailValue}>
                        {model.author}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Projection model warning */}
                {hasProjectionModelWarning && (
                  <TouchableOpacity
                    testID="projection-warning-badge"
                    onPress={handleProjectionWarningPress}
                    style={styles.warningButton}
                    activeOpacity={0.7}>
                    <Text style={styles.warningButtonText}>
                      {l10n.models.modelCard.labels.downloadProjectionModel}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* HuggingFace Link */}
                {model.hfUrl && (
                  <TouchableOpacity
                    testID="open-huggingface-url"
                    onPress={openHuggingFaceUrl}
                    style={styles.hfLinkButton}
                    activeOpacity={0.7}>
                    <View style={styles.hfLinkContent}>
                      <LinkExternalIcon
                        width={16}
                        height={16}
                        stroke={theme.colors.primary}
                      />
                      <Text style={styles.hfLinkText}>
                        {
                          l10n.models.modelCard.labels
                            .viewModelCardOnHuggingFace
                        }
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
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
            label: l10n.common.dismiss,
            onPress: () => {
              setSnackbarVisible(false);
            },
          }}>
          {memoryWarning ||
            multimodalWarning ||
            (hasProjectionModelWarning &&
              l10n.models.multimodal.projectionMissingWarning)}
        </Snackbar>
      </>
    );
  },
);
