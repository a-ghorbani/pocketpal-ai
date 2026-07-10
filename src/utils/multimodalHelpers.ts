/**
 * Helper functions for multimodal support
 */

import {extractModelPrecision, getQuantRank} from '.';
import {HuggingFaceModel, ModelFile} from './types';
import {MMProjRegex} from './multimodalPatterns';

/**
 * Checks if a repository contains vision models based on the presence of mmproj files
 * @param siblings Array of model files in the repository
 * @returns boolean indicating if the repository contains vision models
 */
export function isVisionRepo(siblings: ModelFile[]): boolean {
  return siblings.some(f => MMProjRegex.test(f.rfilename));
}

/**
 * Gets the mmproj files from a repository
 * @param siblings Array of model files in the repository
 * @returns Array of mmproj filenames
 */
export function getMmprojFiles(siblings: ModelFile[]): ModelFile[] {
  return siblings.filter(f => MMProjRegex.test(f.rfilename));
}

/**
 * Gets the LLM files (non-mmproj files) from a repository
 * @param siblings Array of model files in the repository
 * @returns Array of LLM model files
 */
export function getLLMFiles(siblings: ModelFile[]): ModelFile[] {
  return siblings.filter(f => !MMProjRegex.test(f.rfilename));
}

/**
 * Checks if a model file is a projection model
 * @param filename Model filename
 * @returns boolean indicating if the model is a projection model
 */
export function isProjectionModel(filename: string): boolean {
  return MMProjRegex.test(filename);
}

/**
 * Gets the recommended projection model for a vision model
 * @param visionModelFilename Vision model filename
 * @param availableProjModels Array of available projection model filenames
 * @returns The recommended projection model filename or undefined if none found
 */
export function getRecommendedProjectionModel(
  visionModelFilename: string,
  availableProjModels: string[],
): string | undefined {
  if (availableProjModels.length === 0) {
    return undefined;
  }
  if (availableProjModels.length === 1) {
    return availableProjModels[0];
  }

  // Helper function to get the highest quality projection model
  const getHighestQualityModel = (): string => {
    return [...availableProjModels].sort((a, b) => {
      const rankA = getQuantRank(extractModelPrecision(a) || '');
      const rankB = getQuantRank(extractModelPrecision(b) || '');
      return rankB - rankA; // Sort in descending order (highest quality first)
    })[0];
  };

  const llmQuant = extractModelPrecision(visionModelFilename);
  if (!llmQuant) {
    // If no quantization detected, return the highest quality projection model
    return getHighestQualityModel();
  }

  const llmRank = getQuantRank(llmQuant);
  if (llmRank === -1) {
    // If quantization not recognized, return the highest quality projection model
    return getHighestQualityModel();
  }

  // First: exact match
  const exactMatch = availableProjModels.find(
    p => extractModelPrecision(p)?.toLowerCase() === llmQuant.toLowerCase(),
  );
  if (exactMatch) {
    return exactMatch;
  }

  // Second: find closest higher or equal quality match
  const sortedByProximity = [...availableProjModels].sort((a, b) => {
    const rankA = getQuantRank(extractModelPrecision(a) || '');
    const rankB = getQuantRank(extractModelPrecision(b) || '');
    const diffA =
      rankA - llmRank >= 0 ? rankA - llmRank : Number.MAX_SAFE_INTEGER;
    const diffB =
      rankB - llmRank >= 0 ? rankB - llmRank : Number.MAX_SAFE_INTEGER;
    return diffA - diffB;
  });

  const closestMatch = sortedByProximity.find(
    p => getQuantRank(extractModelPrecision(p) || '') >= llmRank,
  );

  // If no higher quality match found, return the highest quality available
  return closestMatch ?? getHighestQualityModel();
}

/**
 * Filters out projection models from a list of models for display purposes
 * @param models Array of models to filter
 * @returns Array of models with projection models removed
 */
export function filterProjectionModels<T extends {modelType?: string}>(
  models: T[],
): T[] {
  return models.filter(model => model.modelType !== 'projection');
}

/**
 * Gets size breakdown for a vision model using HF siblings data
 * This is used in HF search context where projection models aren't in modelStore yet
 * @param modelFile The LLM model file
 * @param hfModel The HF model containing siblings
 * @returns Object with llmSize, projectionSize, and totalSize
 */
export function getVisionModelSizeBreakdown(
  modelFile: ModelFile,
  hfModel: HuggingFaceModel,
): {
  llmSize: number;
  projectionSize: number;
  totalSize: number;
  hasProjection: boolean;
} {
  const llmSize = modelFile.size || 0;
  let projectionSize = 0;
  let hasProjection = false;

  // Find the default projection model from siblings
  const mmprojFiles = getMmprojFiles(hfModel.siblings || []);
  if (mmprojFiles.length > 0) {
    // Get the recommended projection model
    const recommendedProj = getRecommendedProjectionModel(
      modelFile.rfilename,
      mmprojFiles.map(f => f.rfilename),
    );

    if (recommendedProj) {
      const projFile = mmprojFiles.find(f => f.rfilename === recommendedProj);
      if (projFile && projFile.size) {
        projectionSize = projFile.size;
        hasProjection = true;
      }
    }
  }

  return {
    llmSize,
    projectionSize,
    totalSize: llmSize + projectionSize,
    hasProjection,
  };
}
