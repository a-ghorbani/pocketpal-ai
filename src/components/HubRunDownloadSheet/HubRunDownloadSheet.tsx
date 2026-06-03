import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {Text, Button, ActivityIndicator} from 'react-native-paper';

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {hfStore, modelStore} from '../../store';
import {L10nContext, formatBytes, resolveHFModelForDownload} from '../../utils';
import {HuggingFaceModel, ModelFile} from '../../utils/types';
import {HubRunRequest} from '../../services/hubRunLink';

import {createStyles} from './styles';

interface HubRunDownloadSheetProps {
  request: HubRunRequest | null;
  onClose: () => void;
}

type ResolvedModel = {hfModel: HuggingFaceModel; modelFile: ModelFile};

// Common GGUF quantization tokens (e.g. Q4_K_M, IQ4_NL, Q8_0, F16).
const QUANT_RE = /\b(I?Q\d+(?:_[A-Z0-9]+)*|BF16|F16|F32)\b/i;

const extractQuant = (filename: string): string | undefined => {
  const match = filename.match(QUANT_RE);
  return match ? match[0].toUpperCase() : undefined;
};

export const HubRunDownloadSheet: React.FC<HubRunDownloadSheetProps> = ({
  request,
  onClose,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const [resolved, setResolved] = useState<ResolvedModel | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const resolve = React.useCallback(async () => {
    if (!request) {
      return;
    }
    setIsResolving(true);
    setError(null);
    setResolved(null);
    try {
      const authToken = hfStore.shouldUseToken ? hfStore.hfToken : undefined;
      const result = await resolveHFModelForDownload(
        request.repoId,
        request.filename,
        authToken,
      );
      setResolved(result);
    } catch (e) {
      console.error('Failed to resolve hub/run model:', e);
      setError(l10n.models.hubRun.resolveError);
    } finally {
      setIsResolving(false);
    }
  }, [request, l10n]);

  useEffect(() => {
    if (request) {
      resolve();
    } else {
      setResolved(null);
      setError(null);
      setIsResolving(false);
      setIsDownloading(false);
    }
  }, [request, resolve]);

  const handleDownload = async () => {
    if (!resolved) {
      return;
    }
    setIsDownloading(true);
    try {
      await modelStore.downloadHFModel(resolved.hfModel, resolved.modelFile, {
        enableVision: false,
      });
      onClose();
    } catch (e) {
      console.error('Download failed:', e);
      setError(l10n.models.hubRun.resolveError);
    } finally {
      setIsDownloading(false);
    }
  };

  const filename = request?.filename ?? '';
  const quant = extractQuant(filename);
  const sizeBytes = resolved?.modelFile.size ?? 0;

  return (
    <Sheet
      isVisible={request !== null}
      onClose={onClose}
      title={l10n.models.hubRun.title}
      snapPoints={['45%']}>
      <Sheet.ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.headerText} testID="hub-run-repo-id">
          {request?.repoId}
        </Text>

        {isResolving && (
          <View style={styles.centered} testID="hub-run-resolving">
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.detailValue}>{filename}</Text>
          </View>
        )}

        {!isResolving && error && (
          <View style={styles.centered} testID="hub-run-error">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!isResolving && !error && resolved && (
          <View testID="hub-run-ready">
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{filename}</Text>
              <Text style={styles.detailValue}>
                {sizeBytes > 0 ? formatBytes(sizeBytes) : ''}
              </Text>
            </View>
            {quant && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>
                  {l10n.models.hubRun.quantLabel}
                </Text>
                <Text style={styles.detailValue}>{quant}</Text>
              </View>
            )}
          </View>
        )}
      </Sheet.ScrollView>

      <Sheet.Actions style={styles.actionsContainer}>
        <Button
          mode="text"
          onPress={onClose}
          disabled={isDownloading}
          testID="hub-run-cancel">
          {l10n.models.hubRun.cancel}
        </Button>
        {error ? (
          <Button
            mode="contained"
            onPress={resolve}
            disabled={isResolving || isDownloading}
            testID="hub-run-retry">
            {l10n.models.hubRun.retry}
          </Button>
        ) : (
          <Button
            mode="contained"
            onPress={handleDownload}
            loading={isDownloading}
            disabled={!resolved || isResolving || isDownloading}
            testID="hub-run-download">
            {isDownloading ? (
              <ActivityIndicator size="small" color={theme.colors.onPrimary} />
            ) : (
              l10n.models.hubRun.download
            )}
          </Button>
        )}
      </Sheet.Actions>
    </Sheet>
  );
};
