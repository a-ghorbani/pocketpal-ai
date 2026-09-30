import {wrapUntrusted} from '../talents/untrustedContent';

import {evaluateJsonPath} from './jsonPath';
import {redact} from './redact';
import type {CustomToolResponsePipeline} from './types';

const DEFAULT_MAX_ITEMS = 10;
const DEFAULT_MAX_CHARS = 4000;
const TRUNCATION_MARKER = '\n…(truncated)';
const EMPTY_RESPONSE = '(empty response)';
const NO_ITEMS = '(no items)';

export type PipelineFailure = 'invalid_json' | 'extract_miss';

export type PipelineResult =
  | {ok: true; summary: string}
  | {ok: false; reason: PipelineFailure};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Non-object items pass through untouched, per the field-picking contract. */
function pickFields(item: unknown, fields: string[]): unknown {
  if (!isPlainObject(item)) {
    return item;
  }
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in item) {
      picked[field] = item[field];
    }
  }
  return picked;
}

function renderItem(item: unknown, template: string | undefined): string {
  if (template === undefined) {
    return JSON.stringify(item) ?? '';
  }
  return template.replace(/\{\{([^{}]*)\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    if (!isPlainObject(item) || !(key in item)) {
      return '';
    }
    const value = item[key];
    return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  });
}

/**
 * Run the fixed pipeline: extract → fields → maxItems → template → redact →
 * maxChars → wrapUntrusted. Pure in `(text, response, secretValues)`; the
 * caller turns a failure into the engine-authored error summary.
 */
export function runResponsePipeline(
  text: string,
  response: CustomToolResponsePipeline | undefined,
  secretValues: Iterable<string> = [],
): PipelineResult {
  const needsJson = Boolean(
    response?.extract || response?.fields || response?.template,
  );
  let summary: string;

  if (!needsJson) {
    summary = text.trim().length === 0 ? EMPTY_RESPONSE : text;
  } else {
    if (text.trim().length === 0) {
      return {ok: false, reason: 'invalid_json'};
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {ok: false, reason: 'invalid_json'};
    }

    let value: unknown = parsed;
    if (response?.extract) {
      const extracted = evaluateJsonPath(parsed, response.extract);
      if (!extracted.found) {
        return {ok: false, reason: 'extract_miss'};
      }
      value = extracted.value;
    }

    let items: unknown[] = Array.isArray(value) ? value : [value];
    if (response?.fields) {
      const fields = response.fields;
      items = items.map(item => pickFields(item, fields));
    }
    items = items.slice(0, response?.maxItems ?? DEFAULT_MAX_ITEMS);

    summary =
      items.length === 0
        ? NO_ITEMS
        : items.map(item => renderItem(item, response?.template)).join('\n');
  }

  summary = redact(summary, secretValues);

  const maxChars = response?.maxChars ?? DEFAULT_MAX_CHARS;
  if (summary.length > maxChars) {
    summary = summary.slice(0, maxChars) + TRUNCATION_MARKER;
  }

  if (response?.wrapUntrusted !== false) {
    summary = wrapUntrusted(summary);
  }
  return {ok: true, summary};
}
