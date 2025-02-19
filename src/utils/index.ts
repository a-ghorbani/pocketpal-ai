import * as React from 'react';
import {ColorValue} from 'react-native';

import _ from 'lodash';
import dayjs from 'dayjs';
import {MD3Theme} from 'react-native-paper';
import DeviceInfo from 'react-native-device-info';
import Blob from 'react-native/Libraries/Blob/Blob';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {l10n} from './l10n';
import {getHFDefaultSettings} from './chat';
import {
  HuggingFaceModel,
  MessageType,
  Model,
  ModelFile,
  ModelOrigin,
  PreviewImage,
  User,
} from './types';

export const L10nContext = React.createContext<
  (typeof l10n)[keyof typeof l10n]
>(l10n.en);
export const UserContext = React.createContext<User | undefined>(undefined);

/**
 * Formats a byte value into a human-readable string with appropriate units
 * @param size - The size in bytes to format
 * @param fractionDigits - Number of decimal places to show (default: 2)
 * @param useBinary - Whether to use binary (1024) or decimal (1000) units (default: false)
 * @param threeDigits - Whether to format the number to always show 3 significant digits (default: false)
 *                      When true:
 *                      - Numbers >= 100 show no decimals (e.g., "234 MB")
 *                      - Numbers >= 10 show 1 decimal (e.g., "23.4 MB")
 *                      - Numbers < 10 show 2 decimals (e.g., "2.34 MB")
 * @returns Formatted string with units (e.g., "1.5 MB" or "2 GiB")
 */
export const formatBytes = (
  size: number,
  fractionDigits = 2,
  useBinary = false,
  threeDigits = false,
) => {
  if (size <= 0) {
    return '0 B';
  }

  const base = useBinary ? 1024 : 1000;
  const multiple = Math.floor(Math.log(size) / Math.log(base));

  const units = useBinary
    ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
    : ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const value = size / Math.pow(base, multiple);

  if (threeDigits) {
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return value.toFixed(digits) + ' ' + units[multiple];
  }

  return parseFloat(value.toFixed(fractionDigits)) + ' ' + units[multiple];
};
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
    es: require('dayjs/locale/es'),
    ko: require('dayjs/locale/ko'),
    pl: require('dayjs/locale/pl'),
    pt: require('dayjs/locale/pt'),
    ru: require('dayjs/locale/ru'),
    tr: require('dayjs/locale/tr'),
    uk: require('dayjs/locale/uk'),
    ca: require('dayjs/locale/ca'),
  };

  locale ? locales[locale] : locales.en;
  dayjs.locale(locale);
};

/** Returns either prop or empty object if null or undefined */
export const unwrap = <T>(prop: T) => prop ?? {};

/** Returns formatted date used as a divider between different days in the chat history */
const getVerboseDateTimeRepresentation = (
  dateTime: number,
  {
    dateFormat,
    timeFormat,
  }: {
    dateFormat?: string;
    timeFormat?: string;
  },
) => {
  const formattedDate = dateFormat
    ? dayjs(dateTime).format(dateFormat)
    : dayjs(dateTime).format('MMM D');

  const formattedTime = timeFormat
    ? dayjs(dateTime).format(timeFormat)
    : dayjs(dateTime).format('HH:mm');

  const localDateTime = dayjs(dateTime);
  const now = dayjs();

  if (
    localDateTime.isSame(now, 'day') &&
    localDateTime.isSame(now, 'month') &&
    localDateTime.isSame(now, 'year')
  ) {
    return formattedTime;
  }

  return `${formattedDate}, ${formattedTime}`;
};

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

export const getModelDescription = (
  model: Model,
  isActiveModel: boolean,
  modelStore: any,
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

  const sizeString = size > 0 ? formatBytes(size) : 'N/A';
  const paramsString =
    params > 0 ? formatNumber(params, 2, true, false) : 'N/A';

  return `Size: ${sizeString} | Parameters: ${paramsString}`;
};

export async function hasEnoughSpace(model: Model): Promise<boolean> {
  try {
    const requiredSpaceBytes = model.size;

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

export function timeAgo(
  dateString: string,
  prefix: string = 'Updated ',
  suffix: string = ' ago',
): string {
  const inputDate = new Date(dateString);
  const now = new Date();

  const seconds = Math.floor((now.getTime() - inputDate.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${prefix}${years} year${years > 1 ? 's' : ''}${suffix}`;
  } else if (months > 0) {
    return `${prefix}${months} month${months > 1 ? 's' : ''}${suffix}`;
  } else if (weeks > 0) {
    return `${prefix}${weeks} week${weeks > 1 ? 's' : ''}${suffix}`;
  } else if (days > 0) {
    return `${prefix}${days} day${days > 1 ? 's' : ''}${suffix}`;
  } else if (hours > 0) {
    return `${prefix}${hours} hour${hours > 1 ? 's' : ''}${suffix}`;
  } else if (minutes > 0) {
    return `${prefix}${minutes} minute${minutes > 1 ? 's' : ''}${suffix}`;
  } else {
    return `${prefix}just now`;
  }
}

export function formatNumber(
  num: number,
  fractionDigits = 2,
  uppercase = false,
  withSpace = false,
): string {
  const space = withSpace ? ' ' : '';

  if (num < 1000) {
    return num.toString();
  } else if (num < 1_000_000) {
    const suffix = uppercase ? 'K' : 'k';
    return `${(num / 1_000)
      .toFixed(fractionDigits)
      .replace(/\.?0+$/, '')}${space}${suffix}`;
  } else if (num < 1_000_000_000) {
    const suffix = uppercase ? 'M' : 'm';
    return `${(num / 1_000_000)
      .toFixed(fractionDigits)
      .replace(/\.?0+$/, '')}${space}${suffix}`;
  } else {
    const suffix = uppercase ? 'B' : 'b';
    return `${(num / 1_000_000_000)
      .toFixed(fractionDigits)
      .replace(/\.?0+$/, '')}${space}${suffix}`;
  }
}

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

  const _model: Model = {
    id: hfModel.id + '/' + modelFile.rfilename,
    type: extractHFModelType(hfModel.id),
    author: hfModel.author,
    name: extractHFModelTitle(modelFile.rfilename),
    description: '',
    size: modelFile.size ?? 0,
    params: hfModel.specs?.gguf?.total ?? 0,
    isDownloaded: false,
    downloadUrl: modelFile.url ?? '',
    hfUrl: hfModel.url ?? '',
    progress: 0,
    filename: modelFile.rfilename,
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
  modelStore: any,
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
