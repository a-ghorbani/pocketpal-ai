import dayjs from 'dayjs';
import {l10n} from './l10n';
import {defaultModels} from '../store/defaultModels';
import {ModelOrigin} from './types';

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

/** Returns formatted date used as a divider between different days in the chat history */
export const getVerboseDateTimeRepresentation = (
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

export function timeAgo(
  dateValue: string | number | Date,
  l10nData = l10n.en,
  format: 'short' | 'long' = 'long',
): string {
  const inputDate =
    typeof dateValue === 'string' ? new Date(dateValue) : new Date(dateValue);
  const now = new Date();

  const seconds = Math.floor((now.getTime() - inputDate.getTime()) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  // Time value and unit, e.g. "2 days"
  let timeValue = '';

  if (years > 0) {
    timeValue = `${years} ${
      years > 1 ? l10nData.common.years : l10nData.common.year
    }`;
  } else if (months > 0) {
    timeValue = `${months} ${
      months > 1 ? l10nData.common.months : l10nData.common.month
    }`;
  } else if (weeks > 0) {
    timeValue = `${weeks} ${
      weeks > 1 ? l10nData.common.weeks : l10nData.common.week
    }`;
  } else if (days > 0) {
    timeValue = `${days} ${
      days > 1 ? l10nData.common.days : l10nData.common.day
    }`;
  } else if (hours > 0) {
    timeValue = `${hours} ${
      hours > 1 ? l10nData.common.hours : l10nData.common.hour
    }`;
  } else if (minutes > 0) {
    timeValue = `${minutes} ${
      minutes > 1 ? l10nData.common.minutes : l10nData.common.minute
    }`;
  } else {
    // Special case for "just now"
    return format === 'short'
      ? l10nData.models.search.modelUpdatedJustNowShort
      : l10nData.models.search.modelUpdatedJustNowLong;
  }

  if (format === 'short') {
    return l10nData.models.search.modelUpdatedShort.replace(
      '{{time}}',
      timeValue,
    );
  } else {
    return l10nData.models.search.modelUpdatedLong.replace(
      '{{time}}',
      timeValue,
    );
  }
}

/**
 * Strips the .gguf extension from a model filename for display purposes.
 * @param filename - The model filename (e.g., "llama-3.1-8b-q4_0.gguf")
 * @returns Clean display name without .gguf extension (e.g., "llama-3.1-8b-q4_0")
 */
export const getDisplayNameFromFilename = (filename: string): string => {
  return (filename || '').replace(/\.gguf$/i, '');
};

/**
 * Returns the original/default display name for a model.
 * - For preset models: Returns the curated display name from defaultModels
 * - For local/HF models: Returns the filename without .gguf extension
 * @param model - The model object
 * @returns The original display name
 */
export const getOriginalModelName = (model: {
  id: string;
  filename: string;
  origin: string;
}): string => {
  // For preset models, look up the original name from defaultModels
  if (model.origin === ModelOrigin.PRESET) {
    const defaultModel = defaultModels.find(
      (dm: {id: string}) => dm.id === model.id,
    );
    if (defaultModel) {
      return defaultModel.name;
    }
  }

  // For local/HF models (or preset not found), strip .gguf from filename
  return getDisplayNameFromFilename(model.filename);
};
