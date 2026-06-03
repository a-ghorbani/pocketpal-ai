import {fetchModelInfo, fetchModelFilesDetails} from '../api/hf';
import {HF_DOMAIN} from '../config/urls';

import {createSiblingsFromFileDetails} from './hf';
import type {HuggingFaceModel, ModelFile} from './types';

/**
 * Optional per-field fallbacks used when the HF API response is incomplete.
 * When provided, fetch failures and a missing sibling are tolerated and these
 * values fill the gaps (the PalsHub flow already carries them). When omitted,
 * the resolver is strict: fetch failures and an unmatched filename throw.
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
 * Resolves a HuggingFace repo + filename into a `{hfModel, modelFile}` pair
 * whose `modelFile.url` points at the file's `/resolve/` endpoint.
 *
 * This is the single canonical resolver: it must go through
 * `createSiblingsFromFileDetails` so each sibling (and the matched file) carries
 * a real download URL — a hand-built `ModelFile` has none, which makes the
 * downstream space-check/download a silent no-op.
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
  const [modelInfo, fileDetails] = await Promise.all([
    fetchModelInfo({repoId, full: true, authToken}).catch((error: any) => {
      if (!fallback) {
        throw error;
      }
      console.warn('Failed to fetch model info:', error);
      return null;
    }),
    fetchModelFilesDetails(repoId, authToken).catch((error: any) => {
      if (!fallback) {
        throw error;
      }
      console.warn('Failed to fetch file details:', error);
      return [];
    }),
  ]);

  const siblings = createSiblingsFromFileDetails(repoId, fileDetails);

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

  const hfModel: HuggingFaceModel = modelInfo
    ? {
        _id: modelInfo._id || repoId,
        id: modelInfo.id || repoId,
        author: modelInfo.author || fallback?.author || '',
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
        author: fallback?.author || '',
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

  return {hfModel, modelFile};
};
