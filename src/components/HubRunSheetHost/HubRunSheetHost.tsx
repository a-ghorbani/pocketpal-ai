import React, {useCallback, useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react';
import {Text, Button, ActivityIndicator} from 'react-native-paper';

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {hfStore} from '../../store';
import {useHubRunSheet} from '../../hooks/useDeepLinking';
import {
  L10nContext,
  enrichSiblingsWithStorage,
  resolveHFRepo,
} from '../../utils';
import {HuggingFaceModel} from '../../utils/types';
import {DetailsView} from '../../screens/ModelsScreen/HFModelSearch/DetailsView';

import {createStyles} from './styles';

/**
 * Global host for the `pocketpal://hub/run` route. Sits inside
 * BottomSheetModalProvider, observes the parked request, resolves the full repo
 * and presents the existing DetailsView (full quant list). The user picks a file
 * there; per-file download/progress is owned by ModelFileCard. Dismiss clears
 * the parked request (consumed-once).
 */
export const HubRunSheetHost: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const {pendingHubRun, clearPendingHubRun} = useHubRunSheet();

  const [resolved, setResolved] = useState<HuggingFaceModel | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoId = pendingHubRun?.repoId;

  const resolve = useCallback(async () => {
    if (!repoId) {
      return;
    }
    setIsResolving(true);
    setError(null);
    setResolved(null);
    try {
      const authToken = hfStore.shouldUseToken ? hfStore.hfToken : undefined;
      const hfModel = await resolveHFRepo(repoId, authToken);
      // Compute per-file storage availability so DetailsView's download button
      // gate (canFitInStorage) is set, mirroring the HF search path.
      const siblings = await enrichSiblingsWithStorage(
        hfModel,
        hfModel.siblings,
      );
      setResolved({...hfModel, siblings});
    } catch (e) {
      console.error('Failed to resolve hub/run repo:', e);
      setError(l10n.models.hubRun.resolveError);
    } finally {
      setIsResolving(false);
    }
  }, [repoId, l10n]);

  useEffect(() => {
    if (repoId) {
      resolve();
    } else {
      setResolved(null);
      setError(null);
      setIsResolving(false);
    }
  }, [repoId, resolve]);

  return (
    <Sheet
      isVisible={pendingHubRun !== null}
      onClose={clearPendingHubRun}
      title={l10n.models.hubRun.title}
      snapPoints={['90%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      // Prevent gesture conflicts with the DetailsView list scroll (Android).
      enableContentPanningGesture={false}
      showCloseButton={true}>
      {isResolving && (
        <View style={styles.centered} testID="hub-run-resolving">
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.repoId}>{repoId}</Text>
        </View>
      )}

      {!isResolving && error && (
        <View style={styles.centered} testID="hub-run-error">
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorActions}>
            <Button
              mode="text"
              onPress={clearPendingHubRun}
              testID="hub-run-cancel">
              {l10n.models.hubRun.cancel}
            </Button>
            <Button mode="contained" onPress={resolve} testID="hub-run-retry">
              {l10n.models.hubRun.retry}
            </Button>
          </View>
        </View>
      )}

      {!isResolving && !error && resolved && (
        <View style={styles.list} testID="hub-run-ready">
          <DetailsView hfModel={resolved} />
        </View>
      )}
    </Sheet>
  );
});
