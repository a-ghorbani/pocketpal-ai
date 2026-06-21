import React, {useCallback, useState, useEffect, useMemo} from 'react';
import {
  Alert,
  Linking,
  View,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
  ActivityIndicator,
} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {
  Card,
  Icon,
  ProgressBar,
  Text,
  Switch,
  Snackbar,
} from 'react-native-paper';

import {ProjectionModelSelector, MemoryRequirement} from '../../../components';
import {Label, Button, IconButton} from '../../../components/ui';

import {useTheme, useMemoryCheck, useStorageCheck} from '../../../hooks';

import {createStyles} from './styles';

import {uiStore, modelStore, serverStore} from '../../../store';
import {t} from '../../../locales';

import {
  Model,
  ModelOrigin,
  ModelType,
  RootStackParamList,
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
  PlayIcon,
  StopIcon,
  DownloadIcon,
  ChevronSelectorVerticalIcon,
  ChevronSelectorExpandedVerticalIcon,
} from '../../../assets/icons';

type ChatScreenNavigationProp = StackNavigationProp<RootStackParamList>;

interface ModelCardProps {
  model: Model;
  activeModelId?: string;
  onFocus?: () => void;
  onOpenSettings?: () => void;
  onOpenServerDetails?: (serverId: string) => void;
}

