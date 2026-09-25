import axios from 'axios';

import {urls} from '../../config';
import {
  GGUFSpecs,
  HuggingFaceModel,
  HuggingFaceModelsResponse,
  ModelFile,
  ModelFileDetails,
} from '../../utils/types';
import {filterValidGGUFFiles} from '../../utils/hf';
import {ModelSourceConfig} from './types';
import {MODEL_SOURCE_REQUEST_TIMEOUT_MS} from './network';

const REQUEST_TIMEOUT_MS = MODEL_SOURCE_REQUEST_TIMEOUT_MS;
const DEFAULT_REVISION = 'master';
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;
const GGUF_LIBRARY_FILTER = 'gguf';

const VALID_SORTS = new Set(['default', 'downloads', 'likes', 'last_modified']);

// HFStore UI sort values are HF-style ('relevance', 'lastModified', 'likes',
// 'downloads'). ModelScope OpenAPI (see /.well-known/openapi.json, GET
// /models) only accepts 'default' | 'downloads' | 'likes' | 'last_modified'.
function normalizeSort(sort?: string): string | undefined {
  if (!sort) {
    return undefined;
  }
  if (sort === 'lastModified') {
    return 'last_modified';
  }
  if (sort === 'relevance') {
    return undefined;
  }
  return VALID_SORTS.has(sort) ? sort : undefined;
}

export class ModelScopeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelScopeResponseError';
  }
}

interface ModelScopeListItem {
  id: string;
  description?: string | null;
  display_name?: string | null;
  downloads: number;
  likes: number;
  tasks: string[];
  created_at: string;
  last_modified: string;
  file_size: number;
  params: number;
  tags: string[];
  private: boolean;
  gated: boolean;
}

interface ModelScopePage {
  search?: string;
  owner?: string;
  sort?: string;
  page_number: number;
  page_size: number;
}

function getAuthHeaders(authToken?: string | null): Record<string, string> {
  // NOTE: only a ModelScope token may ever reach this module. The app stores
  // solely a Hugging Face token, and HFStore.shouldUseTokenForSource plus
  // DownloadManager's last-mile guard keep it away from modelscope.cn, whose
  // public endpoints need no auth. If ModelScope auth is added one day, it
  // needs its own token storage — never reuse the HF token here.
  return authToken ? {Authorization: `Bearer ${authToken}`} : {};
}

function looksLikeRepoId(value?: string): boolean {
  return Boolean(value && /^[^/\s]+\/[^/\s]+$/.test(value.trim()));
}

function splitRepoId(repoId: string): {owner: string; name: string} {
  const [owner = '', ...rest] = repoId.split('/');
  if (!owner || rest.length === 0) {
    throw new ModelScopeResponseError(`Invalid ModelScope repo id: ${repoId}`);
  }
  return {owner, name: rest.join('/')};
}

function assertListPayload(
  data: any,
  endpoint: string,
): {
  models: any[];
  total_count: number;
  page_number: number;
  page_size: number;
} {
  const payload = data?.data;
  if (data?.success !== true || typeof payload !== 'object' || !payload) {
    console.error('[ModelScope] unexpected list shape', {endpoint, data});
    throw new ModelScopeResponseError(
      `Unexpected ModelScope response shape for ${endpoint}`,
    );
  }
  if (
    !Array.isArray(payload.models) ||
    typeof payload.total_count !== 'number' ||
    typeof payload.page_number !== 'number' ||
    typeof payload.page_size !== 'number'
  ) {
    console.error('[ModelScope] unexpected list fields', {endpoint, payload});
    throw new ModelScopeResponseError(
      `Unexpected ModelScope response shape for ${endpoint}`,
    );
  }
  return payload;
}

function assertDetailPayload(data: any, repoId: string): any {
  if (data?.success !== true || typeof data?.data !== 'object' || !data.data) {
    console.error('[ModelScope] unexpected detail shape', {repoId, data});
    throw new ModelScopeResponseError(
      `Unexpected ModelScope response shape for model: ${repoId}`,
    );
  }
  if (typeof data.data.id !== 'string' || !data.data.id.includes('/')) {
    console.error('[ModelScope] detail missing id', {repoId, data});
    throw new ModelScopeResponseError(
      `Unexpected ModelScope response shape for model: ${repoId}`,
    );
  }
  return data.data;
}

