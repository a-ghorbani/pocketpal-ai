import {
  GGUFSpecs,
  HuggingFaceModelsResponse,
  ModelFileDetails,
  ModelSourceId,
} from '../../utils/types';
import {stripSourceScope} from '../../utils/modelSources';
import {
  fetchHFCompatibleGGUFSpecs,
  fetchHFCompatibleModelFilesDetails,
  fetchHFCompatibleModels,
} from './hfCompatible';
import {
  fetchModelScopeGGUFSpecs,
  fetchModelScopeModelFilesDetails,
  fetchModelScopeModels,
} from './modelscope';
import {getModelSourceConfig, isHFCompatibleSource} from './registry';
import {
  FetchGGUFSpecsParams,
  FetchModelFilesParams,
  FetchSourceModelsParams,
} from './types';

function normalizeModelId(source: ModelSourceId, modelId: string): string {
  return source === 'huggingface' ? modelId : stripSourceScope(modelId);
}

export async function fetchModelsFromSource({
  source,
  ...params
}: FetchSourceModelsParams): Promise<HuggingFaceModelsResponse> {
  const sourceConfig = getModelSourceConfig(source);

  if (isHFCompatibleSource(source)) {
    return fetchHFCompatibleModels({
      sourceConfig,
      ...params,
    });
  }

  return fetchModelScopeModels({
    sourceConfig,
    search: params.search,
    author: params.author,
    sort: params.sort,
    limit: params.limit,
    nextPageUrl: params.nextPageUrl,
    authToken: params.authToken,
  });
}

export async function fetchModelFilesDetailsFromSource({
  source,
  modelId,
  authToken,
}: FetchModelFilesParams): Promise<ModelFileDetails[]> {
  const sourceConfig = getModelSourceConfig(source);
  const normalizedModelId = normalizeModelId(source, modelId);

  if (isHFCompatibleSource(source)) {
    return fetchHFCompatibleModelFilesDetails({
      sourceConfig,
      modelId: normalizedModelId,
      authToken,
    });
  }

  return fetchModelScopeModelFilesDetails({
    sourceConfig,
    modelId: normalizedModelId,
    authToken,
  });
}

export async function fetchGGUFSpecsFromSource({
  source,
  modelId,
  authToken,
}: FetchGGUFSpecsParams): Promise<GGUFSpecs> {
  const sourceConfig = getModelSourceConfig(source);
  const normalizedModelId = normalizeModelId(source, modelId);

  if (isHFCompatibleSource(source)) {
    return fetchHFCompatibleGGUFSpecs({
      sourceConfig,
      modelId: normalizedModelId,
      authToken,
    });
  }

  return fetchModelScopeGGUFSpecs({
    sourceConfig,
    modelId: normalizedModelId,
    authToken,
  });
}

export {getModelSourceConfig, isHFCompatibleSource};
export type {
  FetchGGUFSpecsParams,
  FetchModelFilesParams,
  FetchSourceModelsParams,
  ModelSourceConfig,
} from './types';
