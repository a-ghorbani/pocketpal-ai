import {Platform, Alert} from 'react-native';

import {format} from 'date-fns';
import Share from 'react-native-share';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';

import {uiStore, palStore, modelStore} from '../store';
import {ensureLegacyStoragePermission} from './androidPermission';
import {getAbsoluteThumbnailPath, isLocalThumbnailPath} from './imageUtils';
import type {Pal} from '../types/pal';
import type {Model} from './types';
/**
 * Export a single chat session to a JSON file
 * @param sessionId The ID of the session to export
 */
export const exportChatSession = async (sessionId: string): Promise<void> => {
  try {
    // Get the session data
    const sessionData = await chatSessionRepository.getSessionById(sessionId);
    if (!sessionData) {
      throw new Error('Session not found');
    }

    // Format the session data for export
    const {session, messages, completionSettings} = sessionData;

    const exportData = {
      id: session.id,
      title: session.title,
      date: session.date,
      messages: messages.map(msg => ({
        id: msg.id,
        author: msg.author,
        text: msg.text,
        type: msg.type,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : {},
        createdAt: msg.createdAt,
      })),
      completionSettings: completionSettings
        ? JSON.parse(completionSettings.settings)
        : {},
      activePalId: session.activePalId,
    };

    // Create a filename with the session title and date
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const sanitizedTitle = session.title
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase();
    const filename = `chat_${sanitizedTitle}_${timestamp}.json`;

    // Convert to JSON
    const jsonData = JSON.stringify(exportData, null, 2);

    // Share the file
    await shareJsonData(jsonData, filename);
  } catch (error) {
    console.error('Error exporting chat session:', error);
    throw error;
  }
};

/**
 * Export all chat sessions to a JSON file
 */
export const exportAllChatSessions = async (): Promise<void> => {
  try {
    // Get all sessions
    const sessions = await chatSessionRepository.getAllSessions();

    // Create an array to hold all exported sessions
    const exportData: any[] = [];

    // Process each session
    for (const session of sessions) {
      const sessionData = await chatSessionRepository.getSessionById(
        session.id,
      );
      if (sessionData) {
        const {
          session: sessionInfo,
          messages,
          completionSettings,
        } = sessionData;

        exportData.push({
          id: sessionInfo.id,
          title: sessionInfo.title,
          date: sessionInfo.date,
          messages: messages.map(msg => ({
            id: msg.id,
            author: msg.author,
            text: msg.text,
            type: msg.type,
            metadata: msg.metadata ? JSON.parse(msg.metadata) : {},
            createdAt: msg.createdAt,
          })),
          completionSettings: completionSettings
            ? JSON.parse(completionSettings.settings)
            : {},
          activePalId: sessionInfo.activePalId,
        });
      }
    }

    // Create a filename with the current date
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const filename = `all_chat_sessions_${timestamp}.json`;

    // Convert to JSON
    const jsonData = JSON.stringify(exportData, null, 2);

    // Share the file
    await shareJsonData(jsonData, filename);
  } catch (error) {
    console.error('Error exporting all chat sessions:', error);
    throw error;
  }
};

/**
 * Export a single pal to a JSON file
 * @param palId The ID of the pal to export
 */
export const exportPal = async (palId: string): Promise<void> => {
  try {
    const pal = palStore.getPals().find(p => p.id === palId);
    if (!pal) {
      throw new Error('Pal not found');
    }

    const exportData = await transformExportPal(pal);

    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const sanitizedName = pal.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `pal_${sanitizedName}_v${exportData.version}_${timestamp}.json`;

    const jsonData = JSON.stringify(exportData, null, 2);

    await shareJsonData(jsonData, filename);
  } catch (error) {
    console.error('Error exporting pal:', error);
    throw error;
  }
};

/**
 * Export all pals to a JSON file
 */
export const exportAllPals = async (): Promise<void> => {
  try {
    const pals = palStore.getPals();
    const exportData = pals.map(transformExportPal);

    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const filename = `all_pals_${timestamp}.json`;

    const jsonData = JSON.stringify(exportData, null, 2);

    await shareJsonData(jsonData, filename);
  } catch (error) {
    console.error('Error exporting all pals:', error);
    throw error;
  }
};

