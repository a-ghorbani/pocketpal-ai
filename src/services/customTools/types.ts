export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {[key: string]: JsonValue};

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Steps run in this fixed order; every one is optional. */
export interface CustomToolResponsePipeline {
  extract?: string;
  fields?: string[];
  maxItems?: number;
  template?: string;
  maxChars?: number;
  wrapUntrusted?: boolean;
}

export interface CustomToolRequest {
  method: HttpMethod;
  url: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: JsonValue;
}

export interface CustomToolParameters {
  type: 'object';
  properties: Record<string, Record<string, any>>;
  required?: string[];
}

export interface CustomToolDefinition {
  /** Stable across a rename; keys the Keychain entry. */
  id: string;
  name: string;
  description: string;
  parameters: CustomToolParameters;
  request: CustomToolRequest;
  response?: CustomToolResponsePipeline;
  timeoutMs: number;
  requiresConfirmation: boolean;
}

/** What the editor and import build; the store assigns the id. */
export type CustomToolDraft = Omit<CustomToolDefinition, 'id'>;

/**
 * Validator failures are codes, never English. The UI resolves each one to
 * copy from `en.json`, so a rejection can never put a raw code on screen.
 */
export const CUSTOM_TOOL_ERROR_CODES = [
  'shape_invalid',
  'name_invalid',
  'name_builtin',
  'name_taken',
  'description_empty',
  'required_not_declared',
  'placeholder_undeclared',
  'url_scheme',
  'url_userinfo',
  'url_placeholder_in_origin',
  'secret_placement',
  'body_not_allowed',
  'body_placeholder_mixed',
] as const;

export type CustomToolErrorCode = (typeof CUSTOM_TOOL_ERROR_CODES)[number];

export interface ValidationIssue {
  code: CustomToolErrorCode;
  params?: Record<string, string | number>;
}

export type ValidationResult<T> =
  | {ok: true; value: T}
  | {ok: false; issues: ValidationIssue[]};

export const DEFAULT_TIMEOUT_MS = 15000;
export const MIN_TIMEOUT_MS = 1000;
export const MAX_TIMEOUT_MS = 120000;
