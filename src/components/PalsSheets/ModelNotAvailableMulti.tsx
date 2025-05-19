import React, {useContext} from 'react';
import {Button, Paragraph, ProgressBar, Text} from 'react-native-paper';
import {modelStore} from '../../store';
import {Model} from '../../utils/types';
import {useTheme} from '../../hooks';
import {View} from 'react-native';
import {createStyles} from './styles';
import {useNavigation} from '@react-navigation/native';
import {observer} from 'mobx-react';
import {L10nContext} from '../../utils';

interface ModelNotAvailableMultiProps {
  primaryModel?: Model;
  secondaryModelId?: string;
  closeSheet: () => void;
}

export const ModelNotAvailableMulti = observer(
  ({
    primaryModel,
    secondaryModelId,
    closeSheet,
  }: ModelNotAvailableMultiProps) => {
    const theme = useTheme();
    const navigation = useNavigation<any>();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Find the secondary model
    const secondaryModel = secondaryModelId
      ? modelStore.models.find(m => m.id === secondaryModelId)
      : undefined;

    // If the secondary model ID is provided but the model is not found,
    // we need to show a message that the model needs to be downloaded
    const isSecondaryModelMissing = secondaryModelId && !secondaryModel;

    // Check if models are downloaded
    const isPrimaryModelDownloaded = modelStore.isModelAvailable(
      primaryModel?.id,
    );
    const isSecondaryModelDownloaded =
      modelStore.isModelAvailable(secondaryModelId);

    // Check if models are downloading
    const isPrimaryDownloading = primaryModel
      ? modelStore.isDownloading(primaryModel.id)
      : false;
    const isSecondaryDownloading = secondaryModel
      ? modelStore.isDownloading(secondaryModel.id)
      : false;

    // Get download progress
    const primaryDownloadProgress = (primaryModel?.progress || 0) / 100;
    const secondaryDownloadProgress = (secondaryModel?.progress || 0) / 100;

    // Get download speed
    const primaryDownloadSpeed = primaryModel?.downloadSpeed;
    const secondaryDownloadSpeed = secondaryModel?.downloadSpeed;

    const hasAnyDownloadedModel = modelStore.availableModels.length > 0;

    const handleDownloadModel = async (modelToDownload: Model) => {
      if (modelToDownload.hfModel) {
        await modelStore.downloadHFModel(
          modelToDownload.hfModel!,
          modelToDownload.hfModelFile!,
        );
      } else {
        await modelStore.checkSpaceAndDownload(modelToDownload.id);
      }
    };

    const handleNavigateToModels = () => {
      closeSheet();
      navigation.navigate('Models');
    };

    if (!hasAnyDownloadedModel && !primaryModel) {
      return (
        <View style={styles.modelNotDownloaded}>
          <Text style={{color: theme.colors.error}}>
            {l10n.components.modelNotAvailable.noModelsDownloaded}
          </Text>
          <Button onPress={handleNavigateToModels} mode="contained-tonal">
            {l10n.components.modelNotAvailable.downloadAModel}
          </Button>
        </View>
      );
    }

    // If both models are not downloaded or missing, show both download options
    if (
      (primaryModel && !isPrimaryModelDownloaded) ||
      (secondaryModel && !isSecondaryModelDownloaded) ||
      isSecondaryModelMissing
    ) {
      return (
        <View style={styles.modelNotDownloaded}>
          {/* Vision Model Section */}
          {primaryModel && !isPrimaryModelDownloaded && (
            <>
              <Text style={{color: theme.colors.error}}>
                Vision model required for Lookie Pal is not downloaded
              </Text>

              {isPrimaryDownloading ? (
                <>
                  <ProgressBar
                    testID="download-progress-bar"
                    progress={primaryDownloadProgress}
                    color={theme.colors.tertiary}
                    style={styles.progressBar}
                  />
                  {primaryDownloadSpeed && (
                    <Paragraph>{primaryDownloadSpeed}</Paragraph>
                  )}
                </>
              ) : null}

              <Button
                onPress={() =>
                  isPrimaryDownloading
                    ? modelStore.cancelDownload(primaryModel.id)
                    : handleDownloadModel(primaryModel)
                }
                mode="contained-tonal"
                style={{marginBottom: 16}}>
                {isPrimaryDownloading
                  ? l10n.components.modelNotAvailable.cancelDownload
                  : 'Download Vision Model'}
              </Button>
            </>
          )}

          {/* Projection Model Section */}
          {((secondaryModel && !isSecondaryModelDownloaded) ||
            isSecondaryModelMissing) && (
            <>
              <Text style={{color: theme.colors.error}}>
                {secondaryModel
                  ? 'Projection model required for Lookie Pal is not downloaded'
                  : 'Selected projection model is not available - please download it from the Models screen'}
              </Text>

              {secondaryModel && isSecondaryDownloading ? (
                <>
                  <ProgressBar
                    testID="download-progress-bar"
                    progress={secondaryDownloadProgress}
                    color={theme.colors.tertiary}
                    style={styles.progressBar}
                  />
                  {secondaryDownloadSpeed && (
                    <Paragraph>{secondaryDownloadSpeed}</Paragraph>
                  )}
                </>
              ) : null}

              <Button
                onPress={() => {
                  if (isSecondaryDownloading && secondaryModel) {
                    modelStore.cancelDownload(secondaryModel.id);
                  } else if (secondaryModel) {
                    handleDownloadModel(secondaryModel);
                  } else if (secondaryModelId) {
                    // If we have the ID but not the model, navigate to models screen
                    handleNavigateToModels();
                  }
                }}
                mode="contained-tonal">
                {isSecondaryDownloading
                  ? l10n.components.modelNotAvailable.cancelDownload
                  : secondaryModel
                  ? 'Download Projection Model'
                  : 'Go to Models Screen'}
              </Button>
            </>
          )}
        </View>
      );
    }

    return null;
  },
);
