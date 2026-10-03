/**
 * User-selectable server types. Gates the per-server reasoning wire payload
 * (see api/openai.ts buildReasoningPayload). detectServerType seeds the value
 * best-effort; the user's selection wins.
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
export function seedServerType(detected: string, url: string): string {
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
