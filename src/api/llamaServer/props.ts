import {RemoteModelCaps, SamplerDefaults} from '../../utils/types';
import {finiteNumber} from '../../utils/finite';
import type {SamplerParam} from '../../utils/samplerParams';
import {buildHeaders, normalizeUrl, resolveTimeout} from '../http';
import {SERVER_PROFILES} from '../servers';

/**
 * The name each control is reported under, derived from the names it is sent
 * under so the two cannot drift. `n_predict` is the one entry whose read name
 * is not its send name: it is reported under `n_predict` and sent as
 * `max_completion_tokens`.
 *
 * Total over `SamplerParam`, so a control added to the vocabulary without a
 * llama.cpp name fails to compile here.
 */
export const PROPS_READ_NAMES = {
  ...SERVER_PROFILES['llama.cpp'].sendNames,
  n_predict: 'n_predict',
} satisfies Record<SamplerParam, string>;

// A fire-and-forget probe must neither inherit the 30 s connection default nor
// an arbitrarily large user-set timeout.
export const PROPS_TIMEOUT_MS = 5000;

/**
 * The server's own generation defaults, read under the same wire names a
 * request is sent under. Values sit under `params` on current builds and
 * directly on `default_generation_settings` on older ones.
 *
 * `seed` is skipped: the server reports the live seed, which is not a value
 * anyone should be offered as a default to return to.
 */
function readSamplerDefaults(generationSettings: any): SamplerDefaults {
  const defaults: SamplerDefaults = {};
  for (const param of Object.keys(PROPS_READ_NAMES) as SamplerParam[]) {
    if (param === 'seed') {
      continue;
    }
    const wireName = PROPS_READ_NAMES[param];
    const value = finiteNumber(
      generationSettings?.params?.[wireName] ?? generationSettings?.[wireName],
    );
    if (value !== undefined) {
      defaults[param] = value;
    }
  }
  return defaults;
}

/**
 * Fetch what a llama.cpp server reports for one model via GET /props.
 * Pure: never throws — a timeout, non-2xx, or malformed body resolves every
 * field to unknown so the caller's
 * models path and connection are never affected. `/props` is
 * llama.cpp-specific; a caller asks `profileFor(type).hasProps`
 * before invoking, never the type itself.
 *
 * `modelId` scopes the request (`?model=<id>`). A multi-model router answers
 * the bare form with a placeholder (`role: 'router'`, `model_path: 'none'`,
 * `n_ctx: 0`, `modalities` absent) that describes no model, so a field is only
 * ever returned when the body describes an actually loaded model. Absent field
 * = unknown; the caller merges field-wise and never blanks a known value.
 *
 * Key names verified against live llama.cpp builds (b9910, b9976): context
 * window is `default_generation_settings.n_ctx` (top-level `n_ctx` is an
 * older-build fallback); vision is `modalities.vision`.
 */
export async function fetchServerProps(
  serverUrl: string,
  apiKey?: string,
  timeoutMs?: number,
  modelId?: string,
): Promise<RemoteModelCaps> {
  const url =
    `${normalizeUrl(serverUrl)}/props` +
    (modelId ? `?model=${encodeURIComponent(modelId)}` : '');
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTimeout(timeoutMs, PROPS_TIMEOUT_MS),
  );

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
      signal: controller.signal,
    });
    if (!response.ok) {
      return {};
    }
    const data = await response.json();
    const caps: RemoteModelCaps = {};

    const nCtx: unknown =
      data?.default_generation_settings?.n_ctx ?? data?.n_ctx;
    if (typeof nCtx === 'number' && Number.isFinite(nCtx) && nCtx > 0) {
      caps.contextLength = nCtx;
    }

    const modelPath: unknown = data?.model_path;
    const describesModel =
      (typeof modelPath === 'string' &&
        modelPath !== '' &&
        modelPath !== 'none') ||
      caps.contextLength !== undefined;

    if (describesModel) {
      caps.supportsVision = data?.modalities?.vision === true;

      const samplerDefaults = readSamplerDefaults(
        data?.default_generation_settings,
      );
      if (Object.keys(samplerDefaults).length > 0) {
        caps.samplerDefaults = samplerDefaults;
      }
    }

    return caps;
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}
