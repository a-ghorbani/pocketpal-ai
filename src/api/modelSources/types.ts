import {
  GGUFSpecs,
  HuggingFaceModelsResponse,
  ModelFileDetails,
  ModelSourceId,
} from '../../utils/types';

export interface ModelSourceConfig {
  id: ModelSourceId;
  domain: string;
  apiBase: string;
  supportsAuth: boolean;
  supportsPagination: boolean;
  supportsHFAPI: boolean;
}

export interface FetchSourceModelsParams {
  source: ModelSourceId;
  search?: string;
  author?: string;
  filter?: string;
  sort?: string;
  direction?: string;
  limit?: number;
  full?: boolean;
  config?: boolean;
  nextPageUrl?: string;
  authToken?: string | null;
}

export interface FetchModelFilesParams {
  source: ModelSourceId;
  modelId: string;
  authToken?: string | null;
}

export interface FetchGGUFSpecsParams extends FetchModelFilesParams {}

export interface ModelSourceClient {
  fetchModels(
    params: Omit<FetchSourceModelsParams, 'source'>,
  ): Promise<HuggingFaceModelsResponse>;
  fetchModelFilesDetails(
    params: Omit<FetchModelFilesParams, 'source'>,
  ): Promise<ModelFileDetails[]>;
  fetchGGUFSpecs(
    params: Omit<FetchGGUFSpecsParams, 'source'>,
  ): Promise<GGUFSpecs>;
}
