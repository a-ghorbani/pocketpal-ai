import * as React from 'react';
import {ColorValue} from 'react-native';

import _ from 'lodash';
import dayjs from 'dayjs';
import {MD3Theme} from 'react-native-paper';
import DeviceInfo from 'react-native-device-info';
import Blob from 'react-native/Libraries/Blob/Blob';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {l10n} from './l10n';
import {modelStore} from '../store';
import {getHFDefaultSettings} from './chat';
import {formatBytes, formatNumber} from './formatters';
import {getVerboseDateTimeRepresentation} from './formatters';
import {
  HuggingFaceModel,
  MessageType,
  Model,
  ModelFile,
  ModelOrigin,
  ModelType,
  PreviewImage,
  User,
} from './types';
import {
  isVisionRepo,
  getMmprojFiles,
  isProjectionModel,
  getRecommendedProjectionModel,
  getVisionModelSizeBreakdown,
} from './multimodalHelpers';

export const L10nContext = React.createContext<
  (typeof l10n)[keyof typeof l10n]
>(l10n.en);
export const UserContext = React.createContext<User | undefined>(undefined);

/** Returns size in bytes of the provided text */
export const getTextSizeInBytes = (text: string) => new Blob([text]).size;

/** Returns theme colors as ColorValue array */
export const getThemeColorsAsArray = (theme: MD3Theme): ColorValue[] => {
  const colors = theme.colors;
  return Object.values(colors) as ColorValue[];
};

/** Returns user avatar and name color based on the ID */
export const getUserAvatarNameColor = (user: User, colors: ColorValue[]) =>
  colors[hashCode(user.id) % colors.length];

/** Returns user initials (can have only first letter of firstName/lastName or both) */
export const getUserInitials = ({firstName, lastName}: User) =>
  `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`
    .toUpperCase()
    .trim();

/** Returns user name as joined firstName and lastName */
export const getUserName = ({firstName, lastName}: User) =>
  `${firstName ?? ''} ${lastName ?? ''}`.trim();

/** Returns hash code of the provided text */
export const hashCode = (text = '') => {
  let i,
    chr,
    hash = 0;
  if (text.length === 0) {
    return hash;
  }
  for (i = 0; i < text.length; i++) {
    chr = text.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = (hash << 5) - hash + chr;
    // eslint-disable-next-line no-bitwise
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

/** Inits dayjs locale */
export const initLocale = (locale?: keyof typeof l10n) => {
  const locales: {[key in keyof typeof l10n]: unknown} = {
    en: require('dayjs/locale/en'),
    // es: require('dayjs/locale/es'),
    // ko: require('dayjs/locale/ko'),
    // pl: require('dayjs/locale/pl'),
    // pt: require('dayjs/locale/pt'),
    // ru: require('dayjs/locale/ru'),
    // tr: require('dayjs/locale/tr'),
    // uk: require('dayjs/locale/uk'),
    // ca: require('dayjs/locale/ca'),
    // de: require('dayjs/locale/de'),
    ja: require('dayjs/locale/ja'),
    zh: require('dayjs/locale/zh'),
  };

  locale ? locales[locale] : locales.en;
  dayjs.locale(locale);
};

/** Returns either prop or empty object if null or undefined */
export const unwrap = <T>(prop: T) => prop ?? {};

/** Parses provided messages to chat messages (with headers) and returns them with a gallery */
export const calculateChatMessages = (
  messages: MessageType.Any[],
  user: User,
  {
    customDateHeaderText,
    dateFormat,
    showUserNames,
    timeFormat,
  }: {
    customDateHeaderText?: (dateTime: number) => string;
    dateFormat?: string;
    showUserNames: boolean;
    timeFormat?: string;
  },
) => {
  let chatMessages: MessageType.DerivedAny[] = [];
  let gallery: PreviewImage[] = [];

  let shouldShowName = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const isFirst = i === messages.length - 1;
    const isLast = i === 0;
    const message = messages[i];
    const messageHasCreatedAt = !!message.createdAt;
    const nextMessage = isLast ? undefined : messages[i - 1];
    const nextMessageHasCreatedAt = !!nextMessage?.createdAt;
    const nextMessageSameAuthor = message.author.id === nextMessage?.author.id;
    const notMyMessage = message.author.id !== user.id;

    let nextMessageDateThreshold = false;
    let nextMessageDifferentDay = false;
    let nextMessageInGroup = false;
    let showName = false;

    if (showUserNames) {
      const previousMessage = isFirst ? undefined : messages[i + 1];

      const isFirstInGroup =
        notMyMessage &&
        (message.author.id !== previousMessage?.author.id ||
          (messageHasCreatedAt &&
            !!previousMessage?.createdAt &&
            message.createdAt! - previousMessage!.createdAt! > 60000));

      if (isFirstInGroup) {
        shouldShowName = false;
        if (message.type === 'text') {
          showName = true;
        } else {
          shouldShowName = true;
        }
      }

      if (message.type === 'text' && shouldShowName) {
        showName = true;
        shouldShowName = false;
      }
    }

    if (messageHasCreatedAt && nextMessageHasCreatedAt) {
      nextMessageDateThreshold =
        nextMessage!.createdAt! - message.createdAt! >= 900000;

      nextMessageDifferentDay = !dayjs(message.createdAt!).isSame(
        nextMessage!.createdAt!,
        'day',
      );

      nextMessageInGroup =
        nextMessageSameAuthor &&
        nextMessage!.createdAt! - message.createdAt! <= 60000;
    }

    if (isFirst && messageHasCreatedAt) {
      const text =
        customDateHeaderText?.(message.createdAt!) ??
        getVerboseDateTimeRepresentation(message.createdAt!, {
          dateFormat,
          timeFormat,
        });
      chatMessages = [{id: text, text, type: 'dateHeader'}, ...chatMessages];
    }

    chatMessages = [
      {
        ...message,
        nextMessageInGroup,
        // TODO: Check this
        offset: !nextMessageInGroup ? 12 : 0,
        showName:
          notMyMessage &&
          showUserNames &&
          showName &&
          !!getUserName(message.author),
        showStatus: true,
      },
      ...chatMessages,
    ];

    if (nextMessageDifferentDay || nextMessageDateThreshold) {
      const text =
        customDateHeaderText?.(nextMessage!.createdAt!) ??
        getVerboseDateTimeRepresentation(nextMessage!.createdAt!, {
          dateFormat,
          timeFormat,
        });

      chatMessages = [
        {
          id: text,
          text,
          type: 'dateHeader',
        },
        ...chatMessages,
      ];
    }

    if (message.type === 'image') {
      gallery = [...gallery, {id: message.id, uri: message.uri}];
    }
  }

  return {
    chatMessages,
    gallery,
  };
};

/** Removes all derived message props from the derived message */
export const excludeDerivedMessageProps = (
  message: MessageType.DerivedMessage,
) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {nextMessageInGroup, offset, showName, showStatus, ...rest} = message;
  return {...rest} as MessageType.Any;
};