/**
 * Share downloaded model files directly from local storage.
 * If a projection model is provided, both files are shared together.
 */
export const exportModelFiles = async (
  model: Model,
  projectionModel?: Model,
): Promise<void> => {
  const currentL10n = uiStore.l10n;

  try {
    const primaryPath = await modelStore.getModelFullPath(model);
    const primaryExists = await RNFS.exists(primaryPath);

    if (!primaryExists) {
      throw new Error(`Model file not found: ${model.filename}`);
    }

    const fileEntries = [{path: primaryPath}];
    let missingProjection = false;

    if (projectionModel && projectionModel.id !== model.id) {
      const projectionPath = await modelStore.getModelFullPath(projectionModel);
      const projectionExists = await RNFS.exists(projectionPath);

      if (projectionExists) {
        fileEntries.push({path: projectionPath});
      } else {
        missingProjection = true;
      }
    }

    // Share from cache copies instead of app-private original paths.
    // Some receiver apps cannot read direct /data/user/0/... files and treat them as empty.
    const shareSessionId = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const shareDir = `${RNFS.CachesDirectoryPath}/model-share/${shareSessionId}`;
    await RNFS.mkdir(shareDir);

    const sharedFileEntries: Array<{
      path: string;
      filename: string;
      size: number;
    }> = [];
    for (const file of fileEntries) {
      const sourcePath = file.path;
      const sourceName = sourcePath.split('/').pop() || 'model.gguf';
      const sourceStat = await RNFS.stat(sourcePath);
      const sourceSize = Number(sourceStat.size || 0);
      if (sourceSize <= 0) {
        throw new Error(`Model file is empty: ${sourceName}`);
      }

      const targetPath = `${shareDir}/${sourceName}`;
      await RNFS.copyFile(sourcePath, targetPath);
      const targetStat = await RNFS.stat(targetPath);
      const targetSize = Number(targetStat.size || 0);
      if (targetSize <= 0) {
        throw new Error(`Copied share file is empty: ${sourceName}`);
      }

      sharedFileEntries.push({
        path: targetPath,
        filename: sourceName,
        size: targetSize,
      });
    }

    const urls = sharedFileEntries.map(file => `file://${file.path}`);
    const title =
      sharedFileEntries.length > 1
        ? currentL10n.models.modelCard.labels.shareModelFiles
        : currentL10n.models.modelCard.labels.shareModelFile;

    console.log('[ModelShare] Sharing model files:', {
      modelId: model.id,
      modelName: model.name,
      files: sharedFileEntries,
    });

    await Share.open({
      title,
      ...(urls.length === 1 ? {url: urls[0]} : {urls}),
      type: '*/*',
      ...(Platform.OS === 'android' ? {useInternalStorage: true} : {}),
      failOnCancel: false,
    });

    if (missingProjection) {
      Alert.alert(
        currentL10n.models.modelCard.alerts.projectionMissingTitle,
        currentL10n.models.modelCard.alerts.projectionMissingMessage,
        [{text: currentL10n.common.ok}],
      );
    }
  } catch (error) {
    console.error('Error exporting model files:', error);
    throw error;
  }
};

/**
 * Clear cached files created for model sharing.
 * Only removes the dedicated model-share cache directory.
 */
export const clearModelShareCache = async (): Promise<number> => {
  const shareRoot = `${RNFS.CachesDirectoryPath}/model-share`;
  const exists = await RNFS.exists(shareRoot);
  if (!exists) {
    return 0;
  }

  const entries = await RNFS.readDir(shareRoot);
  let removedCount = 0;

  for (const entry of entries) {
    await RNFS.unlink(entry.path);
    removedCount += 1;
  }

  return removedCount;
};

/**
 * Get total byte size of cached files created for model sharing.
 */
export const getModelShareCacheSizeBytes = async (): Promise<number> => {
  const shareRoot = `${RNFS.CachesDirectoryPath}/model-share`;
  const exists = await RNFS.exists(shareRoot);
  if (!exists) {
    return 0;
  }

  const entries = await RNFS.readDir(shareRoot);
  let totalBytes = 0;

  const walk = async (path: string): Promise<void> => {
    const stat = await RNFS.stat(path);
    if (stat.isFile()) {
      totalBytes += Number(stat.size || 0);
      return;
    }

    const children = await RNFS.readDir(path);
    for (const child of children) {
      await walk(child.path);
    }
  };

  for (const entry of entries) {
    await walk(entry.path);
  }

  return totalBytes;
};

