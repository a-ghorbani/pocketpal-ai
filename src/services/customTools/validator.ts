import {z} from 'zod';

import {BUILTIN_TALENT_NAMES} from '../talents/builtinTalentNames';

import {
  CUSTOM_TOOL_ERROR_CODES,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
} from './types';
import type {
  CustomToolDraft,
  CustomToolRequest,
  JsonValue,
  ValidationIssue,
  ValidationResult,
} from './types';

const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;
const WHOLE_PLACEHOLDER_PATTERN = /^\{\{[^{}]+\}\}$/;
const SECRET_PREFIX = 'secret.';
const METHODS_ALLOWING_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Every `{{…}}` name in a template string, in order, trimmed. */
export function placeholdersIn(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    names.push(match[1].trim());
  }
  return names;
}

export const isSecretPlaceholder = (name: string): boolean =>
  name.startsWith(SECRET_PREFIX);

export const secretPlaceholderName = (name: string): string =>
  name.slice(SECRET_PREFIX.length);

export type SlotKind = 'url' | 'query' | 'header' | 'body';

export interface TemplateSlot {
  text: string;
  kind: SlotKind;
  /** The header name, for `header` slots only. */
  headerName?: string;
}

function collectBodyStrings(
  value: JsonValue | undefined,
  into: string[],
): void {
  if (typeof value === 'string') {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBodyStrings(item, into);
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectBodyStrings(item, into);
    }
  }
}

/** Every template-bearing string in a request, tagged with where it sits. */
export function templateSlots(request: CustomToolRequest): TemplateSlot[] {
  const slots: TemplateSlot[] = [{text: request.url, kind: 'url'}];
  for (const text of Object.values(request.query ?? {})) {
    slots.push({text, kind: 'query'});
  }
  for (const [headerName, text] of Object.entries(request.headers ?? {})) {
    slots.push({text, kind: 'header', headerName});
  }
  const bodyStrings: string[] = [];
  collectBodyStrings(request.body, bodyStrings);
  for (const text of bodyStrings) {
    slots.push({text, kind: 'body'});
  }
  return slots;
}

const isAuthorizationHeader = (headerName: string | undefined): boolean =>
  (headerName ?? '').toLowerCase() === 'authorization';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const draftSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.record(z.string(), z.any())),
    required: z.array(z.string()).optional(),
  }),
  request: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string().min(1),
    query: z.record(z.string(), z.string()).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: jsonValueSchema.optional(),
  }),
  response: z
    .object({
      extract: z.string().optional(),
      fields: z.array(z.string()).optional(),
      maxItems: z.number().int().positive().optional(),
      template: z.string().optional(),
      maxChars: z.number().int().positive().optional(),
      wrapUntrusted: z.boolean().optional(),
    })
    .optional(),
  timeoutMs: z.number().optional(),
  requiresConfirmation: z.boolean().optional(),
});

/**
 * Split a URL into its literal origin and the rest. Scheme, userinfo, host and
 * port must be literal, so the origin is what placeholder rules forbid.
 */
function splitOrigin(url: string): {authority: string} | null {
  const scheme = /^https?:\/\//i.exec(url);
  if (!scheme) {
    return null;
  }
  const afterScheme = url.slice(scheme[0].length);
  const pathStart = afterScheme.search(/[/?#]/);
  return {
    authority: pathStart === -1 ? afterScheme : afterScheme.slice(0, pathStart),
  };
}

/**
 * Definitions reach the validator straight from MobX state, and zod refuses an
 * observable proxy outright. Parsing a plain JSON snapshot keeps this module
 * free of any MobX import while still accepting live store objects.
 */
const toPlainJson = (input: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(input));
  } catch {
    return input;
  }
};

export interface ValidateOptions {
  /** Names already taken by other custom tools. */
  peerNames?: Iterable<string>;
}

/**
 * The single validator behind `addTool`, `updateTool` and `importTools`. Pure:
 * it reaches no store and no React context, so it can never resolve copy —
 * callers map the returned codes to `en.json` entries.
 */
export function validateDefinition(
  input: unknown,
  options: ValidateOptions = {},
): ValidationResult<CustomToolDraft> {
  const parsed = draftSchema.safeParse(toPlainJson(input));
  if (!parsed.success) {
    return {ok: false, issues: [{code: 'shape_invalid'}]};
  }
  const draft = parsed.data;
  const issues: ValidationIssue[] = [];

  if (!NAME_PATTERN.test(draft.name)) {
    issues.push({code: 'name_invalid'});
  }
  if (BUILTIN_TALENT_NAMES.has(draft.name)) {
    issues.push({code: 'name_builtin', params: {name: draft.name}});
  }
  if (new Set(options.peerNames ?? []).has(draft.name)) {
    issues.push({code: 'name_taken', params: {name: draft.name}});
  }
  if (draft.description.trim().length === 0) {
    issues.push({code: 'description_empty'});
  }

  const declared = new Set(Object.keys(draft.parameters.properties));
  for (const name of draft.parameters.required ?? []) {
    if (!declared.has(name)) {
      issues.push({code: 'required_not_declared', params: {name}});
    }
  }

  const {request} = draft;
  const origin = splitOrigin(request.url);
  if (!origin) {
    issues.push({code: 'url_scheme'});
  } else {
    if (origin.authority.includes('@')) {
      issues.push({code: 'url_userinfo'});
    }
    if (origin.authority.includes('{{')) {
      issues.push({code: 'url_placeholder_in_origin'});
    }
  }

  if (
    request.body !== undefined &&
    !METHODS_ALLOWING_BODY.has(request.method)
  ) {
    issues.push({code: 'body_not_allowed', params: {method: request.method}});
  }

  for (const slot of templateSlots(request)) {
    if (
      slot.kind === 'body' &&
      slot.text.includes('{{') &&
      !WHOLE_PLACEHOLDER_PATTERN.test(slot.text)
    ) {
      issues.push({code: 'body_placeholder_mixed', params: {text: slot.text}});
    }
    for (const placeholder of placeholdersIn(slot.text)) {
      if (isSecretPlaceholder(placeholder)) {
        const allowed =
          slot.kind === 'query' ||
          (slot.kind === 'header' && isAuthorizationHeader(slot.headerName));
        if (!allowed) {
          issues.push({
            code: 'secret_placement',
            params: {name: secretPlaceholderName(placeholder)},
          });
        }
        continue;
      }
      if (!declared.has(placeholder)) {
        issues.push({
          code: 'placeholder_undeclared',
          params: {name: placeholder},
        });
      }
    }
  }

  if (issues.length > 0) {
    return {ok: false, issues};
  }

  const timeout = draft.timeoutMs;
  const timeoutMs =
    typeof timeout === 'number' && Number.isFinite(timeout)
      ? Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(timeout)))
      : DEFAULT_TIMEOUT_MS;

  return {
    ok: true,
    value: {
      name: draft.name,
      description: draft.description,
      parameters: draft.parameters,
      request: request as CustomToolRequest,
      ...(draft.response ? {response: draft.response} : {}),
      timeoutMs,
      requiresConfirmation: draft.requiresConfirmation ?? true,
    },
  };
}

export {CUSTOM_TOOL_ERROR_CODES};
