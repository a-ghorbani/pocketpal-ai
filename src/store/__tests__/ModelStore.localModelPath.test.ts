jest.unmock('../../store');
import {runInAction} from 'mobx';

import {Model, ModelOrigin} from '../../utils/types';
import {createModel} from '../../../jest/fixtures/models';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {modelStore} from '..';
import {MODEL_LIST_VERSION} from '../ModelStore';

// Mock the download manager: checkFileExists consults isDownloading before
// marking a model as present.
jest.mock('../../services/downloads', () => {
  class MockDownloadCancelledError extends Error {
    modelId: string;
    constructor(modelId: string) {
      super(`Download cancelled for ${modelId}`);
      this.name = 'DownloadCancelledError';
      this.modelId = modelId;
    }
  }
  return {
    DownloadCancelledError: MockDownloadCancelledError,
    downloadManager: {
      isDownloading: jest.fn().mockReturnValue(false),
      startDownload: jest.fn(),
      cancelDownload: jest.fn(),
      setCallbacks: jest.fn(),
      syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
    },
  };
});

// Keep the device-rules network boundary and signal read deterministic, matching
// the main ModelStore suite.
jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../services/deviceRules/signals', () => ({
  readDeviceSignals: jest
    .fn()
    .mockResolvedValue({ramBytes: 8 * 1e9, socModel: 'SM8850'}),
}));

const DOCS = '/path/to/documents';

const createLocalModel = (fullPath: string): Model =>
  createModel({
    id: 'local-1',
    name: 'my-local-model.gguf',
    filename: 'my-local-model.gguf',
    origin: ModelOrigin.LOCAL,
    isLocal: true,
    isDownloaded: true,
    downloadUrl: '',
    fullPath,
  }) as Model;