const transformExportPal = async (pal: Pal) => {
  // Create export data with version information
  // Data Transfer Object (DTO) for exported pal data (format v2.0)

  // Handle thumbnail image - convert local images to base64 for portability
  let thumbnailData: string | undefined;
  let thumbnailUrl: string | undefined = pal.thumbnail_url;

  if (pal.thumbnail_url && isLocalThumbnailPath(pal.thumbnail_url)) {
    try {
      // Convert local image to base64 for export
      const absolutePath = getAbsoluteThumbnailPath(pal.thumbnail_url);
      const base64Content = await RNFS.readFile(absolutePath, 'base64');

      // Get file extension from original file (fallback to jpg)
      const fileExtension =
        absolutePath.toLowerCase().split('.').pop() || 'jpg';

      thumbnailData = `data:image/${fileExtension};base64,${base64Content}`;
      thumbnailUrl = undefined; // Don't export local file paths
    } catch (error) {
      console.warn('Failed to read thumbnail for export:', error);
      thumbnailUrl = undefined; // Remove invalid local path
    }
  }

  const exportData = {
    // Export format version for future compatibility
    version: '2.0',

    // Core pal data (modern format)
    id: pal.id,
    name: pal.name,
    description: pal.description,
    thumbnail_url: thumbnailUrl, // Remote URLs only
    thumbnail_data: thumbnailData, // Base64 embedded images
    systemPrompt: pal.systemPrompt,
    originalSystemPrompt: pal.originalSystemPrompt,
    isSystemPromptChanged: pal.isSystemPromptChanged,
    useAIPrompt: pal.useAIPrompt,
    defaultModel: pal.defaultModel,
    promptGenerationModel: pal.promptGenerationModel,
    generatingPrompt: pal.generatingPrompt,
    color: pal.color,
    capabilities: pal.capabilities,
    parameters: pal.parameters,
    parameterSchema: pal.parameterSchema,
    source: pal.source,
    palshub_id: pal.palshub_id,
    creator_info: pal.creator_info,
    categories: pal.categories,
    tags: pal.tags,
    rating: pal.rating,
    review_count: pal.review_count,
    protection_level: pal.protection_level,
    price_cents: pal.price_cents,
    is_owned: pal.is_owned,
    generation_settings: pal.completionSettings,
    created_at: pal.created_at,
    updated_at: pal.updated_at,
  };

  return exportData;
};

/**
 * Export legacy chat sessions from JSON file
 */
export const exportLegacyChatSessions = async (): Promise<void> => {
  try {
    // Check if the legacy file exists
    const legacyFilePath = `${RNFS.DocumentDirectoryPath}/session-metadata.json`;
    const exists = await RNFS.exists(legacyFilePath);

    if (!exists) {
      throw new Error('Legacy chat sessions file not found');
    }

    // Read the legacy file
    const legacyData = await RNFS.readFile(legacyFilePath);

    // Create a filename with the current date
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const filename = `legacy_chat_sessions_${timestamp}.json`;

    // Share the file
    await shareJsonData(legacyData, filename);
  } catch (error) {
    console.error('Error exporting legacy chat sessions:', error);
    throw error;
  }
};

/**
 * Helper function to share JSON data as a file
 */