export function roundToBillion(num: number) {
  const billion = 1e9;
  return Math.round((num / billion) * 10) / 10;
}

export function bytesToGB(bytes: number): string {
  const bytesPerGB = 1000 ** 3;
  const gib = bytes / bytesPerGB;
  return gib.toFixed(2);
}

export const getModelSizeString = (
  model: Model,
  isActiveModel: boolean,
  l10nData = l10n.en,
): string => {
  // Get size from context if the model is active.
  // This is relevant only for local models (when we don't know size upfront),
  // otherwise the values should be the same.
  const size =
    isActiveModel && modelStore.context?.model
      ? modelStore.context.model.size
      : model.size;

  const notAvailable = l10nData.models.modelDescription.notAvailable;
  let sizeString = size > 0 ? formatBytes(size) : notAvailable;

  // For vision models, show combined size if projection model is available
  if (model.supportsMultimodal && model.hfModelFile && model.hfModel) {
    const sizeBreakdown = getVisionModelSizeBreakdown(
      model.hfModelFile,
      model.hfModel,
    );
    if (sizeBreakdown.hasProjection) {
      sizeString = `${formatBytes(sizeBreakdown.totalSize)}`;
    }
  }

  return sizeString;
};

export const getModelDescription = (
  model: Model,
  isActiveModel: boolean,
  l10nData = l10n.en,
): string => {
  // Get size and params from context if the model is active.
  // This is relevant only for local models (when we don't know size/params upfront),
  // otherwise the values should be the same.
  const {size, params} =
    isActiveModel && modelStore.context?.model
      ? {
          size: modelStore.context.model.size,
          params: modelStore.context.model.nParams,
        }
      : {
          size: model.size,
          params: model.params,
        };

  const notAvailable = l10nData.models.modelDescription.notAvailable;
  let sizeString = size > 0 ? formatBytes(size) : notAvailable;

  // For vision models, show combined size if projection model is available
  if (model.supportsMultimodal && model.hfModelFile && model.hfModel) {
    const sizeBreakdown = getVisionModelSizeBreakdown(
      model.hfModelFile,
      model.hfModel,
    );
    if (sizeBreakdown.hasProjection) {
      sizeString = `${formatBytes(sizeBreakdown.totalSize)}`;
    }
  }

  const paramsString =
    params > 0 ? formatNumber(params, 2, true, false) : notAvailable;

  return `${l10nData.models.modelDescription.size}${sizeString}${l10nData.models.modelDescription.separator}${l10nData.models.modelDescription.parameters}${paramsString}`;
};

