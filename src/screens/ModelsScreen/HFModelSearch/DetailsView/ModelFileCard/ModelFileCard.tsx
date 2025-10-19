import React, {FC, useState, useContext, useMemo} from 'react';
import {Alert, View, StyleSheet, Pressable} from 'react-native';
import {computed} from 'mobx';
import {observer} from 'mobx-react';
import LinearGradient from 'react-native-linear-gradient';
import {
  IconButton,
  Text,
  Tooltip,
  Snackbar,
  Portal,
  Chip,
} from 'react-native-paper';

import {useTheme, useMemoryCheck} from '../../../../../hooks';
import {createStyles} from './styles';
import {modelStore} from '../../../../../store';
import {
  formatBytes,
  hfAsModel,
  L10nContext,
  isProjectionModel,
  getVisionModelSizeBreakdown,
  isVisionRepo,
} from '../../../../../utils';
import {isLegacyQuantization} from '../../../../../utils/modelSettings';
import {
  HuggingFaceModel,
  Model,
  ModelFile,
  ModelOrigin,
} from '../../../../../utils/types';
import {VisionDownloadSheet} from '../../../../../components';
import {ChevronRightIcon} from '../../../../../assets/icons';

interface ModelFileCardProps {
  modelFile: ModelFile;
  hfModel: HuggingFaceModel;
}

type Warning = {
  type: string;
  icon: string;
  message: string;
  shortMessage: string;
};