const shareJsonData = async (
  jsonData: string,
  filename: string,
): Promise<void> => {
  const currentL10n = uiStore.l10n;
  try {
    // Create a temporary file
    const tempFilePath = `${RNFS.CachesDirectoryPath}/${filename}`;
    await RNFS.writeFile(tempFilePath, jsonData, 'utf8');

    // Share the file
    if (Platform.OS === 'ios') {
      // On iOS, use react-native-share
      await Share.open({
        url: `file://${tempFilePath}`,
        title: `Share ${filename}`,
        type: 'application/json',
        failOnCancel: false,
      });
    } else if (Platform.OS === 'android' && Platform.Version === 29) {
      // Special handling for Android 10 (API 29)
      // Use direct sharing from temp directory instead of saving to Downloads
      try {
        await Share.open({
          url: `file://${tempFilePath}`,
          title: `Share ${filename}`,
          type: 'application/json',
          failOnCancel: false,
        });
        return; // Exit early after sharing
      } catch (error) {
        console.error('Error sharing on Android 10:', error);
        throw error;
      }
    } else {
      // On Android (not API 29), handle with storage permissions
      const permissionGranted = await ensureLegacyStoragePermission();
      if (!permissionGranted) {
        // If permission denied, fall back to direct sharing
        try {
          await Share.open({
            url: `file://${tempFilePath}`,
            title: `Share ${filename}`,
            type: 'application/json',
            failOnCancel: false,
          });
          return; // Exit early after sharing
        } catch (error) {
          console.error('Error sharing after permission denied:', error);
          throw error;
        }
      }

      try {
        // Save to appropriate directory based on platform
        const saveDir = getSaveDirectory();
        const savePath = `${saveDir}/${filename}`;
        await RNFS.copyFile(tempFilePath, savePath);

        // Show success message with the path
        const fileSavedMsg =
          currentL10n.components.exportUtils.fileSavedMessage.replace(
            '{{filename}}',
            filename,
          );

        Alert.alert(
          currentL10n.components.exportUtils.fileSaved,
          fileSavedMsg,
          [
            {
              text: currentL10n.components.exportUtils.share,
              onPress: async () => {
                // Use react-native-share for both platforms
                try {
                  const options = {
                    title: `Share ${filename}`,
                    message: 'PocketPal AI Chat Export',
                    url: `file://${savePath}`,
                    type: 'application/json',
                    failOnCancel: false,
                  };

                  await Share.open(options);
                } catch (error) {
                  const shareError = error as any;
                  console.error('Error sharing file:', shareError);

                  // Fallback to sharing content directly if file sharing fails
                  if (shareError.message !== 'User did not share') {
                    try {
                      await Share.open({
                        title: `Share ${filename}`,
                        message: jsonData,
                      });
                    } catch (err) {
                      const fallbackError = err as any;
                      console.error(
                        'Error with fallback sharing:',
                        fallbackError,
                      );
                      // Ignore cancellation errors
                      if (fallbackError.message !== 'User did not share') {
                        Alert.alert(
                          currentL10n.components.exportUtils.shareError,
                          currentL10n.components.exportUtils.shareErrorMessage,
                          [{text: currentL10n.components.exportUtils.ok}],
                        );
                      }
                    }
                  }
                }
              },
            },
            {text: currentL10n.components.exportUtils.ok},
          ],
        );
      } catch (error) {
        console.error('Error saving to Downloads:', error);

        // Fallback to just sharing the file content
        Alert.alert(
          currentL10n.components.exportUtils.saveOptions,
          currentL10n.components.exportUtils.saveOptionsMessage,
          [
            {
              text: currentL10n.components.exportUtils.share,
              onPress: async () => {
                // For fallback, share the file content directly
                try {
                  await Share.open({
                    title: `Share ${filename}`,
                    message: jsonData,
                  });
                } catch (err) {
                  const shareError = err as any;
                  console.error('Error sharing content:', shareError);
                  // Ignore cancellation errors
                  if (shareError.message !== 'User did not share') {
                    Alert.alert(
                      currentL10n.components.exportUtils.shareError,
                      currentL10n.components.exportUtils
                        .shareContentErrorMessage,
                      [{text: currentL10n.components.exportUtils.ok}],
                    );
                  }
                }
              },
            },
            {text: currentL10n.components.exportUtils.cancel},
          ],
        );
      }
    }
  } catch (error: any) {
    console.error('Error sharing JSON data:', error);

    // Show a more user-friendly error message
    Alert.alert(
      currentL10n.components.exportUtils.exportError,
      currentL10n.components.exportUtils.exportErrorMessage,
      [{text: currentL10n.components.exportUtils.ok}],
    );

    throw error;
  }
};

/**
 * Get the appropriate directory for saving files
 * @returns The path to the directory
 */
const getSaveDirectory = (): string => {
  if (Platform.OS === 'ios') {
    return RNFS.DocumentDirectoryPath;
  } else {
    return RNFS.DownloadDirectoryPath;
  }
};