function normalizeSummary(repoId: string, raw: any): HuggingFaceModel {
  const item = raw as ModelScopeListItem;
  const [owner] = repoId.split('/');
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
  const libraryTag = tags.find(tag => tag.startsWith('library:'));
  const libraryName = libraryTag ? libraryTag.split(':')[1] || 'gguf' : 'gguf';

  return {
    _id: repoId,
    id: repoId,
    author: owner || 'unknown',
    gated: Boolean(item.gated),
    inference: '',
    lastModified: String(item.last_modified),
    likes: Number(item.likes) || 0,
    trendingScore: 0,
    private: Boolean(item.private),
    sha: '',
    downloads: Number(item.downloads) || 0,
    tags,
    library_name: libraryName,
    createdAt: String(item.created_at),
    model_id: repoId,
    // NOTE: OpenAPI list items carry no file list, so siblings stay empty
    // here and are filled on detail view via fetchFiles(). SearchView already
    // renders modelSize/params from the summary in that case.
    siblings: [],
    url: urls.modelScopeWebPage(repoId),
    source: 'modelscope',
    sourceRepoId: repoId,
    avatarUrl: undefined,
    description: item.description || item.display_name || undefined,
    modelSize: Number(item.file_size) > 0 ? Number(item.file_size) : undefined,
    specs: {
      _id: repoId,
      id: repoId,
      // NOTE: OpenAPI summary/detail expose params/file_size but no
      // architecture or context length. Callers (ModelCard) already fall back
      // to locally-parsed ggufMetadata after download.
      gguf: {
        total: Number(item.params) || 0,
        architecture: '',
        context_length: 0,
      },
    },
  };
}

function normalizeFileEntry(repoId: string, entry: any): ModelFile | null {
  const rfilename = typeof entry?.Path === 'string' ? entry.Path : '';
  if (!rfilename) {
    return null;
  }
  const size = Number(entry?.Size) || 0;
  const oid = typeof entry?.Sha256 === 'string' ? entry.Sha256 : undefined;
  return {
    rfilename,
    size: size > 0 ? size : undefined,
    oid,
    url: urls.modelScopeDownloadFile(repoId, rfilename, DEFAULT_REVISION),
    lfs: size > 0 && oid ? {oid, size, pointerSize: 0} : undefined,
  };
}

function toFileDetails(files: ModelFile[]): ModelFileDetails[] {
  return files.map(file => ({
    type: 'file',
    oid: file.oid || file.lfs?.oid || '',
    size: file.size || file.lfs?.size || 0,
    lfs: file.lfs,
    path: file.rfilename,
  }));
}

function parsePageFromNextLink(nextPageUrl: string): ModelScopePage {
  try {
    const parsed = new URL(nextPageUrl);
    return {
      search: parsed.searchParams.get('search') || undefined,
      owner: parsed.searchParams.get('owner') || undefined,
      sort: normalizeSort(parsed.searchParams.get('sort') || undefined),
      page_number: Number(parsed.searchParams.get('page_number')) || 1,
      page_size:
        Number(parsed.searchParams.get('page_size')) || DEFAULT_PAGE_SIZE,
    };
  } catch {
    throw new ModelScopeResponseError(
      `Invalid ModelScope pagination URL: ${nextPageUrl}`,
    );
  }
}

function buildNextLink(
  sourceConfig: ModelSourceConfig,
  page: ModelScopePage,
  totalCount: number,
): string | null {
  if (page.page_number * page.page_size >= totalCount) {
    return null;
  }
  const params = new URLSearchParams();
  if (page.search) {
    params.set('search', page.search);
  }
  if (page.owner) {
    params.set('owner', page.owner);
  }
  if (page.sort) {
    params.set('sort', page.sort);
  }
  params.set('filter.library', GGUF_LIBRARY_FILTER);
  params.set('page_number', String(page.page_number + 1));
  params.set('page_size', String(page.page_size));
  return `${sourceConfig.domain}/openapi/v1/models?${params.toString()}`;
}

async function fetchDetail(
  sourceConfig: ModelSourceConfig,
  repoId: string,
  authToken?: string | null,
): Promise<any> {
  const {owner, name} = splitRepoId(repoId);
  const url = `${sourceConfig.domain}/openapi/v1/models/${encodeURIComponent(
    owner,
  )}/${encodeURIComponent(name)}`;
  const response = await axios.get(url, {
    headers: getAuthHeaders(authToken),
    timeout: REQUEST_TIMEOUT_MS,
  });
  return assertDetailPayload(response.data, repoId);
}

