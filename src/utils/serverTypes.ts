/**
 * User-selectable server types. Selects the server's profile (`api/servers/`,
 * one per type): its sampler send names, its request body beyond the
 * transport's own keys, its final-chunk reading, its models-list row parsing
 * and its discovery flags. detectServerType seeds the value best-effort; the
 * user's selection wins.
 */
export const SERVER_TYPE_OPTIONS = [
  'llama.cpp',
  'LM Studio',
  'Ollama',
  'OpenAI',
  'vLLM',
  'unknown',
] as const;

export type ServerTypeOption = (typeof SERVER_TYPE_OPTIONS)[number];

export type ServerType = ServerTypeOption;

/**
 * Persisted records are not type-checked on hydration, and detection may fail,
 * so a stored value can be a legacy empty string or any free string. An exact,
 * case-sensitive match keeps `'Llama.CPP'` out of the llama.cpp wire.
 */
export function toServerType(raw: unknown): ServerType {
  return SERVER_TYPE_OPTIONS.includes(raw as ServerType)
    ? (raw as ServerType)
    : 'unknown';
}

/**
 * Server-type options shaped for the ui Dropdown. Trigger testID is
 * `server-type-dropdown`; each item carries `server-type-option-<value>` so
 * e2e can both read the seeded value and pick an override.
 */
export const SERVER_TYPE_DROPDOWN_OPTIONS = SERVER_TYPE_OPTIONS.map(option => ({
  value: option,
  label: option,
  testID: `server-type-option-${option}`,
}));

/**
 * Best-effort seed for a server's type from the detection result plus a host
 * heuristic (api.openai.com → OpenAI). detectServerType cannot classify
 * OpenAI or vLLM, so the user can correct it on the server sheet.
 */
export function seedServerType(
  detected: ServerType | undefined,
  url: string,
): ServerType {
  if (detected) {
    return detected;
  }
  try {
    if (new URL(url).hostname.endsWith('api.openai.com')) {
      return 'OpenAI';
    }
  } catch {
    // ignore malformed URL
  }
  return 'unknown';
}
