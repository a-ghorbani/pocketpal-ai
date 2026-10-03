import {chatSessionStore} from '../store/ChatSessionStore';
import {modelStore} from '../store/ModelStore';
import {palStore} from '../store/PalStore';
import {serverStore} from '../store/ServerStore';
import {
  StartupModelSelection,
  startupSelectionStore,
} from '../store/StartupSelectionStore';
import {
  credentialRevisionOf,
  normalizeServerUrl,
} from './remote/remoteModelState';
import {ModelOrigin} from '../utils/types';

const remoteSelectionIsCurrent = (
  selection: StartupModelSelection,
): boolean => {
  const model = modelStore.remoteModels.find(
    candidate => candidate.id === selection.modelId,
  );
  const server = model?.serverId
    ? serverStore.servers.find(candidate => candidate.id === model.serverId)
    : undefined;
  const savedServer = selection.remoteServer;
  const advertisedModels = model?.serverId
    ? serverStore.serverModels.get(model.serverId)
    : undefined;

  return (
    selection.origin === ModelOrigin.REMOTE &&
    model?.origin === ModelOrigin.REMOTE &&
    !!server &&
    !!savedServer &&
    normalizeServerUrl(server.url) === savedServer.normalizedUrl &&
    server.serverType === savedServer.serverType &&
    credentialRevisionOf(server) === savedServer.credentialRevision &&
    (!advertisedModels ||
      advertisedModels.some(
        candidate => candidate.id === model.remoteModelId,
      )) &&
    serverStore.resolveRemoteModelProtocol(selection.modelId).supported
  );
};

const restoreRememberedModel = async (
  selection: StartupModelSelection,
  selectModel: typeof modelStore.selectModel,
): Promise<void> => {
  const model = modelStore.displayModels.find(
    candidate => candidate.id === selection.modelId,
  );
  if (!model || model.origin !== selection.origin) {
    throw new Error('Remembered model is no longer available');
  }

  if (selection.origin === ModelOrigin.REMOTE) {
    if (!remoteSelectionIsCurrent(selection) || !model.serverId) {
      throw new Error('Remembered remote model configuration changed');
    }
    const connection = await serverStore.testServerConnection(model.serverId);
    if (!connection.ok || !remoteSelectionIsCurrent(selection)) {
      throw new Error('Remembered remote model is unavailable');
    }
  }

  await selectModel(model);
};

export const restoreStartupSelection = async (
  options: {
    selectModel?: typeof modelStore.selectModel;
  } = {},
): Promise<void> => {
  if (startupSelectionStore.restoreAttempted) {
    return;
  }

  startupSelectionStore.markRestoreStarted();
  try {
    if (chatSessionStore.activeSessionId) {
      return;
    }

    if (startupSelectionStore.modelSelection) {
      try {
        await restoreRememberedModel(
          startupSelectionStore.modelSelection,
          options.selectModel ?? modelStore.selectModel,
        );
      } catch (error) {
        startupSelectionStore.markModelRestoreFailed();
        console.warn('[StartupSelection] Failed to restore model:', error);
      }
    }

    if (chatSessionStore.activeSessionId) {
      return;
    }

    if (startupSelectionStore.hasPalPreference) {
      const palId = startupSelectionStore.palId;
      if (palId && !palStore.pals.some(pal => pal.id === palId)) {
        startupSelectionStore.clearPalPreference();
        await chatSessionStore.setActivePal(undefined);
      } else {
        await chatSessionStore.setActivePal(palId);
      }
    }
  } finally {
    startupSelectionStore.markRestoreFinished();
  }
};