describe('ModelStore local model path handling (#684)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS as any).__resetMockState?.();
    modelStore.models = [];
  });

  describe('resolveLocalModelPath', () => {
    it('returns the stored path unchanged when the file is present', async () => {
      const storedPath = `${DOCS}/models/local/my-local-model.gguf`;
      const model = createLocalModel(storedPath);
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const resolved = await modelStore.resolveLocalModelPath(model);

      expect(resolved).toBe(storedPath);
      expect(model.fullPath).toBe(storedPath);
    });

    it('re-anchors a stale iOS container path onto the current documents path', async () => {
      // Path captured under a previous app container UUID.
      const stalePath =
        '/var/mobile/Containers/Data/Application/OLD-UUID/Documents/models/local/my-local-model.gguf';
      const recoveredPath = `${DOCS}/models/local/my-local-model.gguf`;
      const model = createLocalModel(stalePath);

      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(path === recoveredPath),
      );

      const resolved = await modelStore.resolveLocalModelPath(model);

      expect(resolved).toBe(recoveredPath);
      // Persistence is batched and flushed by refreshDownloadStatuses, so the
      // resolve call itself does not rewrite the stored path (the "survives a
      // reload" persistence is proven through refreshDownloadStatuses below).
      expect(model.fullPath).toBe(stalePath);
    });

    it('returns the stored path when the file is absent at both locations', async () => {
      const stalePath =
        '/var/mobile/Containers/Data/Application/OLD-UUID/Documents/models/local/gone.gguf';
      const model = createLocalModel(stalePath);
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const resolved = await modelStore.resolveLocalModelPath(model);

      expect(resolved).toBe(stalePath);
      expect(model.fullPath).toBe(stalePath);
    });

    it('leaves paths outside the managed local directory untouched', async () => {
      // Imported models live under models/local; anything else has no stable
      // suffix to re-anchor, so it must not be rewritten.
      const outsidePath = '/some/other/place/my-local-model.gguf';
      const model = createLocalModel(outsidePath);
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const resolved = await modelStore.resolveLocalModelPath(model);

      expect(resolved).toBe(outsidePath);
      expect(model.fullPath).toBe(outsidePath);
    });
  });

  describe('refreshDownloadStatuses', () => {
    it('awaits every check so isDownloaded is settled when it resolves', async () => {
      const model = createLocalModel(`${DOCS}/models/local/a.gguf`);
      runInAction(() => {
        modelStore.models = [{...model, isDownloaded: false} as Model];
      });
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      await modelStore.refreshDownloadStatuses();

      // Would still be false if the per-model checks were left in flight.
      expect(modelStore.models[0].isDownloaded).toBe(true);
    });

    it('mergeModelLists returns a promise that settles the status checks', async () => {
      // initializeStore awaits mergeModelLists before finalizing the migration,
      // so the status work must be reachable through its return value rather
      // than left as a floating promise.
      runInAction(() => {
        modelStore.models = [
          {
            ...createLocalModel(`${DOCS}/models/local/merged.gguf`),
            isDownloaded: false,
          } as Model,
        ];
      });
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      await modelStore.mergeModelLists();

      expect(modelStore.models[0].isDownloaded).toBe(true);
    });

    it('leaves isDownloaded untouched when a check throws, and still evaluates the rest', async () => {
      // The broken model starts present. A rejected exists() is indeterminate,
      // not proof the file is gone, so isDownloaded must survive the failure -
      // flipping it to false in the catch (the exact regression this guards)
      // would make this go red.
      const broken = createLocalModel(`${DOCS}/models/local/broken.gguf`);
      const healthyPath = `${DOCS}/models/local/healthy.gguf`;
      const healthy = createLocalModel(healthyPath);
      healthy.id = 'local-2';

      runInAction(() => {
        modelStore.models = [
          {...broken, isDownloaded: true} as Model,
          {...healthy, isDownloaded: false} as Model,
        ];
      });

      (RNFS.exists as jest.Mock).mockImplementation((path: string) => {
        if (path.includes('broken')) {
          return Promise.reject(new Error('RNFS blew up'));
        }
        return Promise.resolve(path === healthyPath);
      });

      await expect(
        modelStore.refreshDownloadStatuses(),
      ).resolves.toBeUndefined();

      // Indeterminate check → left as seeded; the healthy check still ran.
      expect(modelStore.models[0].isDownloaded).toBe(true);
      expect(modelStore.models[1].isDownloaded).toBe(true);
    });
  });

  describe('removeInvalidLocalModels', () => {
    it('keeps a local model whose stale path was recovered', async () => {
      const stalePath =
        '/var/mobile/Containers/Data/Application/OLD-UUID/Documents/models/local/my-local-model.gguf';
      const recoveredPath = `${DOCS}/models/local/my-local-model.gguf`;

      runInAction(() => {
        modelStore.models = [
          {...createLocalModel(stalePath), isDownloaded: false} as Model,
        ];
      });

      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(path === recoveredPath),
      );

      // The real startup order: settle statuses (which recovers the path),
      // then prune.
      await modelStore.refreshDownloadStatuses();
      modelStore.removeInvalidLocalModels();

      expect(modelStore.models).toHaveLength(1);
      expect(modelStore.models[0].fullPath).toBe(recoveredPath);
    });

    it('keeps a local model whose file check could not be determined', async () => {
      // An RNFS failure is indeterminate, not absence: the model stays
      // downloaded and must not be pruned as if the file were gone. If the
      // failing check flipped isDownloaded to false, this model would be
      // dropped here and the length assertion would fail.
      const model = createLocalModel(`${DOCS}/models/local/indeterminate.gguf`);
      runInAction(() => {
        modelStore.models = [{...model, isDownloaded: true} as Model];
      });
      (RNFS.exists as jest.Mock).mockRejectedValue(new Error('RNFS blew up'));

      await modelStore.refreshDownloadStatuses();
      modelStore.removeInvalidLocalModels();

      expect(modelStore.models).toHaveLength(1);
    });

    it('still removes a local model whose file is genuinely gone', async () => {
      runInAction(() => {
        modelStore.models = [
          {
            ...createLocalModel(`${DOCS}/models/local/gone.gguf`),
            isDownloaded: false,
          } as Model,
        ];
      });
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      await modelStore.refreshDownloadStatuses();
      modelStore.removeInvalidLocalModels();

      expect(modelStore.models).toHaveLength(0);
    });

    it('never removes non-local models regardless of download state', () => {
      const hfModel = createModel({
        id: 'hf-1',
        origin: ModelOrigin.HF,
        isLocal: false,
        isDownloaded: false,
      }) as Model;
      runInAction(() => {
        modelStore.models = [hfModel];
      });

      modelStore.removeInvalidLocalModels();

      expect(modelStore.models).toHaveLength(1);
    });
  });

  describe('initializeStore steady-state launch', () => {
    afterEach(async () => {
      // initializeStore fires several un-awaited background tasks; let them
      // settle so they cannot bleed into the next test.
      await new Promise(resolve => setTimeout(resolve, 50));
      runInAction(() => {
        modelStore.models = [];
        modelStore.version = undefined;
      });
    });

    it('settles the status checks before pruning, so a recoverable local model survives a launch', async () => {
      // The branch every launch after the one-time migration takes. The tests
      // above drive refreshDownloadStatuses and removeInvalidLocalModels by
      // hand, which proves they compose - not that initializeStore calls them
      // in that order. Pruning before the checks settle is exactly the reported
      // bug, so assert the ordering where production actually performs it.
      const stalePath =
        '/var/mobile/Containers/Data/Application/OLD-UUID/Documents/models/local/my-local-model.gguf';
      const recoveredPath = `${DOCS}/models/local/my-local-model.gguf`;

      runInAction(() => {
        modelStore.version = MODEL_LIST_VERSION;
        modelStore.availableMemoryCeiling = 1;
        modelStore.models = [
          {...createLocalModel(stalePath), isDownloaded: false} as Model,
        ];
      });

      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(path === recoveredPath),
      );

      await modelStore.initializeStore();

      const local = modelStore.models.find(m => m.id === 'local-1');
      expect(local).toBeDefined();
      expect(local?.fullPath).toBe(recoveredPath);
    });
  });
});