// Enable LayoutAnimation on Android
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const ModelCard: React.FC<ModelCardProps> = observer(
  ({model, activeModelId, onOpenSettings, onOpenServerDetails}) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);

    const navigation = useNavigation<ChatScreenNavigationProp>();

    const [snackbarVisible, setSnackbarVisible] = useState(false); // Snackbar visibility
    const [integrityError, setIntegrityError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    // Resolve projection model for memory check (same logic as ModelStore.checkMemoryAndConfirm)
    // Resolve projection model for memory check (same logic as ModelStore.checkMemoryAndConfirm)
    const projectionModelForCheck = useMemo(
      () => {
        if (
          model.supportsMultimodal &&
          modelStore.getModelVisionPreference(model) &&
          model.defaultProjectionModel
        ) {
          return modelStore.models.find(
            m => m.id === model.defaultProjectionModel,
          );
        }
        return undefined;
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps -- MobX observable tracked by observer()
      [model, modelStore.models],
    );

    const {memoryWarning, shortMemoryWarning, multimodalWarning} =
      useMemoryCheck(model, projectionModelForCheck);
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
    const isRemoteModel = model.origin === ModelOrigin.REMOTE;

    // Check projection model status for downloaded vision models
    const projectionModelStatus = modelStore.getProjectionModelStatus(model);
    const hasProjectionModelWarning =
      isDownloaded &&
      model.supportsMultimodal &&
      modelStore.getModelVisionPreference(model) && // Only show warning when vision is enabled
      projectionModelStatus.state === 'missing';

    // Check integrity when model is downloaded (skip remote models — no local file)
    useEffect(() => {
      if (isDownloaded && !isRemoteModel) {
        checkModelFileIntegrity(model).then(({errorMessage}) => {
          setIntegrityError(errorMessage);
        });
      } else {
        setIntegrityError(null);
      }
    }, [isDownloaded, isRemoteModel, model]);

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

    // Status badges shown under the title row. Recommended maps to the
    // device-rule preset provenance (isRulePreset) and shows on not-yet-
    // downloaded models. The "⚡ tok/s" metric has no backing field and is
    // omitted (no persisted per-model inference speed).
    const renderStatusBadges = () => {
      const badges: React.ReactNode[] = [];
      if (!isDownloaded && !isRemoteModel && model.isRulePreset) {
        badges.push(
          <Label
            key="recommended"
            testID="badge-recommended"
            variant="informational"
            size="s"
            label={l10n.models.modelCard.badges.recommended}
          />,
        );
      }
      if (isActiveModel) {
        badges.push(
          <Label
            key="loaded"
            testID="badge-loaded"
            variant="status-success"
            size="s"
            label={l10n.models.modelCard.badges.loaded}
          />,
        );
      } else if (isDownloaded) {
        badges.push(
          <Label
            key="downloaded"
            testID="badge-downloaded"
            variant="status-success"
            size="s"
            label={l10n.models.modelCard.badges.downloaded}
          />,
        );
      }
      if (model.supportsMultimodal) {
        badges.push(
          <Label
            key="vision"
            testID="badge-vision"
            variant="informational"
            size="s"
            label={l10n.models.modelCard.badges.visionSupport}
            leadingIcon={
              <EyeIcon
                width={12}
                height={12}
                stroke={theme.colors.iconModelTypeVision}
              />
            }
          />,
        );
      }
      if (badges.length === 0) {
        return null;
      }
      return <View style={styles.statusBadges}>{badges}</View>;
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

    const handleRemoteDelete = useCallback(() => {
      if (!model.serverId || !model.remoteModelId) {
        return;
      }
      const sName = model.serverName || 'Remote';
      Alert.alert(
        l10n.common.delete,
        t(l10n.settings.removeRemoteModel, {
          modelName: model.name,
          serverName: sName,
        }),
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: () => {
              if (isActiveModel) {
                modelStore.manualReleaseContext();
              }
              serverStore.removeUserSelectedModel(
                model.serverId!,
                model.remoteModelId!,
              );
              serverStore.removeServerIfOrphaned(model.serverId!);
            },
          },
        ],
      );
    }, [model, l10n, isActiveModel]);

    const renderExpandButton = () => (
      <IconButton
        testID="expand-details-button"
        variant="standard"
        onPress={toggleExpanded}
        accessibilityLabel={
          isExpanded
            ? l10n.models.modelCard.accessibility.collapseDetails
            : l10n.models.modelCard.accessibility.expandDetails
        }
        icon={
          isExpanded ? (
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
          )
        }
      />
    );

    const renderSettingsButton = () => (
      <IconButton
        testID="settings-button"
        variant="standard"
        onPress={onOpenSettings}
        accessibilityLabel={l10n.models.modelCard.buttons.settings}
        icon={
          <SettingsIcon
            width={16}
            height={16}
            stroke={theme.colors.onSurfaceVariant}
          />
        }
      />
    );

    const renderActionButtons = () => {
      // Remote models: load/offload + delete
      if (isRemoteModel) {
        return (
          <View style={styles.actionButtonsRow}>
            {renderModelLoadButton()}
            <IconButton
              testID="delete-button"
              variant="standard"
              onPress={handleRemoteDelete}
              accessibilityLabel={l10n.common.delete}
              icon={
                <TrashIcon width={16} height={16} stroke={theme.colors.error} />
              }
            />
          </View>
        );
      }

      if (isDownloading) {
        // Downloading state - show stop button
        return (
          <View style={styles.actionButtonsRow}>
            <Button
              testID="cancel-button"
              variant="secondary"
              accessibilityLabel={l10n.common.stop}
              onPress={() => modelStore.cancelDownload(model.id)}
              style={styles.primaryActionButton}>
              <View style={styles.buttonContent}>
                <StopIcon
                  width={16}
                  height={16}
                  stroke={theme.colors.onSecondaryContainer}
                />
                <Text style={styles.buttonLabel}>{l10n.common.stop}</Text>
              </View>
            </Button>
            {renderExpandButton()}
          </View>
        );
      }

      if (!isDownloaded) {
        // Not downloaded state
        return (
          <View style={styles.actionButtonsRow}>
            <Button
              testID="download-button"
              variant="secondary"
              disabled={!storageOk}
              accessibilityLabel={l10n.models.modelCard.buttons.download}
              onPress={() => modelStore.checkSpaceAndDownload(model.id)}
              style={styles.primaryActionButton}>
              <View style={styles.buttonContent}>
                <DownloadIcon
                  width={16}
                  height={16}
                  stroke={
                    storageOk
                      ? theme.colors.onSecondaryContainer
                      : theme.colors.onSurfaceVariant
                  }
                />
                <Text
                  style={[
                    styles.buttonLabel,
                    !storageOk && styles.buttonLabelDisabled,
                  ]}>
                  {l10n.models.modelCard.buttons.download}
                </Text>
              </View>
            </Button>

            {renderSettingsButton()}

            {isHfModel && (
              <IconButton
                testID="remove-model-button"
                variant="standard"
                onPress={handleRemove}
                accessibilityLabel={l10n.models.modelCard.buttons.remove}
                icon={
                  <XIcon width={20} height={20} stroke={theme.colors.error} />
                }
              />
            )}

            {renderExpandButton()}
          </View>
        );
      }

      // Downloaded state
      return (
        <View style={styles.actionButtonsRow}>
          {renderModelLoadButton()}

          {renderSettingsButton()}

          <IconButton
            testID="delete-button"
            variant="standard"
            onPress={() => handleDelete()}
            accessibilityLabel={l10n.common.delete}
            icon={
              <TrashIcon width={16} height={16} stroke={theme.colors.error} />
            }
          />

          {renderExpandButton()}
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
            testID="loading-indicator"
            variant="secondary"
            disabled={true}
            accessibilityLabel={l10n.models.modelCard.buttons.load}
            style={styles.primaryActionButton}>
            <ActivityIndicator
              size="small"
              color={theme.colors.onSurfaceVariant}
            />
          </Button>
        );
      }

      const handlePress = async () => {
        if (isActiveModel) {
          modelStore.manualReleaseContext();
        } else {
          try {
            await modelStore.selectModel(model);
            if (uiStore.autoNavigatetoChat) {
              navigation.navigate('Chat');
            }
          } catch (e) {
            console.log(`Error: ${e}`);
          }
        }
      };

      const label = isActiveModel
        ? l10n.models.modelCard.buttons.offload
        : l10n.models.modelCard.buttons.load;

      return (
        <Button
          testID={isActiveModel ? 'offload-button' : 'load-button'}
          variant="secondary"
          accessibilityLabel={isActiveModel ? 'Offload model' : 'Load model'}
          onPress={handlePress}
          style={styles.primaryActionButton}>
          <View style={styles.buttonContent}>
            {isActiveModel ? (
              <XIcon
                width={16}
                height={16}
                stroke={theme.colors.onSecondaryContainer}
              />
            ) : (
              <PlayIcon
                width={16}
                height={16}
                stroke={theme.colors.onSecondaryContainer}
              />
            )}
            <Text style={styles.buttonLabel}>{label}</Text>
          </View>
        </Button>
      );
    };

    return (
      <>
        <Card
          elevation={0}
          style={styles.card}
          testID={`model-card-${model.filename}`}>
          {/* Compact Header */}
          <View style={styles.compactHeader}>
            <View style={styles.headerContent}>
              <View style={styles.headerLeft}>
                <View style={styles.modelTypeIcon}>{getModelTypeIcon()}</View>
                <Text
                  style={styles.compactModelName}
                  numberOfLines={1}
                  ellipsizeMode="middle">
                  {model.name}
                </Text>
              </View>
              <View style={styles.headerRight}>
                {isRemoteModel ? (
                  <TouchableOpacity
                    testID="server-link"
                    onPress={() => {
                      if (model.serverId && onOpenServerDetails) {
                        onOpenServerDetails(model.serverId);
                      }
                    }}
                    style={styles.serverLink}>
                    <Icon
                      source="cloud-outline"
                      size={12}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.serverLinkText}>
                      {model.serverName || 'Remote'}
                    </Text>
                  </TouchableOpacity>
                ) : (
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
                )}
                {getStatusDot()}
              </View>
            </View>
          </View>

          {/* Status badges */}
          {renderStatusBadges()}

          {/* Content */}
          <View style={styles.cardContent}>
            {/* Pre-load advisory: insufficient storage */}
            {!isRemoteModel && !storageOk && !isDownloaded && (
              <View style={styles.advisoryContainer}>
                <Label
                  testID="storage-error-text"
                  variant="status-warning"
                  size="s"
                  style={styles.advisoryLabel}
                  label={storageNOkMessage}
                />
              </View>
            )}

            {/* Pre-load advisory: low memory / multimodal mismatch */}
            {!isRemoteModel &&
              (shortMemoryWarning || multimodalWarning) &&
              isDownloaded && (
                <TouchableOpacity
                  testID="memory-warning-button"
                  onPress={handleWarningPress}
                  style={styles.advisoryContainer}>
                  <Label
                    variant="status-warning"
                    size="s"
                    style={styles.advisoryLabel}
                    label={shortMemoryWarning || multimodalWarning || ''}
                  />
                </TouchableOpacity>
              )}

            {/* Pre-load advisory: file integrity */}
            {!isRemoteModel && integrityError && (
              <View
                testID="integrity-warning-button"
                style={styles.advisoryContainer}>
                <Label
                  variant="status-warning"
                  size="s"
                  style={styles.advisoryLabel}
                  label={integrityError}
                />
              </View>
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

                {/* Memory Requirement */}
                {model.isDownloaded && (
                  <MemoryRequirement
                    model={model}
                    projectionModel={projectionModelForCheck}
                  />
                )}

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
                  {(model.hfModel?.specs?.gguf?.context_length ||
                    model.ggufMetadata?.context_length) && (
                    <View style={styles.technicalDetailCard}>
                      <Text style={styles.technicalDetailLabel}>
                        {l10n.models.modelCard.labels.contextLength}
                      </Text>
                      <Text style={styles.technicalDetailValue}>
                        {(
                          model.hfModel?.specs?.gguf?.context_length ||
                          model.ggufMetadata?.context_length
                        )?.toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {/* Architecture */}
                  {(model.hfModel?.specs?.gguf?.architecture ||
                    model.ggufMetadata?.architecture) && (
                    <View style={styles.technicalDetailCard}>
                      <Text style={styles.technicalDetailLabel}>
                        {l10n.models.modelCard.labels.architecture}
                      </Text>
                      <Text style={styles.technicalDetailValue}>
                        {model.hfModel?.specs?.gguf?.architecture ||
                          model.ggufMetadata?.architecture}
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