export async function hasEnoughSpace(model: Model): Promise<boolean> {
  try {
    let requiredSpaceBytes = model.size;

    // For vision models, consider the total size including projection model
    if (model.supportsMultimodal && model.hfModelFile && model.hfModel) {
      const sizeBreakdown = getVisionModelSizeBreakdown(
        model.hfModelFile,
        model.hfModel,
      );
      if (sizeBreakdown.hasProjection) {
        requiredSpaceBytes = sizeBreakdown.totalSize;
      }
    }

    if (isNaN(requiredSpaceBytes) || requiredSpaceBytes <= 0) {
      console.error('Invalid model size:', model.size);
      return false;
    }

    const freeDiskBytes = await DeviceInfo.getFreeDiskStorage('important');
    // console.log('Free disk space:', freeDiskBytes);

    return requiredSpaceBytes <= freeDiskBytes;
  } catch (error) {
    console.error('Error fetching free disk space:', error);
    return false;
  }
}

/**
 * Merges properties from the source object into the target object deeply.
 * Only sets properties that do not already exist in the target or if the types differ.
 *
 * @param target - The target object to merge properties into.
 * @param source - The source object from which properties are taken.
 * @returns The updated target object after merging.
 */
export const deepMerge = (target: any, source: any): any => {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null) {
        // If the property is an object, recursively merge.
        // If target[key] is not an object, it means the property type is different so we will replace it.
        target[key] =
          target[key] && typeof target[key] === 'object' ? target[key] : {};
        deepMerge(target[key], source[key]);
      } else {
        // Set the property in the target only if it doesn't exist or if the types differ
        if (!(key in target) || typeof target[key] !== typeof source[key]) {
          target[key] = source[key];
        }
      }
    }
  }
  return target;
};

export function extractHFModelType(modelId: string): string {
  const match = modelId.match(/\/([^-]+)/);
  return match ? match[1] : 'Unknown';
}

export function extractHFModelTitle(modelId: string): string {
  // Remove "GGUF", "-GGUF", or "_GGUF" at the end regardless of case
  const sanitizedModelId = modelId.replace(/[-_]?[Gg][Gg][Uu][Ff]$/, '');

  // If there is no "/" in the modelId, ie owner is not included, return sanitizedModelId
  if (!sanitizedModelId.includes('/')) {
    return sanitizedModelId;
  }

  // Remove owner from the modelId
  const match = sanitizedModelId.match(/^([^/]+)\/(.+)$/);
  return match ? match[2] : 'Unknown';
}

export function hfAsModel(
  hfModel: HuggingFaceModel,
  modelFile: ModelFile,
): Model {
  const defaultSettings = getHFDefaultSettings(hfModel);

  // Check if this is a vision repository
  const isVision = isVisionRepo(hfModel.siblings || []);

  // Check if this is a projection model
  const isProjModel = isProjectionModel(modelFile.rfilename);

  // Check if this is a vision LLM (in a vision repo but not a projection model)
  const isVisionLLM = isVision && !isProjModel;

  // Get compatible projection models if this is a vision LLM
  let compatibleProjectionModels: string[] = [];
  let defaultProjectionModel: string | undefined;

  if (isVisionLLM) {
    // Get mmproj files from the repository
    const mmprojFiles = getMmprojFiles(hfModel.siblings || []);

    // Convert to model IDs
    compatibleProjectionModels = mmprojFiles.map(
      file => `${hfModel.id}/${file.rfilename}`,
    );

    // Set default projection model based on quantization matching
    if (compatibleProjectionModels.length > 0) {
      // Get the filenames only
      const mmprojFilenames = mmprojFiles.map(file => file.rfilename);

      // Find the best matching projection model based on quantization
      const recommendedFile = getRecommendedProjectionModel(
        modelFile.rfilename,
        mmprojFilenames,
      );

      if (recommendedFile) {
        defaultProjectionModel = `${hfModel.id}/${recommendedFile}`;
      }
    }
  }

  const _model: Model = {
    id: hfModel.id + '/' + modelFile.rfilename,
    type: extractHFModelType(hfModel.id),
    author: hfModel.author,
    name: extractHFModelTitle(modelFile.rfilename),
    size: modelFile.size ?? 0,
    params: hfModel.specs?.gguf?.total ?? 0,
    isDownloaded: false,
    downloadUrl: modelFile.url ?? '',
    hfUrl: hfModel.url ?? '',
    progress: 0,
    filename: modelFile.rfilename,
    capabilities: isVisionLLM ? ['vision'] : undefined,
    //fullPath: '',
    isLocal: false,
    origin: ModelOrigin.HF,
    defaultChatTemplate: defaultSettings.chatTemplate,
    chatTemplate: _.cloneDeep(defaultSettings.chatTemplate),
    defaultCompletionSettings: defaultSettings.completionParams,
    completionSettings: {...defaultSettings.completionParams},
    defaultStopWords: defaultSettings.completionParams.stop,
    stopWords: defaultSettings.completionParams.stop,
    hfModelFile: modelFile,
    hfModel: hfModel,

    // Set multimodal fields
    supportsMultimodal: isVisionLLM,
    modelType: isProjModel
      ? ModelType.PROJECTION
      : isVisionLLM
      ? ModelType.VISION
      : undefined,
    compatibleProjectionModels: isVisionLLM
      ? compatibleProjectionModels
      : undefined,
    defaultProjectionModel: isVisionLLM ? defaultProjectionModel : undefined,
  };

  return _model;
}
export const randId = () => Math.random().toString(36).substring(2, 11);

