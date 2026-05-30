import axios from 'axios';

import {urls} from '../../config';
import {
  GGUFSpecs,
  HuggingFaceModel,
  HuggingFaceModelsResponse,
  ModelFileDetails,
} from '../../utils/types';
import {processHFSearchResults} from '../../utils/hf';
import {ModelSourceConfig} from './types';
import {
  fetchWithTimeout,
  MODEL_SOURCE_REQUEST_TIMEOUT_MS,
} from './network';

const REQUEST_TIMEOUT_MS = MODEL_SOURCE_REQUEST_TIMEOUT_MS;

function getAuthHeaders(authToken?: string | null): Record<string, string> {
  return authToken ? {Authorization: `Bearer ${authToken}`} : {};
}

function getNextLink(linkHeader?: string, domain?: string): string | null {
  if (!linkHeader) {
    return null;
  }

  const match = linkHeader.match(/<([^>]*)>/);
  if (!match) {
    return null;
  }

  const nextLink = match[1];
  if (!domain) {
    return nextLink;
  }

  return nextLink.replace(/^https:\/\/huggingface\.co/, domain);
}

export async function fetchHFCompatibleModels({
  sourceConfig,
  search,
  author,
  filter,
  sort,
  direction,
  limit,
  full,
  config,
  nextPageUrl,
  authToken,
}: {
  sourceConfig: ModelSourceConfig;
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
}): Promise<HuggingFaceModelsResponse> {
  const response = await axios.get(
    nextPageUrl || urls.hfCompatibleModelsList(sourceConfig.domain),
    {
      params: {
        search,
        author,
        filter,
        sort,
        direction,
        limit,
        full,
        config,
      },
      headers: getAuthHeaders(authToken),
      timeout: REQUEST_TIMEOUT_MS,
    },
  );

  return {
    models: processHFSearchResults(response.data as HuggingFaceModel[], {
      source: sourceConfig.id,
      domain: sourceConfig.domain,
    }),
    nextLink: getNextLink(response.headers.link, sourceConfig.domain),
  };
}

export const fetchHFCompatibleModelFilesDetails = async ({
  sourceConfig,
  modelId,
  authToken,
}: {
  sourceConfig: ModelSourceConfig;
  modelId: string;
  authToken?: string | null;
}): Promise<ModelFileDetails[]> => {
  const url = `${urls.hfCompatibleModelTree(
    sourceConfig.domain,
    modelId,
  )}?recursive=true`;

  const response = await fetchWithTimeout(url, {
    headers: getAuthHeaders(authToken),
  });

  if (!response.ok) {
    throw new Error(`Error fetching model files: ${response.statusText}`);
  }

  return response.json() as Promise<ModelFileDetails[]>;
};

export const fetchHFCompatibleGGUFSpecs = async ({
  sourceConfig,
  modelId,
  authToken,
}: {
  sourceConfig: ModelSourceConfig;
  modelId: string;
  authToken?: string | null;
}): Promise<GGUFSpecs> => {
  const url = `${urls.hfCompatibleModelSpecs(
    sourceConfig.domain,
    modelId,
  )}?expand[]=gguf`;

  const response = await fetchWithTimeout(url, {
    headers: getAuthHeaders(authToken),
  });

  if (!response.ok) {
    throw new Error(`Error fetching GGUF specs: ${response.statusText}`);
  }

  return response.json() as Promise<GGUFSpecs>;
};
