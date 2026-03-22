import axios from 'axios';

import {urls} from '../config';
import {networkLog} from '../utils/debug';

const HF_TIMEOUT_MS = 15000;

import {
  GGUFSpecs,
  HuggingFaceModel,
  HuggingFaceModelsResponse,
  ModelFileDetails,
} from '../utils/types';

/**
 * Get information from all models in the Hub.
 * The response is paginated, use the Link header to get the next pages.
 *
 * search: Filter based on substrings for repos and their usernames, such as resnet or microsoft
 * author: Filter models by an author or organization, such as huggingface or microsoft
 * filter: Filter based on tags, such as text-classification or spacy.
 * sort: Property to use when sorting, such as downloads or author.
 * direction: Direction in which to sort, such as -1 for descending, and anything else for ascending.
 * limit: Limit the number of models fetched.
 * full: Whether to fetch most model data, such as all tags, the files, etc.
 * config: Whether to also fetch the repo config.
 *
 * @see https://huggingface.co/docs/api-reference/api-endpoints#get-models
 */
export async function fetchModels({
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
  const targetUrl = nextPageUrl || urls.modelsList();
  networkLog('hf:fetchModels:start', {
    targetUrl,
    search,
    author,
    filter,
    limit,
    hasAuthToken: !!authToken,
  });
  try {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await axios.get(targetUrl, {
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
      headers,
      timeout: HF_TIMEOUT_MS,
    });

    const linkHeader = response.headers.link;
    let nextLink = null;

    if (linkHeader) {
      const match = linkHeader.match(/<([^>]*)>/);
      if (match) {
        nextLink = match[1];
      }
    }

    networkLog('hf:fetchModels:success', {
      targetUrl,
      status: response.status,
      modelCount: (response.data as any[])?.length ?? 0,
      nextLink,
    });

    return {
      models: response.data as HuggingFaceModel[],
      nextLink,
    };
  } catch (error) {
    networkLog('hf:fetchModels:error', {
      targetUrl,
      error: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      status: (error as any)?.response?.status,
    });
    console.error('Error fetching models:', error);
    throw error;
  }
}

/**
 * Fetches the details of the model's files. Mainly the size is used.
 * @param modelId - The ID of the model.
 * @param authToken - Optional authentication token for accessing private models
 * @returns An array of ModelFileDetails.
 */
export const fetchModelFilesDetails = async (
  modelId: string,
  authToken?: string | null,
): Promise<ModelFileDetails[]> => {
  const url = `${urls.modelTree(modelId)}?recursive=true`;
  networkLog('hf:fetchModelFiles:start', {url, modelId});

  try {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);
    const response = await fetch(url, {headers, signal: controller.signal});
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Error fetching model files: ${response.statusText}`);
    }

    const data: ModelFileDetails[] = await response.json();
    networkLog('hf:fetchModelFiles:success', {url, fileCount: data.length});
    return data;
  } catch (error) {
    networkLog('hf:fetchModelFiles:error', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('Failed to fetch model files:', error);
    throw error;
  }
};

/**
 * Fetches the specs of the GGUF for a specific model.
 * @param modelId - The ID of the model.
 * @param authToken - Optional authentication token for accessing private models
 * @returns The GGUF specs.
 */
export const fetchGGUFSpecs = async (
  modelId: string,
  authToken?: string | null,
): Promise<GGUFSpecs> => {
  const url = `${urls.modelSpecs(modelId)}?expand[]=gguf`;
  networkLog('hf:fetchGGUFSpecs:start', {url, modelId});

  try {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);
    const response = await fetch(url, {headers, signal: controller.signal});
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Error fetching GGUF specs: ${response.statusText}`);
    }

    const data: GGUFSpecs = await response.json();
    networkLog('hf:fetchGGUFSpecs:success', {url});
    return data;
  } catch (error) {
    networkLog('hf:fetchGGUFSpecs:error', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('Failed to fetch GGUF specs:', error);
    throw error;
  }
};

/**
 * Fetches complete model information from HuggingFace API
 * @param repoId - The repository ID (e.g., "microsoft/DialoGPT-medium")
 * @param revision - Optional revision/branch (defaults to main)
 * @param full - Whether to fetch full model data
 * @param authToken - Optional authentication token for accessing private models
 * @param stripFields - Optional array of fields to remove from the result
 * @returns Partial HuggingFaceModel with GGUF specs converted to compatible format
 */
export async function fetchModelInfo({
  repoId,
  revision,
  full,
  authToken,
  stripFields = ['spaces', 'cardData', 'config'], // Default fields to strip
}: {
  repoId: string;
  revision?: string;
  full?: boolean;
  authToken?: string | null;
  stripFields?: string[];
}): Promise<Partial<HuggingFaceModel>> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const base = revision
    ? `${urls.modelSpecs(repoId)}/revision/${revision}`
    : urls.modelSpecs(repoId);

  networkLog('hf:fetchModelInfo:start', {url: base, repoId});
  try {
    const response = await axios.get<any>(base, {
      params: {
        full,
      },
      headers,
      timeout: HF_TIMEOUT_MS,
    });

    const modelData: Partial<HuggingFaceModel> = {...response.data};

    // Remove unwanted fields
    for (const field of stripFields) {
      delete (modelData as any)[field];
    }

    // Convert GGUF field to specs format for compatibility with existing code
    // The API returns: { "gguf": { "total": 123, "architecture": "llama", ... } }
    // But our code expects: { "specs": { "gguf": { "total": 123, ... } } }
    // TODO: at some point this needs to be migrated to be compatible with HF datastructure.
    if (response.data.gguf) {
      modelData.specs = {
        _id: response.data._id || '',
        id: response.data.id || repoId,
        gguf: response.data.gguf,
        // Include other fields that might be in the original specs format
        ...modelData.specs,
      };
      // Remove the original gguf field since we've moved it to specs.gguf
      delete (modelData as any).gguf;
    }

    networkLog('hf:fetchModelInfo:success', {url: base, repoId});
    return modelData;
  } catch (error) {
    networkLog('hf:fetchModelInfo:error', {
      url: base,
      repoId,
      error: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      status: (error as any)?.response?.status,
    });
    console.error('Failed to fetch model info:', error);
    throw error;
  }
}
