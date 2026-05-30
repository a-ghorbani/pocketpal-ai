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

class ModelScopeResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelScopeResponseError';
  }
}

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(value => value !== undefined && value !== null);
}

function getNested(obj: any, path: string[]): any {
  return path.reduce((current, key) => current?.[key], obj);
}

function extractList(data: any): any[] {
  const candidates = [
    data?.Data?.Models,
    data?.Data?.ModelList,
    data?.Data?.Rows,
    data?.Data?.List,
    data?.Data?.data,
    data?.Data,
    data?.data?.Models,
    data?.data?.ModelsList,
    data?.data?.Rows,
    data?.data?.List,
    data?.data?.models,
    data?.data?.list,
    data?.data,
    data?.models,
    data?.ModelList,
    data?.Models,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function getTotalCount(data: any): number {
  return (
    Number(
      firstDefined(
        data?.Data?.TotalCount,
        data?.Data?.total_count,
        data?.Data?.Total,
        data?.Data?.total,
        data?.data?.TotalCount,
        data?.data?.total_count,
        data?.data?.Total,
        data?.data?.total,
        data?.total_count,
        data?.TotalCount,
        data?.total,
        data?.Total,
        0,
      ),
    ) || 0
  );
}

function getPageNumber(data: any, fallback: number): number {
  return (
    Number(
      firstDefined(
        data?.Data?.PageNumber,
        data?.Data?.page_number,
        data?.Data?.page,
        data?.data?.PageNumber,
        data?.data?.page_number,
        data?.data?.page,
        data?.page_number,
        data?.PageNumber,
        data?.page,
        fallback,
      ),
    ) || fallback
  );
}

function getPageSize(data: any, fallback: number): number {
  return (
    Number(
      firstDefined(
        data?.Data?.PageSize,
        data?.Data?.page_size,
        data?.data?.PageSize,
        data?.data?.page_size,
        data?.page_size,
        data?.PageSize,
        fallback,
      ),
    ) || fallback
  );
}

function buildQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join('&');
}

function getQueryParam(url: string | undefined, key: string): string | undefined {
  if (!url) {
    return undefined;
  }

  const query = url.split('?')[1]?.split('#')[0];
  if (!query) {
    return undefined;
  }

  for (const part of query.split('&')) {
    const [rawKey, ...rawValueParts] = part.split('=');
    if (decodeURIComponent(rawKey) === key) {
      const value = rawValueParts.join('=').replace(/\+/g, ' ');
      return value ? decodeURIComponent(value) : undefined;
    }
  }

  return undefined;
}

function getNextPageLink({
  data,
  endpoint,
  search,
  author,
  sort,
  page,
  pageSize,
}: {
  data: any;
  endpoint: string;
  search?: string;
  author?: string;
  sort?: string;
  page: number;
  pageSize: number;
}): string | null {
  const totalCount = getTotalCount(data);
  const currentPage = getPageNumber(data, page);
  const resolvedPageSize = getPageSize(data, pageSize);

  if (!totalCount || currentPage * resolvedPageSize >= totalCount) {
    return null;
  }

  const query = buildQueryString({
    search,
    owner: author,
    sort,
    page: currentPage + 1,
    page_size: resolvedPageSize,
  });

  return `${endpoint}?${query}`;
}

function getString(value: any): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getImageFromMarkdown(value: any): string | undefined {
  const markdown = getString(value);
  if (!markdown) {
    return undefined;
  }

  const imageMatch = markdown.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
  if (imageMatch?.[1]) {
    return imageMatch[1];
  }

  const htmlMatch = markdown.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  return htmlMatch?.[1];
}

function getModelScopeAvatar(raw: any): string | undefined {
  return getString(
    firstDefined(
      raw?.Avatar,
      raw?.avatar,
      raw?.AvatarUrl,
      raw?.avatarUrl,
      raw?.avatar_url,
      raw?.OwnerAvatar,
      raw?.ownerAvatar,
      raw?.Organization?.Avatar,
      raw?.organization?.avatar,
      raw?.Org?.Avatar,
      raw?.org?.avatar,
      raw?.CoverImage,
      raw?.coverImage,
      raw?.CoverImages?.[0],
      raw?.cover_images?.[0],
      raw?.NEXA?.ModelCover,
      raw?.nexa?.modelCover,
      getImageFromMarkdown(raw?.ReadMeContent),
      getImageFromMarkdown(raw?.README),
      getImageFromMarkdown(raw?.readme),
    ),
  );
}

function normalizeRepoId(raw: any): string {
  const cleanRepoId = (repoId: string) =>
    repoId.replace(/^models\//, '').replace(/^\/+/, '');

  const explicitRepoId = firstDefined(
    raw?.ModelId,
    raw?.model_id,
    raw?.modelId,
    raw?.id,
    raw?.Id,
  );
  if (explicitRepoId) {
    return cleanRepoId(String(explicitRepoId));
  }

  const path = String(firstDefined(raw?.Path, raw?.path, '') || '');
  if (path.includes('/')) {
    return cleanRepoId(path);
  }

  const name = String(
    firstDefined(
      raw?.Name,
      raw?.name,
      raw?.ModelName,
      raw?.modelName,
    ) || '',
  );
  if (path && name) {
    return cleanRepoId(`${path}/${name}`);
  }

  return cleanRepoId(path || name);
}

function splitRepoId(repoId: string): {owner: string; name: string} {
  const [owner = 'unknown', ...rest] = repoId.split('/');
  return {
    owner,
    name: rest.join('/') || repoId,
  };
}

function normalizeModelScopeFile(
  repoId: string,
  rawFile: any,
): ModelFile | null {
  const rfilename = String(
    firstDefined(
      rawFile?.rfilename,
      rawFile?.path,
      rawFile?.Path,
      rawFile?.name,
      rawFile?.Name,
      rawFile?.file_name,
      rawFile?.FileName,
    ) || '',
  );

  if (!rfilename) {
    return null;
  }

  const size = Number(
    firstDefined(
      rawFile?.size,
      rawFile?.Size,
      rawFile?.lfs?.size,
      rawFile?.Lfs?.Size,
      rawFile?.LFS?.Size,
    ) || 0,
  );
  const oid = firstDefined(
    rawFile?.oid,
    rawFile?.Oid,
    rawFile?.sha,
    rawFile?.Sha,
    rawFile?.sha256,
    rawFile?.Sha256,
    rawFile?.lfs?.oid,
    rawFile?.Lfs?.Oid,
  );
  const url = firstDefined(
    rawFile?.url,
    rawFile?.Url,
    rawFile?.download_url,
    rawFile?.downloadUrl,
    rawFile?.DownloadUrl,
    urls.modelScopeDownloadFile(repoId, rfilename, DEFAULT_REVISION),
  );

  return {
    rfilename,
    size: size > 0 ? size : undefined,
    oid: oid ? String(oid) : undefined,
    url: String(url),
    lfs: size > 0 && oid ? {oid: String(oid), size, pointerSize: 0} : undefined,
  };
}

function extractFiles(repoId: string, data: any): ModelFile[] {
  const ggufInfos = firstDefined(
    getNested(data, ['Data', 'ModelInfos', 'gguf', 'gguf_file_list']),
    getNested(data, ['Data', 'modelInfos', 'gguf', 'gguf_file_list']),
    getNested(data, ['ModelInfos', 'gguf', 'gguf_file_list']),
    getNested(data, ['modelInfos', 'gguf', 'gguf_file_list']),
  );

  if (Array.isArray(ggufInfos)) {
    const files = ggufInfos
      .flatMap(item => asArray(item?.file_info))
      .map(file =>
        normalizeModelScopeFile(repoId, {
          ...file,
          Path: file?.name,
          Oid: file?.sha256,
        }),
      )
      .filter((file): file is ModelFile => Boolean(file));
    if (files.length > 0) {
      return filterValidGGUFFiles(files) as ModelFile[];
    }
  }

  const candidates = [
    data?.Data?.Files,
    data?.Data?.files,
    data?.Data?.RepoFiles,
    data?.Data?.ModelFiles,
    data?.Data?.Siblings,
    data?.data?.files,
    data?.data?.Files,
    data?.files,
    data?.Files,
    data?.siblings,
    data?.Siblings,
    getNested(data, ['Data', 'Model', 'Files']),
    getNested(data, ['data', 'model', 'files']),
  ];

  for (const candidate of candidates) {
    const files = asArray(candidate)
      .map(file => normalizeModelScopeFile(repoId, file))
      .filter((file): file is ModelFile => Boolean(file));
    if (files.length > 0) {
      return filterValidGGUFFiles(files) as ModelFile[];
    }
  }

  return [];
}

function normalizeModelScopeModel(raw: any): HuggingFaceModel | null {
  const repoId = normalizeRepoId(raw);
  if (!repoId) {
    return null;
  }

  const {owner} = splitRepoId(repoId);
  const siblings = extractFiles(repoId, raw);
  const lastModifiedRaw = firstDefined(
    raw?.LastModified,
    raw?.lastModified,
    raw?.GmtModified,
    raw?.gmtModified,
    raw?.UpdatedAt,
    raw?.updated_at,
    raw?.ModifiedTime,
    raw?.modifiedTime,
    raw?.LastUpdatedTime,
    raw?.lastUpdatedTime,
    raw?.CreatedTime,
    raw?.createdTime,
    raw?.CreatedAt,
    raw?.created_at,
    new Date().toISOString(),
  );
  const lastModified = String(
    typeof lastModifiedRaw === 'number'
      ? new Date(lastModifiedRaw * 1000).toISOString()
      : lastModifiedRaw,
  );
  const modelInfos = raw?.ModelInfos?.gguf || raw?.modelInfos?.gguf;
  const modelSize = Number(
    firstDefined(
      raw?.ModelSize,
      raw?.modelSize,
      raw?.file_size,
      raw?.FileSize,
      modelInfos?.model_size,
      0,
    ),
  );
  const parameterCount = Number(
    firstDefined(raw?.params, raw?.Params, raw?.Parameters, raw?.parameters, 0),
  );
  const libraryFromTags = asArray(raw?.tags).find((tag: string) =>
    tag.startsWith('library:'),
  );
  const libraryName = firstDefined(
    raw?.LibraryName,
    raw?.library_name,
    raw?.Libraries?.[0],
    libraryFromTags?.split(':')[1],
    siblings.length > 0 ? 'gguf' : '',
  );

  return {
    _id: repoId,
    id: repoId,
    author: String(firstDefined(raw?.Owner, raw?.owner, raw?.author, owner)),
    gated: Boolean(firstDefined(raw?.Gated, raw?.gated, false)),
    inference: '',
    lastModified,
    likes: Number(firstDefined(raw?.Stars, raw?.stars, raw?.likes, 0)) || 0,
    trendingScore:
      Number(firstDefined(raw?.TrendingScore, raw?.trendingScore, 0)) || 0,
    private: Boolean(firstDefined(raw?.Private, raw?.private, false)),
    sha: String(firstDefined(raw?.Sha, raw?.sha, '')),
    downloads:
      Number(
        firstDefined(
          raw?.Downloads,
          raw?.downloads,
          raw?.DownloadCount,
          raw?.downloadCount,
          raw?.download_count,
          0,
        ),
      ) || 0,
    tags: asArray(firstDefined(raw?.Tags, raw?.tags, raw?.Tasks, raw?.tasks)),
    library_name: String(libraryName),
    createdAt: String(
      firstDefined(raw?.CreatedAt, raw?.created_at, lastModified),
    ),
    model_id: repoId,
    siblings,
    url: urls.modelScopeWebPage(repoId),
    source: 'modelscope',
    sourceRepoId: repoId,
    avatarUrl: getModelScopeAvatar(raw),
    description: firstDefined(
      raw?.Description,
      raw?.description,
      raw?.Summary,
      raw?.summary,
      raw?.Intro,
      raw?.intro,
      raw?.ChineseName,
    ),
    modelSize: modelSize > 0 ? modelSize : undefined,
    specs:
      parameterCount > 0
        ? {
            _id: repoId,
            id: repoId,
            gguf: {
              total: parameterCount,
              architecture: '',
              context_length: 0,
            },
          }
        : undefined,
  };
}

function shouldKeepModelScopeSearchModel(model: HuggingFaceModel): boolean {
  const tags = (model.tags || []).map(tag => tag.toLowerCase());
  const searchableText = [
    model.id,
    model.model_id,
    model.library_name,
    model.description,
    ...tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return model.siblings.length > 0 || searchableText.includes('gguf');
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

function getAuthHeaders(authToken?: string | null): Record<string, string> {
  return authToken ? {Authorization: `Bearer ${authToken}`} : {};
}

function assertSuccessfulModelScopeResponse(data: any, endpoint: string) {
  if (
    data &&
    typeof data === 'object' &&
    data.Success === false &&
    data.Code !== 200
  ) {
    throw new ModelScopeResponseError(
      data.Message || `ModelScope request failed for ${endpoint}`,
    );
  }
}

function looksLikeRepoId(value?: string): boolean {
  return Boolean(value && /^[^/\s]+\/[^/\s]+$/.test(value.trim()));
}

async function tryModelScopeGet(
  url: string,
  params?: Record<string, any>,
  authToken?: string | null,
) {
  try {
    const response = await axios.get(url, {
      params,
      headers: getAuthHeaders(authToken),
      timeout: REQUEST_TIMEOUT_MS,
    });
    if (!response?.data) {
      return null;
    }
    assertSuccessfulModelScopeResponse(response.data, url);
    return response;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function fetchModelScopeDetail(
  sourceConfig: ModelSourceConfig,
  repoId: string,
  authToken?: string | null,
): Promise<any | null> {
  const {owner, name} = splitRepoId(repoId);
  const ownerPath = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const encodedRepo = encodeURIComponent(repoId);

  const urlsToTry = [
    `${sourceConfig.apiBase}/models/${ownerPath}`,
    `${sourceConfig.apiBase}/models/${encodedRepo}`,
    `${sourceConfig.domain}/api/v1/models/${ownerPath}`,
  ];

  for (const detailUrl of urlsToTry) {
    const response = await tryModelScopeGet(detailUrl, undefined, authToken);
    if (response?.data) {
      return response.data;
    }
  }

  return null;
}

async function fetchModelScopeFiles(
  sourceConfig: ModelSourceConfig,
  repoId: string,
  authToken?: string | null,
): Promise<ModelFile[]> {
  const {owner, name} = splitRepoId(repoId);
  const ownerPath = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const fileEndpoints = [
    `${sourceConfig.apiBase}/models/${ownerPath}/repo/files`,
    `${sourceConfig.apiBase}/models/${ownerPath}/repo/tree`,
    `${sourceConfig.apiBase}/models/${ownerPath}/files`,
  ];

  for (const endpoint of fileEndpoints) {
    const response = await tryModelScopeGet(
      endpoint,
      {
        Revision: DEFAULT_REVISION,
        revision: DEFAULT_REVISION,
        Recursive: true,
        recursive: true,
      },
      authToken,
    );
    if (response?.data) {
      const files = extractFiles(repoId, response.data);
      if (files.length > 0) {
        return files;
      }
    }
  }

  return [];
}

async function fetchModelScopeDirectModel(
  sourceConfig: ModelSourceConfig,
  repoId: string,
  authToken?: string | null,
): Promise<HuggingFaceModel> {
  const detail = await fetchModelScopeDetail(sourceConfig, repoId, authToken);
  if (!detail) {
    throw new ModelScopeResponseError(`ModelScope model not found: ${repoId}`);
  }

  const rawModel = detail.Data || detail;
  const normalized = normalizeModelScopeModel({
    ...rawModel,
    ModelId: repoId,
  });
  if (!normalized) {
    throw new ModelScopeResponseError(
      `ModelScope model response could not be parsed: ${repoId}`,
    );
  }

  const files =
    normalized.siblings.length > 0
      ? normalized.siblings
      : await fetchModelScopeFiles(sourceConfig, repoId, authToken);

  return {
    ...normalized,
    siblings: files,
  };
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
  if (looksLikeRepoId(search) && !nextPageUrl) {
    const model = await fetchModelScopeDirectModel(
      sourceConfig,
      search!.trim(),
      authToken,
    );
    return {models: [model], nextLink: null};
  }

  const pageSize = Math.max(limit || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const endpoint = `${sourceConfig.domain}/openapi/v1/models`;
  const params = {
    search: search ? `${search} gguf` : 'gguf',
    owner: author,
    sort,
    page: 1,
    page_size: pageSize,
  };
  const requestSearch = nextPageUrl
    ? getQueryParam(nextPageUrl, 'search') || params.search
    : params.search;
  const requestAuthor = nextPageUrl
    ? getQueryParam(nextPageUrl, 'owner') || author
    : author;
  const requestSort = nextPageUrl
    ? getQueryParam(nextPageUrl, 'sort') || sort
    : sort;
  const response = await axios.get(nextPageUrl || endpoint, {
    params: nextPageUrl ? undefined : params,
    headers: getAuthHeaders(authToken),
    timeout: REQUEST_TIMEOUT_MS,
  });

  assertSuccessfulModelScopeResponse(response.data, 'model search');
  const currentPage = nextPageUrl
    ? getPageNumber(response.data, 1)
    : params.page;
  const currentPageSize = getPageSize(response.data, pageSize);
  const models = extractList(response.data)
    .map(model => normalizeModelScopeModel(model))
    .filter((model): model is HuggingFaceModel => Boolean(model))
    .filter(shouldKeepModelScopeSearchModel);

  return {
    models,
    nextLink: getNextPageLink({
      data: response.data,
      endpoint,
      search: requestSearch,
      author: requestAuthor,
      sort: requestSort,
      page: currentPage,
      pageSize: currentPageSize,
    }),
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
  const detail = await fetchModelScopeDetail(sourceConfig, modelId, authToken);
  const detailFiles = detail ? extractFiles(modelId, detail) : [];
  const files =
    detailFiles.length > 0
      ? detailFiles
      : await fetchModelScopeFiles(sourceConfig, modelId, authToken);

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
  const detail = await fetchModelScopeDetail(sourceConfig, modelId, authToken);
  const normalized = detail
    ? normalizeModelScopeModel(detail.Data || detail)
    : null;
  if (!detail) {
    throw new ModelScopeResponseError(`ModelScope model not found: ${modelId}`);
  }
  const modelInfos = detail?.Data?.ModelInfos?.gguf || detail?.ModelInfos?.gguf;

  return {
    _id: modelId,
    id: modelId,
    gguf: {
      total: Number(
        firstDefined(
          detail?.Data?.Parameters,
          detail?.Data?.parameterCount,
          detail?.Data?.ModelSize,
          detail?.Data?.model_size,
          modelInfos?.model_size,
          detail?.Parameters,
          detail?.parameterCount,
          normalized?.modelSize,
          0,
        ),
      ),
      architecture: String(
        firstDefined(
          detail?.Data?.Architecture,
          detail?.Data?.architecture,
          modelInfos?.architecture,
          detail?.Architecture,
          detail?.architecture,
          '',
        ),
      ),
      context_length:
        Number(
          firstDefined(
            detail?.Data?.ContextLength,
            detail?.Data?.context_length,
            modelInfos?.context_length,
            detail?.ContextLength,
            detail?.context_length,
            0,
          ),
        ) || 0,
    },
  };
}
