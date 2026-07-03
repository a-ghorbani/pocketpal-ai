import { makeAutoObservable, observable } from 'mobx';
import { Model, ModelType, ModelOrigin } from '../../utils/types';
import { downloadQueueManager } from './downloads/DownloadQueueManager';
import { getDownloadQueueManager } from './downloads/DownloadQueueManager';

export type ModelCategory = 'all' | 'downloaded' | 'llm' | 'vision' | 'projection' | 'preset' | 'local' | 'hf' | 'remote';
export type ModelSortBy = 'name' | 'size' | 'params' | 'downloads' | 'recent';

export interface ModelCategoryInfo {
  key: ModelCategory;
  label: string;
  icon?: string;
  count: number;
}

export class ModelManager {
  private models: Map<string, Model> = new Map();
  private recentlyUsed: string[] = [];
  private maxRecent: number = 10;

  constructor() {
    makeAutoObservable(this, {
      models: observable.map,
    });
  }

  setModels(models: Model[]): void {
    this.models.clear();
    for (const model of models) {
      this.models.set(model.id, model);
    }
  }

  addModel(model: Model): void {
    this.models.set(model.id, model);
  }

  removeModel(modelId: string): void {
    this.models.delete(modelId);
    this.recentlyUsed = this.recentlyUsed.filter(id => id !== modelId);
  }

  getModel(modelId: string): Model | undefined {
    return this.models.get(modelId);
  }

  getAllModels(): Model[] {
    return Array.from(this.models.values());
  }

  getDownloadedModels(): Model[] {
    return this.getAllModels().filter(m => m.isDownloaded);
  }

  getModelsByCategory(category: ModelCategory): Model[] {
    const all = this.getAllModels();

    switch (category) {
      case 'all':
        return all;
      case 'downloaded':
        return all.filter(m => m.isDownloaded);
      case 'llm':
        return all.filter(m => !m.modelType || m.modelType === ModelType.LLM);
      case 'vision':
        return all.filter(m => m.modelType === ModelType.VISION || m.supportsMultimodal);
      case 'projection':
        return all.filter(m => m.modelType === ModelType.PROJECTION);
      case 'preset':
        return all.filter(m => m.origin === ModelOrigin.PRESET);
      case 'local':
        return all.filter(m => m.origin === ModelOrigin.LOCAL);
      case 'hf':
        return all.filter(m => m.origin === ModelOrigin.HF);
      case 'remote':
        return all.filter(m => m.origin === ModelOrigin.REMOTE);
      default:
        return all;
    }
  }

  getCategories(): ModelCategoryInfo[] {
    const all = this.getAllModels();
    return [
      { key: 'all', label: 'All Models', count: all.length },
      { key: 'downloaded', label: 'Downloaded', count: all.filter(m => m.isDownloaded).length },
      { key: 'llm', label: 'LLM', count: all.filter(m => !m.modelType || m.modelType === ModelType.LLM).length },
      { key: 'vision', label: 'Vision', count: all.filter(m => m.modelType === ModelType.VISION || m.supportsMultimodal).length },
      { key: 'projection', label: 'Projection', count: all.filter(m => m.modelType === ModelType.PROJECTION).length },
    ];
  }

  searchModels(query: string, category?: ModelCategory): Model[] {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return category ? this.getModelsByCategory(category) : this.getAllModels();
    }

    const models = category ? this.getModelsByCategory(category) : this.getAllModels();

    return models.filter(model =>
      model.name.toLowerCase().includes(lowerQuery) ||
      model.author.toLowerCase().includes(lowerQuery) ||
      model.id.toLowerCase().includes(lowerQuery) ||
      (model.repo && model.repo.toLowerCase().includes(lowerQuery))
    );
  }

  sortModels(models: Model[], sortBy: ModelSortBy, ascending: boolean = false): Model[] {
    const sorted = [...models];

    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'size':
        sorted.sort((a, b) => a.size - b.size);
        break;
      case 'params':
        sorted.sort((a, b) => a.params - b.params);
        break;
      case 'downloads':
        sorted.sort((a, b) => (b.hfModel?.downloads || 0) - (a.hfModel?.downloads || 0));
        break;
      case 'recent':
        sorted.sort((a, b) => {
          const aIdx = this.recentlyUsed.indexOf(a.id);
          const bIdx = this.recentlyUsed.indexOf(b.id);
          if (aIdx === -1 && bIdx === -1) return 0;
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });
        break;
    }

    if (!ascending && sortBy !== 'recent') {
      sorted.reverse();
    }

    return sorted;
  }

  markAsUsed(modelId: string): void {
    const index = this.recentlyUsed.indexOf(modelId);
    if (index !== -1) {
      this.recentlyUsed.splice(index, 1);
    }
    this.recentlyUsed.unshift(modelId);

    if (this.recentlyUsed.length > this.maxRecent) {
      this.recentlyUsed = this.recentlyUsed.slice(0, this.maxRecent);
    }
  }

  getRecentlyUsed(): Model[] {
    return this.recentlyUsed
      .map(id => this.models.get(id))
      .filter((m): m is Model => m !== undefined);
  }

  getDownloadedSize(): number {
    return this.getDownloadedModels().reduce((sum, m) => sum + m.size, 0);
  }

  getDownloadCount(): number {
    return this.getDownloadedModels().length;
  }

  getTotalSize(): number {
    return this.getAllModels().reduce((sum, m) => sum + m.size, 0);
  }

  isDownloading(modelId: string): boolean {
    const queue = getDownloadQueueManager();
    return queue.downloadingItems.some(item => item.model.id === modelId) ||
           queue.queuedItems.some(item => item.model.id === modelId);
  }

  getModelDownloadProgress(modelId: string): number {
    const queue = getDownloadQueueManager();
    const allItems = [...queue.downloadingItems, ...queue.queuedItems];
    const item = allItems.find(i => i.model.id === modelId);
    return item?.progress?.progress || 0;
  }

  getCompatibleProjectionModels(modelId: string): Model[] {
    const model = this.getModel(modelId);
    if (!model || !model.compatibleProjectionModels) {
      return [];
    }

    return model.compatibleProjectionModels
      .map(id => this.getModel(id))
      .filter((m): m is Model => m !== undefined);
  }

  getDefaultProjectionModel(modelId: string): Model | undefined {
    const model = this.getModel(modelId);
    if (!model || !model.defaultProjectionModel) {
      return undefined;
    }
    return this.getModel(model.defaultProjectionModel);
  }

  getModelsWithCapability(capability: string): Model[] {
    return this.getAllModels().filter(m =>
      m.capabilities?.some(c => c === capability)
    );
  }

  clearRecentlyUsed(): void {
    this.recentlyUsed = [];
  }
}

let modelManagerInstance: ModelManager | null = null;

export function getModelManager(): ModelManager {
  if (!modelManagerInstance) {
    modelManagerInstance = new ModelManager();
  }
  return modelManagerInstance;
}

export default ModelManager;
