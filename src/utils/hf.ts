/**
 * Utility functions for HuggingFace model processing
 * Centralizes siblings processing, filtering, and normalization logic
 */

import {urls} from '../config';
import type {HuggingFaceModel, ModelFile} from './types';

// Regex pattern for detecting sharded GGUF files
const RE_GGUF_SHARD_FILE =
  /^(?<prefix>.*?)-(?<shard>\d{5})-of-(?<total>\d{5})\.gguf$/;

/**
 * Filters out non-GGUF and sharded GGUF files from model siblings
 * @param siblings - Array of model files/siblings
 * @returns Filtered array containing only valid GGUF files
 */
export function filterValidGGUFFiles(siblings: any[]): any[] {
  return (
    siblings?.filter(sibling => {
      const filename = sibling.rfilename?.toLowerCase() || '';
      return filename.endsWith('.gguf') && !RE_GGUF_SHARD_FILE.test(filename);
    }) || []
  );
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
): ModelFile[] {
  return siblings.map(sibling => ({
    ...sibling,
    url: urls.modelDownloadFile(modelId, sibling.rfilename),
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
): ModelFile[] {
  const filteredSiblings = filterValidGGUFFiles(siblings);
  return addModelFileDownloadUrls(modelId, filteredSiblings);
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
): HuggingFaceModel[] {
  return models.map(model => ({
    ...model,
    url: urls.modelWebPage(model.id),
    siblings: normalizeModelSiblings(model.id, model.siblings || []),
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
): ModelFile[] {
  // Convert file details to siblings format
  const siblings = fileDetails.map(file => ({
    rfilename: file.path,
    size: file.size,
    oid: file.oid,
    lfs: file.lfs,
  }));

  // Apply the same normalization as HFStore
  return normalizeModelSiblings(modelId, siblings);
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
