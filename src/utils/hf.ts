/**
 * Utility functions for HuggingFace model processing
 * Centralizes siblings processing, filtering, and normalization logic
 */

import {urls} from '../config';
import type {
  HuggingFaceModel,
  ModelFile,
  SplitModelFile,
  ModelSourceId,
} from './types';

// Regex pattern for detecting sharded GGUF files
const RE_GGUF_SHARD_FILE =
  /^(?<prefix>.*?)-(?<shard>\d{5})-of-(?<total>\d{5})\.gguf$/i;

type ParsedGGUFShard = {
  prefix: string;
  shard: number;
  total: number;
};

function parseGGUFShardFilename(filename: string): ParsedGGUFShard | null {
  const match = filename.match(RE_GGUF_SHARD_FILE);
  if (!match?.groups) {
    return null;
  }

  const shard = Number(match.groups.shard);
  const total = Number(match.groups.total);
  if (!Number.isInteger(shard) || !Number.isInteger(total)) {
    return null;
  }

  if (shard < 1 || total < 2 || shard > total) {
    return null;
  }

  return {
    prefix: match.groups.prefix,
    shard,
    total,
  };
}

function getShardGroupKey(filename: string, parsed: ParsedGGUFShard): string {
  const slashIndex = filename.lastIndexOf('/');
  const dir = slashIndex >= 0 ? filename.slice(0, slashIndex + 1) : '';
  return `${dir}${parsed.prefix}|${parsed.total}`;
}

function getDisplayFilename(firstPartFilename: string): string {
  const parsed = parseGGUFShardFilename(firstPartFilename);
  if (!parsed) {
    return firstPartFilename;
  }

  const suffix = `-00001-of-${String(parsed.total).padStart(5, '0')}.gguf`;
  return firstPartFilename.endsWith(suffix)
    ? firstPartFilename.slice(0, -suffix.length)
    : firstPartFilename;
}

function sortShardFiles(files: ModelFile[]): ModelFile[] {
  return [...files].sort((a, b) => {
    const aShard = parseGGUFShardFilename(a.rfilename)?.shard ?? 0;
    const bShard = parseGGUFShardFilename(b.rfilename)?.shard ?? 0;
    return aShard - bShard;
  });
}

export function getSplitDownloadRequiredSpace(file: ModelFile): number {
  if (!file.split) {
    return file.size || 0;
  }

  return file.split.totalSize || file.size || 0;
}

export function firstSplitPartFilename(file: ModelFile): string {
  return file.split?.entryRFilename || file.rfilename;
}

export function expandSplitModelFile(file: ModelFile): ModelFile[] {
  if (!file.split) {
    return [file];
  }

  return file.split.parts.map(part => ({
    rfilename: part.rfilename,
    size: part.size,
    url: part.url,
    oid: part.oid,
    lfs: part.lfs,
  }));
}

export function normalizeGGUFModelFiles(files: ModelFile[]): ModelFile[] {
  const regularFiles: ModelFile[] = [];
  const splitFiles: ModelFile[] = [];
  const shardGroups = new Map<
    string,
    {total: number; parts: Map<number, ModelFile>}
  >();

  for (const file of files || []) {
    const filename = file.rfilename || '';
    const lowerFilename = filename.toLowerCase();
    if (!lowerFilename.endsWith('.gguf')) {
      continue;
    }

    if (file.split) {
      const sortedParts = [...file.split.parts].sort(
        (a, b) => a.index - b.index,
      );
      if (sortedParts.length !== file.split.totalParts || !sortedParts[0]) {
        continue;
      }

      const firstPart = sortedParts[0];
      const entryRFilename =
        file.split.entryRFilename || firstPart.rfilename || file.rfilename;
      const totalSize =
        file.split.totalSize ||
        sortedParts.reduce(
          (sum, part) => sum + (part.size || part.lfs?.size || 0),
          0,
        );

      splitFiles.push({
        ...file,
        rfilename: entryRFilename,
        size: totalSize || file.size,
        url: firstPart.url || file.url,
        oid: firstPart.oid || file.oid,
        lfs: firstPart.lfs || file.lfs,
        split: {
          ...file.split,
          entryRFilename,
          displayRFilename:
            file.split.displayRFilename || getDisplayFilename(entryRFilename),
          totalSize: totalSize > 0 ? totalSize : file.split.totalSize,
          parts: sortedParts,
        },
      });
      continue;
    }

    const parsed = parseGGUFShardFilename(filename);
    if (!parsed) {
      regularFiles.push(file);
      continue;
    }

    const key = getShardGroupKey(filename, parsed);
    const group = shardGroups.get(key) || {
      total: parsed.total,
      parts: new Map<number, ModelFile>(),
    };
    if (group.total === parsed.total) {
      group.parts.set(parsed.shard, file);
      shardGroups.set(key, group);
    }
  }

  for (const group of shardGroups.values()) {
    if (group.parts.size !== group.total) {
      continue;
    }

    const parts = Array.from(group.parts.values());
    const sortedParts = sortShardFiles(parts);
    const firstPart = sortedParts[0];
    const totalSize = sortedParts.reduce(
      (sum, part) => sum + (part.size || part.lfs?.size || 0),
      0,
    );
    const split: SplitModelFile = {
      entryRFilename: firstPart.rfilename,
      displayRFilename: getDisplayFilename(firstPart.rfilename),
      totalSize: totalSize > 0 ? totalSize : undefined,
      totalParts: group.total,
      parts: sortedParts.map(part => {
        const parsed = parseGGUFShardFilename(part.rfilename)!;
        return {
          rfilename: part.rfilename,
          index: parsed.shard,
          total: parsed.total,
          size: part.size || part.lfs?.size,
          url: part.url,
          oid: part.oid,
          lfs: part.lfs,
        };
      }),
    };

    splitFiles.push({
      rfilename: firstPart.rfilename,
      size: split.totalSize,
      url: firstPart.url,
      oid: firstPart.oid,
      lfs: firstPart.lfs,
      split,
    });
  }

  return [...regularFiles, ...splitFiles];
}

