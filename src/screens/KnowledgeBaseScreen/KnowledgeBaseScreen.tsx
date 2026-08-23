import React, {useContext, useEffect, useState} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';

import {observer} from 'mobx-react-lite';
import {
  Text,
  Card,
  Divider,
  Switch,
  Button,
  ActivityIndicator,
  Chip,
  ProgressBar,
} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Sheet} from '../../components';
import {useTheme} from '../../hooks';
import {knowledgeBaseStore as kb, embeddingStore} from '../../store';
import {KbDocument} from '../../database';
import {
  formatByteSize,
  isPendingAttachment,
  pickFileAttachments,
  readAttachmentText,
} from '../../utils/fileAttachments';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

export const KnowledgeBaseScreen: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const [refreshing, setRefreshing] = useState(false);
  const [modelDownloaded, setModelDownloaded] = useState<boolean | null>(null);
  const [previewDoc, setPreviewDoc] = useState<KbDocument | null>(null);
  const [previewChunks, setPreviewChunks] = useState<string[]>([]);

  const t = l10n.settings.knowledgeBase;
  const ts = t.screen;

  const refreshModelState = async () => {
    setModelDownloaded(null);
    setModelDownloaded(await kb.isModelDownloaded());
  };

  useEffect(() => {
    void kb.refreshDocuments();
    void refreshModelState();
    // Re-check download state when the download job finishes.
    const timer = setInterval(() => {
      if (!kb.isDownloadingModel) {
        clearInterval(timer);
        void refreshModelState();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await kb.refreshDocuments();
    await refreshModelState();
    setRefreshing(false);
  };

  const onAddDocument = async () => {
    try {
      const staged = await pickFileAttachments();
      for (const file of staged) {
        if (!isPendingAttachment(file)) {
          continue;
        }
        const text = await readAttachmentText(file);
        if (!text) {
          Alert.alert(
            ts.indexFailed,
            `"${file.name}" has no readable text content.`,
          );
          continue;
        }
        await kb.indexDocument({
          name: file.name,
          mime: file.mime,
          size: file.size,
          text,
          source: 'manual',
        });
      }
    } catch (error) {
      Alert.alert(
        ts.indexFailed,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const onDeleteDocument = (doc: KbDocument) => {
    Alert.alert(
      ts.deleteConfirmTitle,
      ts.deleteConfirmMessage.replace('{{name}}', doc.name),
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: ts.deleteButton,
          style: 'destructive',
          onPress: () => void kb.deleteDocument(doc),
        },
      ],
    );
  };

  const openPreview = async (doc: KbDocument) => {
    setPreviewDoc(doc);
    setPreviewChunks([]);
    try {
      setPreviewChunks(await kb.previewChunks(doc));
    } catch {
      setPreviewChunks([]);
    }
  };

  const readyDocs = kb.documents.filter(d => d.status === 'ready');
  const totalChunks = readyDocs.reduce((sum, d) => sum + d.chunkCount, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {/* --- Enable + embedding model card --- */}
        <Card elevation={0} style={styles.card}>
          <Card.Title title={t.title} />
          <Card.Content>
            <View style={styles.switchRow}>
              <View style={styles.textColumn}>
                <Text variant="titleMedium">{t.enableLabel}</Text>
                <Text variant="labelSmall" style={styles.description}>
                  {t.enableDescription}
                </Text>
              </View>
              <Switch
                testID="kb-enabled-switch"
                value={kb.enabled}
                onValueChange={v => kb.setEnabled(v)}
              />
            </View>
            <Divider style={styles.divider} />

            <Text variant="titleMedium" style={styles.sectionLabel}>
              {t.embeddingModelLabel}
            </Text>
            <Text variant="labelSmall" style={styles.description}>
              {kb.preset.label} - {kb.preset.dims} dims, {kb.preset.sizeMB} MB
            </Text>
            {modelDownloaded === null ? (
              <ActivityIndicator size="small" style={styles.spinner} />
            ) : modelDownloaded ? (
              <View style={styles.rowWrap}>
                <Chip mode="flat" style={styles.chip}>
                  {t.modelReady}
                </Chip>
                <Button
                  compact
                  onPress={() =>
                    Alert.alert(t.deleteModelButton, t.deleteModelConfirm, [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: t.deleteModelButton,
                        style: 'destructive',
                        onPress: () =>
                          void kb
                            .deleteEmbeddingModel()
                            .then(refreshModelState),
                      },
                    ])
                  }>
                  {t.deleteModelButton}
                </Button>
              </View>
            ) : kb.isDownloadingModel ? (
              <View>
                <ProgressBar
                  progress={kb.downloadProgress}
                  style={styles.progressBar}
                />
                <Text variant="labelSmall" style={styles.description}>
                  {t.downloading.replace(
                    '{{percent}}',
                    String(Math.round(kb.downloadProgress * 100)),
                  )}
                </Text>
              </View>
            ) : (
              <Button
                mode="contained"
                compact
                style={styles.button}
                onPress={() =>
                  void kb
                    .downloadEmbeddingModel()
                    .then(refreshModelState)
                    .catch(err =>
                      Alert.alert(
                        t.title,
                        err instanceof Error ? err.message : String(err),
                      ),
                    )
                }>
                {t.downloadButton}
              </Button>
            )}
            {embeddingStore.loadError && (
              <Text variant="labelSmall" style={styles.errorText}>
                {embeddingStore.loadError}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* --- Retrieval settings --- */}
        <Card elevation={0} style={styles.card}>
          <Card.Title
            title={ts.docsCount.replace('{{count}}', String(readyDocs.length))}
          />
          <Card.Content>
            <Text variant="labelSmall" style={styles.description}>
              {ts.totalChunks.replace('{{count}}', String(totalChunks))}
            </Text>

            <View style={styles.switchRow}>
              <View style={styles.textColumn}>
                <Text variant="titleMedium">{t.includeInAllChatsLabel}</Text>
                <Text variant="labelSmall" style={styles.description}>
                  {t.includeInAllChatsDescription}
                </Text>
              </View>
              <Switch
                value={kb.includeInAllChats}
                onValueChange={v => {
                  kb.includeInAllChats = v;
                }}
              />
            </View>

            <Text variant="titleMedium" style={styles.sectionLabel}>
              {t.topKLabel}: {kb.topK}
            </Text>
            <Text variant="labelSmall" style={styles.description}>
              {t.topKDescription}
            </Text>
            <View style={styles.rowWrap}>
              {[4, 8, 12, 16].map(v => (
                <Chip
                  key={v}
                  selected={kb.topK === v}
                  onPress={() => kb.setTopK(v)}
                  style={styles.chip}>
                  {v}
                </Chip>
              ))}
            </View>

            <Text variant="titleMedium" style={styles.sectionLabel}>
              {t.minCosineLabel}: {kb.minCosine.toFixed(2)}
            </Text>
            <Text variant="labelSmall" style={styles.description}>
              {t.minCosineDescription}
            </Text>
            <View style={styles.rowWrap}>
              {[0.15, 0.25, 0.35, 0.45].map(v => (
                <Chip
                  key={v}
                  selected={kb.minCosine === v}
                  onPress={() => kb.setMinCosine(v)}
                  style={styles.chip}>
                  {v.toFixed(2)}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* --- Documents --- */}
        <Card elevation={0} style={styles.card}>
          <Card.Title title={t.title} />
          <Card.Content>
            {kb.isIndexing && (
              <View style={styles.indexingBox}>
                <ProgressBar
                  progress={
                    kb.indexingProgress.total > 0
                      ? kb.indexingProgress.done / kb.indexingProgress.total
                      : 0
                  }
                />
                <Text variant="labelSmall" style={styles.description}>
                  {ts.indexingProgress
                    .replace('{{name}}', kb.indexingProgress.name)
                    .replace('{{done}}', String(kb.indexingProgress.done))
                    .replace('{{total}}', String(kb.indexingProgress.total))}
                </Text>
              </View>
            )}

            {kb.documents.length === 0 && !kb.isIndexing ? (
              <View style={styles.emptyBox}>
                <Text variant="titleSmall">{ts.emptyTitle}</Text>
                <Text variant="labelSmall" style={styles.description}>
                  {ts.emptyDescription}
                </Text>
              </View>
            ) : (
              kb.documents.map(doc => (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.docRow}
                  onPress={() => void openPreview(doc)}>
                  <View style={styles.textColumn}>
                    <Text variant="titleSmall" numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <Text variant="labelSmall" style={styles.description}>
                      {doc.status === 'ready'
                        ? `${doc.chunkCount} ${ts.chunksSuffix} - ${formatByteSize(doc.size)} - ${
                            doc.source === 'attach'
                              ? ts.indexedFromChat
                              : ts.indexedManually
                          }`
                        : `${doc.status}${doc.error ? `: ${doc.error}` : ''}`}
                    </Text>
                  </View>
                  <Button
                    compact
                    onPress={() => onDeleteDocument(doc)}
                    labelStyle={styles.deleteLabel}>
                    {ts.deleteButton}
                  </Button>
                </TouchableOpacity>
              ))
            )}

            <Button
              mode="contained"
              icon="plus"
              style={styles.button}
              disabled={kb.isIndexing}
              onPress={() => void onAddDocument()}>
              {ts.addFileButton}
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* --- Chunk preview sheet --- */}
      <Sheet
        isVisible={previewDoc != null}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.name}
        displayFullHeight>
        <Sheet.ScrollView>
          <Text variant="labelSmall" style={styles.description}>
            {ts.previewTitle}
          </Text>
          {previewChunks.map((chunk, i) => (
            <View key={i} style={styles.chunkBox}>
              <Text variant="labelSmall" style={styles.chunkIndex}>
                {i + 1}
              </Text>
              <Text variant="bodySmall">{chunk}</Text>
            </View>
          ))}
        </Sheet.ScrollView>
      </Sheet>
    </SafeAreaView>
  );
});

export default KnowledgeBaseScreen;
