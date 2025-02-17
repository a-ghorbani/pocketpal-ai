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

import {Divider} from '../../../components';

import {useTheme, useMemoryCheck, useStorageCheck} from '../../../hooks';

import {createStyles} from './styles';

import {uiStore, modelStore} from '../../../store';

import {Model, ModelOrigin, RootDrawerParamList} from '../../../utils/types';
import {
  getModelDescription,
  L10nContext,
  checkModelFileIntegrity,
} from '../../../utils';

type ChatScreenNavigationProp = DrawerNavigationProp<RootDrawerParamList>;

interface ModelCardProps {
  model: Model;
  activeModelId?: string;
  onFocus?: () => void;
  onOpenSettings?: () => void;
}

export const ModelCard: React.FC<ModelCardProps> = observer(
  ({model, activeModelId, onOpenSettings}) => {
    const l10n = React.useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);

    const navigation = useNavigation<ChatScreenNavigationProp>();

    const [snackbarVisible, setSnackbarVisible] = useState(false); // Snackbar visibility
    const [integrityError, setIntegrityError] = useState<string | null>(null);

    const {memoryWarning, shortMemoryWarning} = useMemoryCheck(model);
    const {isOk: storageOk, message: storageNOkMessage} =
      useStorageCheck(model);

    const isActiveModel = activeModelId === model.id;
    const isDownloaded = model.isDownloaded;
    const isDownloading = modelStore.isDownloading(model.id);
    const isHfModel = model.origin === ModelOrigin.HF;

    // Check integrity when model is downloaded
    useEffect(() => {
      if (isDownloaded) {
        checkModelFileIntegrity(model, modelStore).then(({errorMessage}) => {
          setIntegrityError(errorMessage);
        });
      } else {
        setIntegrityError(null);
      }
    }, [isDownloaded, model]);

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

      return (
        <Button
          testID={isActiveModel ? 'offload-button' : 'load-button'}
          icon={isActiveModel ? 'eject' : 'play-circle-outline'}
          mode="text"
          onPress={handlePress}
          // disabled={!!integrityError} // for now integrity check is experimental. So won't disable the button
          style={styles.actionButton}>
          {isActiveModel ? l10n.offload : l10n.load}
        </Button>
      );
    };

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

              {/* Display integrity warning if check fails */}
              {integrityError && (
                <TouchableRipple
                  testID="integrity-warning-button"
                  //onPress={handleWarningPress}
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

              {isDownloading && (
                <>
                  <ProgressBar
                    testID="download-progress-bar"
                    progress={model.progress / 100}
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
                    onPress={onOpenSettings}>
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
      </>
    );
  },
);