// There is a an issue with RNFS.hash: https://github.com/birdofpreyru/react-native-fs/issues/99
export const getSHA256Hash = async (filePath: string): Promise<string> => {
  try {
    const hash = await RNFS.hash(filePath, 'sha256');
    return hash;
  } catch (error) {
    console.error('Error generating SHA256 hash:', error);
    throw error;
  }
};

/**
 * Checks if a model's file integrity is valid by comparing  file size. Hash doesn't seem to be reliable, and expensive.
 * see: https://github.com/birdofpreyru/react-native-fs/issues/99
 * @param model - The model to check integrity for
 * @param modelStore - The model store instance for updating model details
 * @returns An object containing the integrity check result and any error message
 */
export const checkModelFileIntegrity = async (
  model: Model,
): Promise<{
  isValid: boolean;
  errorMessage: string | null;
}> => {
  try {
    // For HF models, if we don't have lfs details, fetch them
    if (model.origin === ModelOrigin.HF && !model.hfModelFile?.lfs?.size) {
      await modelStore.fetchAndUpdateModelFileDetails(model);
    }

    const filePath = await modelStore.getModelFullPath(model);
    const fileStats = await RNFS.stat(filePath);

    // If we have expected file size from HF, compare it
    if (model.hfModelFile?.lfs?.size) {
      const expectedSize = model.hfModelFile.lfs.size;
      const actualSize = fileStats.size;

      // Calculate size difference ratio
      const sizeDiffPercentage =
        Math.abs(actualSize - expectedSize) / expectedSize;

      // If size difference is more than 0.1% and hash doesn't match, consider it corrupted
      if (sizeDiffPercentage > 0.001) {
        modelStore.updateModelHash(model.id, false);

        // If hash matches, consider it valid
        if (model.hash && model.hfModelFile?.lfs?.oid) {
          if (model.hash === model.hfModelFile.lfs.oid) {
            return {
              isValid: true,
              errorMessage: null,
            };
          }
        }

        // If hash doesn't match and file size doesn't match, consider it corrupted
        return {
          isValid: false,
          errorMessage: `Model file size mismatch (${formatBytes(
            actualSize,
          )} vs ${formatBytes(expectedSize)}). Please delete and redownload.`,
        };
      }

      // File size matches within tolerance, consider it valid
      return {
        isValid: true,
        errorMessage: null,
      };
    }

    // If we reach here, either:
    // 1. We don't have size/hash info to verify against
    // 2. The file passed all available integrity checks
    return {
      isValid: true,
      errorMessage: null,
    };
  } catch (error) {
    console.error('Error checking file integrity:', error);
    return {
      isValid: false,
      errorMessage: 'Error checking file integrity. Please try again.',
    };
  }
};

