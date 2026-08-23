import {makeAutoObservable} from 'mobx';

import {EMBEDDING_PRESETS} from '../../src/utils/rag/presets';

/**
 * Mock KnowledgeBaseStore mirroring the shape SettingsScreen and the
 * KnowledgeBaseScreen read: persisted settings flags, preset accessors
 * and jest.fn() mutators. The real store touches RNFS/llama.rn at
 * construction time, which jest environments cannot run.
 */
class MockKnowledgeBaseStore {
  enabled = false;
  embeddingPresetId = EMBEDDING_PRESETS[0].id;
  autoIndexThresholdChars = 20_000;
  chunkChars = 1_400;
  topK = 8;
  minCosine = 0.25;
  includeInAllChats = false;

  documents: any[] = [];
  isIndexing = false;
  indexingProgress = {name: '', done: 0, total: 0};
  isDownloadingModel = false;
  downloadProgress = 0;
  lastError: string | null = null;

  setEnabled: jest.Mock;
  setTopK: jest.Mock;
  setMinCosine: jest.Mock;
  setAutoIndexThreshold: jest.Mock;
  setPreset: jest.Mock;
  downloadEmbeddingModel: jest.Mock;
  deleteEmbeddingModel: jest.Mock;
  isModelDownloaded: jest.Mock;
  refreshDocuments: jest.Mock;
  indexDocument: jest.Mock;
  deleteDocument: jest.Mock;
  query: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      setEnabled: false,
      setTopK: false,
      setMinCosine: false,
      setAutoIndexThreshold: false,
      setPreset: false,
      downloadEmbeddingModel: false,
      deleteEmbeddingModel: false,
      isModelDownloaded: false,
      refreshDocuments: false,
      indexDocument: false,
      deleteDocument: false,
      query: false,
    });

    this.setEnabled = jest.fn((v: boolean) => {
      this.enabled = v;
    });
    this.setTopK = jest.fn((v: number) => {
      this.topK = v;
    });
    this.setMinCosine = jest.fn((v: number) => {
      this.minCosine = v;
    });
    this.setAutoIndexThreshold = jest.fn((v: number) => {
      this.autoIndexThresholdChars = v;
    });
    this.setPreset = jest.fn((id: string) => {
      this.embeddingPresetId = id;
    });
    this.isModelDownloaded = jest.fn(async () => false);
    this.downloadEmbeddingModel = jest.fn(async () => undefined);
    this.deleteEmbeddingModel = jest.fn(async () => undefined);
    this.refreshDocuments = jest.fn(async () => undefined);
    this.indexDocument = jest.fn(async () => ({id: 'doc-1'}));
    this.deleteDocument = jest.fn(async () => undefined);
    this.query = jest.fn(async () => []);
  }

  get preset() {
    return (
      EMBEDDING_PRESETS.find(p => p.id === this.embeddingPresetId) ??
      EMBEDDING_PRESETS[0]
    );
  }
}

export const mockKnowledgeBaseStore = new MockKnowledgeBaseStore();