/**
 * Filters out non-GGUF files and aggregates complete GGUF split sets.
 * @param siblings - Array of model files/siblings
 * @returns Filtered array containing only valid GGUF files
 */
export function filterValidGGUFFiles(siblings: any[]): any[] {
  return normalizeGGUFModelFiles(siblings || []);
}

/**
 * Adds proper download URLs to model files based on modelId
 * @param modelId - The HuggingFace model ID (e.g., "microsoft/DialoGPT-medium")
 * @param siblings - Array of model files
 * @returns Array of siblings with download URLs added
 */
export function addModelFileDownloadUrls(
  modelId: string,
  siblings: any[],
  domain?: string,
): ModelFile[] {
  return siblings.map(sibling => ({
    ...sibling,
    url: domain
      ? urls.hfCompatibleModelDownloadFile(domain, modelId, sibling.rfilename)
      : urls.modelDownloadFile(modelId, sibling.rfilename),
    split: sibling.split
      ? {
          ...sibling.split,
          parts: sibling.split.parts.map((part: any) => ({
            ...part,
            url: domain
              ? urls.hfCompatibleModelDownloadFile(
                  domain,
                  modelId,
                  part.rfilename,
                )
              : urls.modelDownloadFile(modelId, part.rfilename),
          })),
        }
      : undefined,
  }));
}

/**
 * Normalizes model siblings array to ensure consistent format
 * Filters GGUF files and adds download URLs
 * @param modelId - The HuggingFace model ID
 * @param siblings - Raw siblings array from HF API
 * @returns Normalized siblings array with consistent format
 */
export function normalizeModelSiblings(
  modelId: string,
  siblings: any[],
  domain?: string,
): ModelFile[] {
  const filteredSiblings = filterValidGGUFFiles(siblings);
  return addModelFileDownloadUrls(modelId, filteredSiblings, domain);
}

function getString(value: any): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstString(...values: any[]): string | undefined {
  for (const value of values) {
    const text = getString(value);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function getHFModelAvatar(model: HuggingFaceModel): string | undefined {
  const author = getString(model.author);

  return firstString(
    model.avatarUrl,
    (model as any).avatar_url,
    (model as any).avatar,
    (model as any).authorData?.avatarUrl,
    (model as any).authorData?.avatar_url,
    (model as any).authorData?.avatar,
    (model as any).owner?.avatarUrl,
    (model as any).owner?.avatar_url,
    (model as any).owner?.avatar,
    author ? `${urls.modelWebPage(author)}.png` : undefined,
  );
}

/**
 * Processes HuggingFace search results to ensure consistent format
 * - Adds model web page URL
 * - Filters and normalizes siblings array
 * @param models - Array of HuggingFace models from search results
 * @returns Processed models with normalized siblings
 */
export function processHFSearchResults(
  models: HuggingFaceModel[],
  options?: {
    source?: ModelSourceId;
    domain?: string;
  },
): HuggingFaceModel[] {
  return models.map(model => ({
    ...model,
    source: options?.source || model.source || 'huggingface',
    sourceRepoId: model.sourceRepoId || model.id,
    url: options?.domain
      ? urls.hfCompatibleModelWebPage(options.domain, model.id)
      : urls.modelWebPage(model.id),
    avatarUrl: getHFModelAvatar(model),
    siblings: normalizeModelSiblings(
      model.id,
      model.siblings || [],
      options?.domain,
    ),
  }));
}

/**
 * Creates normalized siblings array from file details (used in PalStore)
 * @param modelId - The HuggingFace model ID
 * @param fileDetails - Array of file details from HF API
 * @returns Normalized siblings array matching HFStore format
 */
export function createSiblingsFromFileDetails(
  modelId: string,
  fileDetails: any[],
  domain?: string,
): ModelFile[] {
  // Convert file details to siblings format
  const siblings = fileDetails.map(file => ({
    rfilename: file.path,
    size: file.size,
    oid: file.oid,
    lfs: file.lfs,
    split: file.split,
  }));

  // Apply the same normalization as HFStore
  return normalizeModelSiblings(modelId, siblings, domain);
}

/**
 * Checks if a filename represents a sharded GGUF file
 * @param filename - The filename to check
 * @returns True if the file is a sharded GGUF file
 */
export function isShardedGGUFFile(filename: string): boolean {
  return RE_GGUF_SHARD_FILE.test(filename);
}

/**
 * Checks if a filename is a valid GGUF file (not sharded)
 * @param filename - The filename to check
 * @returns True if the file is a valid GGUF file
 */
export function isValidGGUFFile(filename: string): boolean {
  const lowerFilename = filename.toLowerCase();
  return lowerFilename.endsWith('.gguf') && !isShardedGGUFFile(filename);
}
