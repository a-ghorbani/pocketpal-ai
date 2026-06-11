import {fetchModelInfo, fetchModelFilesDetails} from '../api/hf';
import {HF_DOMAIN} from '../config/urls';

import {createSiblingsFromFileDetails} from './hf';
import type {HuggingFaceModel, ModelFile} from './types';

/**
 * Optional per-field fallbacks used when the HF API response is incomplete.
 * When provided, fetch failures and a missing sibling are tolerated and these
 * values fill the gaps (the PalsHub flow already carries them). When omitted,
 * the caller (e.g. the hub/run landing sheet) gets strict resolution via
 * `resolveHFRepo`, which throws on fetch failure.
 */
export interface HFResolveFallback {
  author: string;
  size: number;
  downloadUrl: string;
}

export interface HFResolveResult {
  hfModel: HuggingFaceModel;
  modelFile: ModelFile;
}

/**
 * Strict, repo-level resolver: fetches a HuggingFace repo and assembles a full
 * `HuggingFaceModel` whose `siblings` each carry a real `/resolve/` download
 * `url`.
 *
 * It must go through `createSiblingsFromFileDetails` so every sibling has a
 * download URL — a hand-built `ModelFile` has none, which makes the downstream
 * space-check/download a silent no-op.
 *
 * No fallback and no filename selection: a fetch failure throws. Callers that
 * need a single matched file (with per-field tolerance) use
 * `resolveHFModelForDownload`.
 *
 * @param repoId - "author/model"
 * @param authToken - optional HF token for private/gated repos
 */
export const resolveHFRepo = async (
  repoId: string,
  authToken?: string | null,
): Promise<HuggingFaceModel> => {
  const [modelInfo, fileDetails] = await Promise.all([
    fetchModelInfo({repoId, full: true, authToken}),
    fetchModelFilesDetails(repoId, authToken),
  ]);

  const siblings = createSiblingsFromFileDetails(repoId, fileDetails);

  return assembleHFModel(repoId, siblings, modelInfo);
};

/**
 * Assembles a `HuggingFaceModel` from the repo siblings and the (possibly null)
 * model-info response, applying HF_DOMAIN and per-field fallbacks.
 */
const assembleHFModel = (
  repoId: string,
  siblings: ModelFile[],
  modelInfo: any,
  fallbackAuthor?: string,
): HuggingFaceModel =>
  modelInfo
    ? {
        _id: modelInfo._id || repoId,
        id: modelInfo.id || repoId,
        author: modelInfo.author || fallbackAuthor || '',
        gated: modelInfo.gated || false,
        inference: modelInfo.inference || 'cold',
        lastModified: modelInfo.lastModified || new Date().toISOString(),
        likes: modelInfo.likes || 0,
        trendingScore: modelInfo.trendingScore || 0,
        private: modelInfo.private || false,
        sha: modelInfo.sha || '',
        downloads: modelInfo.downloads || 0,
        tags: modelInfo.tags || [],
        library_name: modelInfo.library_name || '',
        createdAt: modelInfo.createdAt || new Date().toISOString(),
        model_id: modelInfo.model_id || repoId,
        url: modelInfo.url || `${HF_DOMAIN}/${repoId}`,
        specs: modelInfo.specs,
        siblings,
      }
    : {
        _id: repoId,
        id: repoId,
        author: fallbackAuthor || '',
        gated: false,
        inference: 'cold',
        lastModified: new Date().toISOString(),
        likes: 0,
        trendingScore: 0,
        private: false,
        sha: '',
        downloads: 0,
        tags: [],
        library_name: '',
        createdAt: new Date().toISOString(),
        model_id: repoId,
        url: `${HF_DOMAIN}/${repoId}`,
        specs: undefined,
        siblings,
      };

/**
 * Resolves a HuggingFace repo + filename into a `{hfModel, modelFile}` pair
 * whose `modelFile.url` points at the file's `/resolve/` endpoint.
 *
 * Builds on `resolveHFRepo` for the repo-level core, then finds the sibling
 * matching `filename`. With a `fallback` (the PalsHub flow), fetch failures and
 * an unmatched filename are tolerated and the supplied values fill the gaps;
 * without one, both throw.
 *
 * @param repoId - "author/model"
 * @param filename - exact "*.gguf" file in the repo
 * @param authToken - optional HF token for private/gated repos
 * @param fallback - optional values that relax strictness (see HFResolveFallback)
 */
export const resolveHFModelForDownload = async (
  repoId: string,
  filename: string,
  authToken?: string | null,
  fallback?: HFResolveFallback,
): Promise<HFResolveResult> => {
  // Strict callers (no fallback) get the repo-level core as-is: a fetch failure
  // throws. Tolerant callers (PalsHub) keep per-fetch independence so a partial
  // response (e.g. file details succeed, model info fails) still yields the real
  // sibling URLs rather than collapsing to the fallback.
  let hfModel: HuggingFaceModel;
  if (!fallback) {
    hfModel = await resolveHFRepo(repoId, authToken);
  } else {
    const [modelInfo, fileDetails] = await Promise.all([
      fetchModelInfo({repoId, full: true, authToken}).catch((error: any) => {
        console.warn('Failed to fetch model info:', error);
        return null;
      }),
      fetchModelFilesDetails(repoId, authToken).catch((error: any) => {
        console.warn('Failed to fetch file details:', error);
        return [];
      }),
    ]);
    const siblings = createSiblingsFromFileDetails(repoId, fileDetails);
    hfModel = assembleHFModel(repoId, siblings, modelInfo, fallback.author);
  }

  const siblings = hfModel.siblings;

  const matched = siblings.find(file => file.rfilename === filename);
  if (!matched && !fallback) {
    throw new Error(`File "${filename}" not found in repo "${repoId}"`);
  }

  const modelFile: ModelFile = {
    rfilename: matched?.rfilename || filename,
    size: matched?.size || fallback?.size,
    url: matched?.url || fallback?.downloadUrl,
    oid: matched?.oid,
    lfs: matched?.lfs,
  };

  return {hfModel, modelFile};
};