async function fetchFiles(
  sourceConfig: ModelSourceConfig,
  repoId: string,
  authToken?: string | null,
): Promise<ModelFile[]> {
  // NOTE: ModelScope OpenAPI (/.well-known/openapi.json) exposes list/detail
  // but no GET file-listing endpoint (only DELETE /models/{owner}/{repo}/files).
  // File discovery therefore uses the stable web-UI endpoint below, pinned to
  // this single URL (Revision=master). Do not add fallback URL chains.
  const {owner, name} = splitRepoId(repoId);
  const url = `${sourceConfig.apiBase}/models/${encodeURIComponent(
    owner,
  )}/${encodeURIComponent(name)}/repo/files`;
  const response = await axios.get(url, {
    params: {Revision: DEFAULT_REVISION, Recursive: true},
    headers: getAuthHeaders(authToken),
    timeout: REQUEST_TIMEOUT_MS,
  });
  const files = response.data?.Data?.Files;
  if (response.data?.Code !== 200 || !Array.isArray(files)) {
    console.error('[ModelScope] unexpected files shape', {
      repoId,
      data: response.data,
    });
    throw new ModelScopeResponseError(
      `Unexpected ModelScope files response for model: ${repoId}`,
    );
  }
  const normalized = files
    .map(entry => normalizeFileEntry(repoId, entry))
    .filter((file): file is ModelFile => Boolean(file));
  return (filterValidGGUFFiles(normalized) as ModelFile[]) || [];
}

export async function fetchModelScopeModels({
  sourceConfig,
  search,
  author,
  sort,
  limit,
  authToken,
  nextPageUrl,
}: {
  sourceConfig: ModelSourceConfig;
  search?: string;
  author?: string;
  sort?: string;
  limit?: number;
  authToken?: string | null;
  nextPageUrl?: string;
}): Promise<HuggingFaceModelsResponse> {
  const trimmedSearch = search?.trim() || undefined;

  if (trimmedSearch && looksLikeRepoId(trimmedSearch) && !nextPageUrl) {
    const detail = await fetchDetail(sourceConfig, trimmedSearch, authToken);
    const model = normalizeSummary(detail.id, detail);
    // NOTE: file-list failures must surface (401/404/diagnostics) instead of
    // being swallowed into an empty siblings list.
    const files = await fetchFiles(sourceConfig, detail.id, authToken);
    return {models: [{...model, siblings: files}], nextLink: null};
  }

  const pageSize = Math.min(
    Math.max(limit || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page: ModelScopePage = nextPageUrl
    ? {
        ...parsePageFromNextLink(nextPageUrl),
        page_size: pageSize,
      }
    : {
        search: trimmedSearch,
        owner: author?.trim() || undefined,
        sort: normalizeSort(sort),
        page_number: 1,
        page_size: pageSize,
      };
  const endpoint = `${sourceConfig.domain}/openapi/v1/models`;
  const params: Record<string, any> = {
    page_number: page.page_number,
    page_size: page.page_size,
    'filter.library': GGUF_LIBRARY_FILTER,
  };
  if (page.search) {
    params.search = page.search;
  }
  if (page.owner) {
    params.owner = page.owner;
  }
  if (page.sort) {
    params.sort = page.sort;
  }

  const response = await axios.get(endpoint, {
    params,
    headers: getAuthHeaders(authToken),
    timeout: REQUEST_TIMEOUT_MS,
  });
  const payload = assertListPayload(response.data, 'model search');
  const models = payload.models
    .map(raw => {
      if (typeof raw?.id !== 'string' || !raw.id.includes('/')) {
        console.warn('[ModelScope] skipping entry without id', raw);
        return null;
      }
      return normalizeSummary(raw.id, raw);
    })
    .filter((model): model is HuggingFaceModel => Boolean(model));

  return {
    models,
    nextLink: buildNextLink(
      sourceConfig,
      {
        ...page,
        page_number: payload.page_number,
        page_size: payload.page_size,
      },
      payload.total_count,
    ),
  };
}

export async function fetchModelScopeModelFilesDetails({
  sourceConfig,
  modelId,
  authToken,
}: {
  sourceConfig: ModelSourceConfig;
  modelId: string;
  authToken?: string | null;
}): Promise<ModelFileDetails[]> {
  const files = await fetchFiles(sourceConfig, modelId, authToken);
  if (files.length === 0) {
    throw new ModelScopeResponseError(
      `No GGUF files found for ModelScope model: ${modelId}`,
    );
  }
  return toFileDetails(files);
}

export async function fetchModelScopeGGUFSpecs({
  sourceConfig,
  modelId,
  authToken,
}: {
  sourceConfig: ModelSourceConfig;
  modelId: string;
  authToken?: string | null;
}): Promise<GGUFSpecs> {
  const detail = await fetchDetail(sourceConfig, modelId, authToken);
  return {
    _id: modelId,
    id: modelId,
    gguf: {
      total: Number(detail.params) || 0,
      architecture: '',
      context_length: 0,
    },
  };
}