export const safeParseJSON = (json: string) => {
  try {
    // First try parsing the string as-is
    try {
      return JSON.parse(json);
    } catch {
      // Clean up common issues
      let cleanJson = json.trim();

      // Find the first { and last } to extract the main JSON object
      const startIdx = cleanJson.indexOf('{');
      let endIdx = cleanJson.lastIndexOf('}');

      if (startIdx === -1) {
        throw new Error('No JSON object found');
      }

      // Check for prompt key with flexible spacing
      const hasPromptKey = /["']prompt["']\s*:/.test(cleanJson);

      // If no closing brace is found but we have the opening structure with prompt key
      if (endIdx === -1 && hasPromptKey) {
        // Add closing brace and quote if missing
        cleanJson = cleanJson + '"}';
        endIdx = cleanJson.length - 1;
      }

      // Extract what looks like the main JSON object
      cleanJson = cleanJson.substring(startIdx, endIdx + 1);

      return JSON.parse(cleanJson);
    }
  } catch (error) {
    console.log('Original json: ', json);
    console.error('Error parsing JSON:', error);
    return {prompt: '', error: error};
  }
};

/**
 * Configuration for model capabilities with their visual representation
 */
export const SKILL_CONFIG = {
  vision: {
    icon: 'eye',
    color: 'tertiary' as const,
    isSpecial: true, // Gets special visual treatment
    labelKey: 'vision' as const,
  },
  questionAnswering: {
    icon: 'help-circle-outline',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'questionAnswering' as const,
  },
  summarization: {
    icon: 'text-short',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'summarization' as const,
  },
  reasoning: {
    icon: 'brain',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'reasoning' as const,
  },
  roleplay: {
    icon: 'account-voice',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'roleplay' as const,
  },
  instructions: {
    icon: 'format-list-bulleted',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'instructions' as const,
  },
  code: {
    icon: 'code-tags',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'code' as const,
  },
  math: {
    icon: 'calculator',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'math' as const,
  },
  multilingual: {
    icon: 'translate',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'multilingual' as const,
  },
  rewriting: {
    icon: 'pencil',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'rewriting' as const,
  },
  creativity: {
    icon: 'lightbulb-outline',
    color: 'primary' as const,
    isSpecial: false,
    labelKey: 'creativity' as const,
  },
} as const;

export type SkillKey = keyof typeof SKILL_CONFIG;

/**
 * Enhanced skill item with icon and styling information
 */
export interface SkillItem {
  key: string;
  labelKey: string;
  icon?: string;
  color?: 'primary' | 'tertiary';
  isSpecial?: boolean;
}

/**
 * Get unified skills list for a model, combining capabilities and multimodal support
 * @param model - The model object
 * @returns Array of skill items with icons and styling (localization done at render time)
 */
export const getModelSkills = (model: {
  capabilities?: string[];
  supportsMultimodal?: boolean;
}): SkillItem[] => {
  const skills: SkillItem[] = [];

  // Add vision skill first if model supports multimodal
  if (model.supportsMultimodal) {
    const visionConfig = SKILL_CONFIG.vision;
    skills.push({
      key: 'vision',
      labelKey: visionConfig.labelKey,
      icon: visionConfig.icon,
      color: visionConfig.color,
      isSpecial: visionConfig.isSpecial,
    });
  }

  // Add other capabilities (excluding vision to avoid duplication)
  if (model.capabilities?.length) {
    const otherCapabilities = model.capabilities.filter(
      cap => cap !== 'vision',
    );

    otherCapabilities.forEach(capability => {
      const config = SKILL_CONFIG[capability as SkillKey];

      if (config) {
        skills.push({
          key: capability,
          labelKey: config.labelKey,
          icon: config.icon,
          color: config.color,
          isSpecial: config.isSpecial,
        });
      }
    });
  }

  return skills;
};

/**
 * Extract quantization level from filename
 * @param filename The filename to extract quantization level from
 * @returns The quantization level string (e.g., 'q4_0', 'q5_k_m', etc.) or null if not found
 */
export function extractModelPrecision(filename: string): string | null {
  const lower = filename.toLowerCase();

  // Match and return full-precision types
  const fpMatch = lower.match(/\b(f16|bf16|f32)\b/);
  if (fpMatch) {
    return fpMatch[1];
  }

  // Match quantized types like iq4_k_m, q4_0_0, q5_k, etc., and normalize to just q4, q5, etc.
  const quantMatch = lower.match(/\b[iq]?(q[1-8])(?:[_\-a-z0-9]*)?\b/);
  if (quantMatch) {
    return quantMatch[1];
  }

  return null;
}

const QUANT_ORDER = [
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'q6',
  'q8',
  'bf16',
  'f16',
  'f32',
];

export function getQuantRank(level: string): number {
  const simplified = level.toLowerCase();
  return QUANT_ORDER.indexOf(simplified);
}

export * from './errors';
export * from './fb';
export * from './formatters';
export * from './multimodalHelpers';
export * from './network';
export * from './types';
export * from './hf';
