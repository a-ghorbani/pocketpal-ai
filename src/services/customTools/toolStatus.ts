import {BUILTIN_TALENT_NAMES} from '../talents/builtinTalentNames';

import {
  isSecretPlaceholder,
  placeholdersIn,
  secretPlaceholderName,
  templateSlots,
  validateDefinition,
} from './validator';
import type {CustomToolDefinition, ValidationIssue} from './types';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** The secret names a definition's placeholders reference. Never values. */
export function secretNames(def: CustomToolDefinition): string[] {
  const names = new Set<string>();
  for (const slot of templateSlots(def.request)) {
    for (const placeholder of placeholdersIn(slot.text)) {
      if (isSecretPlaceholder(placeholder)) {
        names.add(secretPlaceholderName(placeholder));
      }
    }
  }
  return [...names];
}

export type ToolStatus =
  | {kind: 'ok'}
  | {kind: 'invalid'; issue: ValidationIssue}
  | {kind: 'name_conflict'};

/**
 * Hydration never deletes, so a persisted tool can be invalid under the
 * current validator or collide with a built-in or an earlier peer. Both stay
 * in `tools`, unregistered and badged, until the user fixes or removes them.
 */
export function toolStatus(
  def: CustomToolDefinition,
  allTools: CustomToolDefinition[],
): ToolStatus {
  if (BUILTIN_TALENT_NAMES.has(def.name)) {
    return {kind: 'name_conflict'};
  }
  const firstWithName = allTools.find(other => other.name === def.name);
  if (firstWithName && firstWithName.id !== def.id) {
    return {kind: 'name_conflict'};
  }
  const result = validateDefinition(def);
  if (!result.ok) {
    return {kind: 'invalid', issue: result.issues[0]};
  }
  return {kind: 'ok'};
}

/** Host outside the loopback set: the editor warns, the manager badges it. */
export function isNonLoopback(def: CustomToolDefinition): boolean {
  const scheme = /^https?:\/\//i.exec(def.request.url);
  if (!scheme) {
    return true;
  }
  const afterScheme = def.request.url.slice(scheme[0].length);
  const pathStart = afterScheme.search(/[/?#]/);
  const authority =
    pathStart === -1 ? afterScheme : afterScheme.slice(0, pathStart);
  const withoutPort = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':')[0];
  return !LOOPBACK_HOSTS.has(withoutPort.toLowerCase());
}
