// api/hf.ts
import axios from 'axios';

import {
  GGUFSpecs,
  HuggingFaceModel,
  HuggingFaceModelsResponse,
  ModelFileDetails,
} from '../utils/types';

const BASE_URL = 'https://huggingface.co/api/models';

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
}: {
  search?: string;
  author?: string;
  filter?: string;
  sort?: string;
  direction?: string;
  limit?: number;
  full?: boolean;
  config?: boolean;
}): Promise<HuggingFaceModelsResponse> {
  try {
    console.log('search', search);
    console.log('author', author);
    console.log('filter', filter);
    console.log('sort', sort);
    console.log('direction', direction);
    console.log('limit', limit);
    console.log('full', full);
    console.log('config', config);
    const response = await axios.get(BASE_URL, {
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
    });
    // console.log('response.data: ', response.data);
    return {
      models: response.data as HuggingFaceModel[],
      nextLink: response.headers.link || null, // null if no pagination link is provided
    };
  } catch (error) {
    console.error('Error fetching models:', error);
    throw error;
  }
}

/**
 * Fetches the details of the model's files. Mainly the size is used.
 * @param modelId - The ID of the model.
 * @returns An array of ModelFileDetails.
 */
export const fetchModelFilesDetails = async (
  modelId: string,
): Promise<ModelFileDetails[]> => {
  const url = `https://huggingface.co/api/models/${modelId}/tree/main?recursive=true`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error fetching model files: ${response.statusText}`);
    }

    const data: ModelFileDetails[] = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch model files:', error);
    throw error;
  }
};

/**
 * Fetches the specs of the GGUF for a specific model.
 * @param modelId - The ID of the model.
 * @returns The GGUF specs.
 */
export const fetchGGUFSpecs = async (modelId: string): Promise<GGUFSpecs> => {
  const url = `https://huggingface.co/api/models/${modelId}?expand[]=gguf`;

  try {
    const response = await fetch(url);

    console.log('fetchGGUFSpecs response: ', response);
    if (!response.ok) {
      throw new Error(`Error fetching GGUF specs: ${response.statusText}`);
    }

    const data: GGUFSpecs = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch GGUF specs:', error);
    throw error;
  }
};