export const ModelFileCard: FC<ModelFileCardProps> = observer(
  ({modelFile, hfModel}) => {
    const [showWarning, setShowWarning] = useState(false);
    const [showVisionSheet, setShowVisionSheet] = useState(false);
    const theme = useTheme();
    const l10n = useContext(L10nContext);

    // Memoize to prevent unnecessary re-renders
    const isProjection = useMemo(
      () => isProjectionModel(modelFile.rfilename),
      [modelFile.rfilename],
    );
    const styles = useMemo(
      () => createStyles(theme, isProjection),
      [theme, isProjection],
    );
    const HF_YELLOW = '#FFD21E';

    // Check if we have all the necessary data, as some are fetched async, like size.
    const isModelInfoReady = Boolean(
      modelFile.size !== undefined && modelFile.canFitInStorage !== undefined,
    );

    const convertedModel = useMemo(
      () => hfAsModel(hfModel, modelFile),
      [hfModel, modelFile],
    );

    const storeModel = modelStore.models.find(m => m.id === convertedModel.id);

    const isDownloading = storeModel
      ? modelStore.isDownloading(storeModel.id)
      : false;
    const downloadProgress = storeModel?.progress || 0;
    const downloadSpeed = storeModel?.downloadSpeed;

    const isBookmarked = computed(() =>
      modelStore.models.some(model => model.hfModelFile?.oid === modelFile.oid),
    ).get();

    const isDownloaded = computed(() =>
      modelStore.models.some(
        model => model.hfModelFile?.oid === modelFile.oid && model.isDownloaded,
      ),
    ).get();

    const {shortMemoryWarning, multimodalWarning} = useMemoryCheck(
      convertedModel.size,
      convertedModel.supportsMultimodal,
    );

    const warnings = [
      !modelFile.canFitInStorage && {
        type: 'storage',
        icon: 'zip-disk',
        message: l10n.models.modelFile.warnings.storage.message,
        shortMessage: l10n.models.modelFile.warnings.storage.shortMessage,
      },
      shortMemoryWarning && {
        type: 'memory',
        icon: 'memory',
        message: l10n.models.modelFile.warnings.memory.message,
        shortMessage: shortMemoryWarning,
      },
      multimodalWarning && {
        type: 'multimodal',
        icon: 'alert-circle-outline',
        message: multimodalWarning,
        shortMessage: l10n.memory.shortWarning,
      },
      isLegacyQuantization(modelFile.rfilename) && {
        type: 'legacy',
        icon: 'alert-circle-outline',
        message: l10n.models.modelFile.warnings.legacy.message,
        shortMessage: l10n.models.modelFile.warnings.legacy.shortMessage,
      },
    ].filter((w): w is Warning => Boolean(w));

    const handleBookmark = () => {
      if (!isBookmarked) {
        modelStore.addHFModel(hfModel, modelFile);
      }
    };

    const handleUnbookmark = () => {
      if (isBookmarked) {
        const model = modelStore.models.find(
          (m: Model) => m.hfModelFile?.oid === modelFile.oid,
        );
        if (model?.origin === ModelOrigin.PRESET) {
          Alert.alert(
            l10n.models.modelFile.alerts.cannotRemoveTitle,
            l10n.models.modelFile.alerts.modelPreset,
          );
        } else if (model?.isDownloaded) {
          Alert.alert(
            l10n.models.modelFile.alerts.cannotRemoveTitle,
            l10n.models.modelFile.alerts.downloadedFirst,
          );
        } else if (model) {
          Alert.alert(
            l10n.models.modelFile.alerts.removeTitle,
            l10n.models.modelFile.alerts.removeMessage,
            [
              {text: l10n.common.cancel, style: 'cancel'},
              {
                text: l10n.models.modelFile.buttons.remove,
                onPress: () => {
                  const removed = modelStore.removeModelFromList(model);
                  if (!removed) {
                    Alert.alert(
                      'Error',
                      l10n.models.modelFile.alerts.removeError,
                    );
                  }
                },
              },
            ],
          );
        }
      }
    };

    const toggleBookmark = () => {
      if (isBookmarked) {
        handleUnbookmark();
      } else {
        handleBookmark();
      }
    };

    const handleDownload = () => {
      if (isDownloaded) {
        Alert.alert(
          l10n.models.modelFile.alerts.alreadyDownloadedTitle,
          l10n.models.modelFile.alerts.alreadyDownloadedMessage,
        );
      } else {
        // Direct download with default projection for all models
        // VisionDownloadSheet is only opened via the vision chip
        modelStore.downloadHFModel(hfModel, modelFile, {enableVision: true});
      }
    };

    const handleCancel = () => {
      if (storeModel && isDownloading) {
        modelStore.cancelDownload(storeModel.id);
      }
    };

    const handleDelete = () => {
      const model = modelStore.models.find(
        m => m.hfModelFile?.oid === modelFile.oid,
      );
      if (model?.isDownloaded) {
        Alert.alert(
          l10n.models.modelFile.alerts.deleteTitle,
          l10n.models.modelFile.alerts.deleteMessage,
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
    };

    const downloadIcon = isDownloaded
      ? 'delete'
      : modelFile.canFitInStorage
        ? 'download-outline'
        : 'download-off-outline';

    const handleWarningPress = () => {
      setShowWarning(true);
    };

    const handleDismissWarning = () => {
      setShowWarning(false);
    };

    // Get enhanced size display for vision models
    const getEnhancedSizeDisplay = () => {
      if (!modelFile.size) {
        return '';
      }

      // Check if this is a vision model
      const isVision = isVisionRepo(hfModel.siblings || []);
      const isProjModel = isProjectionModel(modelFile.rfilename);
      const isVisionLLM = isVision && !isProjModel;

      if (isVisionLLM) {
        const sizeBreakdown = getVisionModelSizeBreakdown(modelFile, hfModel);
        if (sizeBreakdown.hasProjection) {
          return `${formatBytes(sizeBreakdown.totalSize, 2, false, true)}`;
        }
      }

      return formatBytes(modelFile.size, 2, false, true);
    };

    return (
      <View
        style={styles.fileCardContainer}
        testID={`model-file-card-${modelFile.rfilename}`}>
        <LinearGradient
          colors={[theme.dark ? HF_YELLOW + '90' : HF_YELLOW, 'transparent']}
          locations={[1, 1]}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={[
            StyleSheet.absoluteFill,
            {width: `${downloadProgress}%`},
            styles.gradientBackground,
          ]}
        />
        <View style={styles.fileContent}>
          <View style={styles.header}>
            <View style={styles.fileInfo}>
              <Text
                variant="titleSmall"
                numberOfLines={1}
                ellipsizeMode="middle"
                style={styles.fileName}
                testID={`model-file-name-${modelFile.rfilename}`}>
                {modelFile.rfilename}
              </Text>
              <View style={styles.metadataRow}>
                {isModelInfoReady && modelFile.size && (
                  <Text variant="labelSmall" style={styles.fileSize}>
                    {getEnhancedSizeDisplay()}
                  </Text>
                )}
                {isModelInfoReady && warnings.length > 0 && (
                  <Pressable onPress={handleWarningPress}>
                    <View style={styles.warningChip}>
                      <IconButton
                        icon={warnings[0].icon}
                        iconColor={theme.colors.onErrorContainer}
                        size={12}
                        style={styles.warningIcon}
                      />
                      <Text style={styles.warningText}>
                        {warnings.length > 1
                          ? l10n.models.modelFile.warnings.multiple.replace(
                              '{count}',
                              warnings.length.toString(),
                            )
                          : warnings[0].shortMessage}
                      </Text>
                    </View>
                  </Pressable>
                )}
                {Boolean(hfModel.gated) && (
                  <View style={styles.warningChip}>
                    <IconButton
                      icon="lock"
                      iconColor={theme.colors.primary}
                      size={12}
                      style={styles.warningIcon}
                    />
                    <Text style={styles.gatedText}>
                      {l10n.components.hfTokenSheet.gatedModelIndicator}
                    </Text>
                  </View>
                )}
              </View>

              {/* Vision indicator chip for multimodal models */}
              {convertedModel.supportsMultimodal && (
                <View style={styles.visionChipContainer}>
                  <Chip
                    mode="flat"
                    compact
                    icon="eye"
                    style={styles.visionChip}
                    textStyle={styles.visionChipText}
                    onPress={() => setShowVisionSheet(true)}>
                    {isDownloaded
                      ? l10n.models.multimodal.visionControls.visionEnabled
                      : l10n.models.multimodal.visionControls
                          .includesVisionCapability}
                  </Chip>
                  <ChevronRightIcon
                    width={16}
                    height={16}
                    stroke={theme.colors.onSurfaceVariant}
                  />
                </View>
              )}

              {/* Download Speed */}
              {isDownloading && downloadSpeed && (
                <Text variant="bodySmall" style={styles.downloadSpeed}>
                  {l10n.models.modelFile.labels.downloadSpeed.replace(
                    '{speed}',
                    downloadSpeed,
                  )}
                </Text>
              )}
            </View>
            <View style={styles.fileActions}>
              <IconButton
                testID="bookmark-button"
                icon={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                onPress={toggleBookmark}
                size={20}
                animated
              />
              {isDownloading ? (
                <IconButton
                  testID="cancel-button"
                  icon="close"
                  onPress={handleCancel}
                  size={20}
                  animated
                />
              ) : (
                <Tooltip
                  enterTouchDelay={50}
                  title={
                    isModelInfoReady && !modelFile.canFitInStorage
                      ? l10n.models.modelFile.warnings.storage.message
                      : ''
                  }>
                  <View>
                    <IconButton
                      testID="download-button"
                      icon={downloadIcon}
                      onPress={
                        isDownloaded
                          ? handleDelete
                          : isDownloading
                            ? handleCancel
                            : handleDownload
                      }
                      size={20}
                      animated
                      disabled={
                        !isModelInfoReady ||
                        (!isDownloaded && !modelFile.canFitInStorage)
                      }
                    />
                  </View>
                </Tooltip>
              )}
            </View>
          </View>
        </View>
        <Portal>
          <Snackbar
            visible={showWarning}
            onDismiss={handleDismissWarning}
            duration={1000 + 2000 * warnings.length}
            style={styles.snackbarContainer}
            action={{
              label: l10n.common.dismiss,
              onPress: handleDismissWarning,
              labelStyle: {color: theme.colors.inverseSecondary},
            }}>
            <View style={styles.snackbarContent}>
              {warnings.map((warning, index) => (
                <Text key={warning.type} style={styles.snackbarText}>
                  {warnings.length > 1
                    ? `${index + 1}. ${warning.message}`
                    : warning.message}
                </Text>
              ))}
            </View>
          </Snackbar>
        </Portal>

        {/* Vision Download Options Sheet */}
        <VisionDownloadSheet
          isVisible={showVisionSheet}
          onClose={() => setShowVisionSheet(false)}
          hfModel={hfModel}
          modelFile={modelFile}
          convertedModel={convertedModel}
        />
      </View>
    );
  },
);
