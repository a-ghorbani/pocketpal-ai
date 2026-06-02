import {Model, ModelOrigin, ModelSourceId} from './types';

export const DEFAULT_MODEL_SOURCE: ModelSourceId = 'huggingface';

export const MODEL_SOURCE_IDS: ModelSourceId[] = [
  'huggingface',
  'hf_mirror',
  'modelscope',
];

export const MODEL_SOURCE_STORAGE_DIR: Record<ModelSourceId, string> = {
  huggingface: 'hf',
  hf_mirror: 'hf-mirror',
  modelscope: 'modelscope',
};

export const MODEL_SOURCE_ORIGIN: Record<ModelSourceId, ModelOrigin> = {
  huggingface: ModelOrigin.HF,
  hf_mirror: ModelOrigin.HF_MIRROR,
  modelscope: ModelOrigin.MODELSCOPE,
};

export const MODEL_ORIGIN_SOURCE: Partial<Record<ModelOrigin, ModelSourceId>> =
  {
    [ModelOrigin.HF]: 'huggingface',
    [ModelOrigin.HF_MIRROR]: 'hf_mirror',
    [ModelOrigin.MODELSCOPE]: 'modelscope',
  };

export function getModelSourceFromOrigin(
  origin?: ModelOrigin,
): ModelSourceId {
  return origin
    ? MODEL_ORIGIN_SOURCE[origin] || DEFAULT_MODEL_SOURCE
    : DEFAULT_MODEL_SOURCE;
}

export function getModelSource(model?: Partial<Model>): ModelSourceId {
  return model?.source || getModelSourceFromOrigin(model?.origin);
}

export function getSourceScopedRepoId(
  source: ModelSourceId,
  repoId: string,
): string {
  return source === DEFAULT_MODEL_SOURCE ? repoId : `${source}:${repoId}`;
}

export function stripSourceScope(value: string): string {
  const match = value.match(/^(huggingface|hf_mirror|modelscope):(.+)$/);
  return match ? match[2] : value;
}

export function buildSourceModelId(
  source: ModelSourceId,
  repoId: string,
  filename: string,
): string {
  return `${getSourceScopedRepoId(source, repoId)}/${filename}`;
}

export function getRepoIdFromModelId(modelId: string): string | undefined {
  if (!modelId) {
    return undefined;
  }

  const scoped = stripSourceScope(modelId);
  const parts = scoped.split('/');
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
}

export function getRepoNameFromModelId(modelId: string): string | undefined {
  const repoId = getRepoIdFromModelId(modelId);
  return repoId?.split('/')[1];
}

export function getSourceStorageDir(source: ModelSourceId): string {
  return MODEL_SOURCE_STORAGE_DIR[source];
}
