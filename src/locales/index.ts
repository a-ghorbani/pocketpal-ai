import _ from 'lodash';

import enData from './en.json';
import jaData from './ja.json';
import zhData from './zh.json';
import idData from './id.json';

import type {Translations} from './types';

// _.merge overlays language-specific values onto en, falling back to en for missing keys.
// Using {} as first arg prevents mutation of enData.
const en: Translations = enData;
const ja: Translations = _.merge({}, enData, jaData);
const zh: Translations = _.merge({}, enData, zhData);
const id: Translations = _.merge({}, enData, idData);

export const l10n = {en, ja, zh, id} as const;

/**
 * Typed interpolation helper.
 * Replaces all {{placeholder}} patterns in the template with values from the params object.
 *
 * @example
 * t(l10n.en.storage.lowStorage, { modelSize: '4 GB', freeSpace: '2 GB' })
 * // => 'Storage low! Model 4 GB > 2 GB free'
 */
export function t(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) =>
    String(params[key] ?? `{{${key}}}`),
  );
}
