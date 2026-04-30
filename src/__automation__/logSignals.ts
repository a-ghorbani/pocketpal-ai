/**
 * Pure parser for llama.rn native log lines emitted during context init.
 *
 * The same lines also land in `adb logcat`, but BenchmarkRunnerScreen
 * captures them in-process via `addNativeLogListener` so it doesn't need a
 * spec wrapper or root access. `deriveLogSignals()` parses the buffer into
 * a structured payload; `deriveEffectiveBackend()` maps the payload to a
 * 4-state enum.
 *
 * Pure functions only — no Node, no React Native imports — so this module
 * is safe to import from both the screen (Hermes) and unit tests (Jest).
 *
 * The duplicate copy in `e2e/helpers/logcat.ts` is kept for the WDIO spec
 * path; consolidate when that path is deleted.
 */

/**
 * Broad filter applied to every native log line. Matches anything from
 * llama.rn's ggml-opencl backend, the generic ggml_backend_ log tags, and
 * the load-tensor / model-load statements that tell us how many layers
 * ended up on GPU.
 */
export const BENCH_LOG_RE =
  /(lm_ggml_opencl|ggml_backend_|Adreno large buffer|offloaded \d+\/\d+ layers|load_tensors:|llama_model_load|ggml_cl|adreno_gen)/;

export interface LogSignals {
  opencl_init: boolean;
  opencl_device_name: string | null;
  adreno_gen: string | null;
  large_buffer_enabled: boolean;
  large_buffer_unsupported: boolean;
  offloaded_layers: number | null;
  total_layers: number | null;
  /** First 20 matched lines, kept for human debugging. Never the primary data. */
  raw_matches: string[];
}

export type EffectiveBackend =
  | 'cpu'
  | 'opencl'
  | 'cpu+opencl-partial'
  | 'unknown';

const RAW_MATCHES_CAP = 20;

export function emptyLogSignals(): LogSignals {
  return {
    opencl_init: false,
    opencl_device_name: null,
    adreno_gen: null,
    large_buffer_enabled: false,
    large_buffer_unsupported: false,
    offloaded_layers: null,
    total_layers: null,
    raw_matches: [],
  };
}

/**
 * Parse captured native-log lines into a structured payload.
 * All regex anchors derive from llama.rn's ggml-opencl.cpp.
 */
export function deriveLogSignals(lines: string[]): LogSignals {
  const signals = emptyLogSignals();

  const deviceRe = /lm_ggml_opencl: device\s+(.+?)(?:,|\s*$)/;
  const adrenoRe = /adreno_gen:\s*(.+?)$/;
  const offloadedRe = /offloaded (\d+)\/(\d+) layers to GPU/;
  const lbUnsupportedRe =
    /Adreno large buffer.*(requested but not supported|unsupported)/i;

  for (const line of lines) {
    if (signals.raw_matches.length < RAW_MATCHES_CAP) {
      signals.raw_matches.push(line);
    }

    if (/lm_ggml_opencl: Initializing/.test(line)) {
      signals.opencl_init = true;
    }

    if (!signals.opencl_device_name) {
      const m = deviceRe.exec(line);
      if (m) {
        signals.opencl_device_name = m[1].trim();
      }
    }

    if (!signals.adreno_gen) {
      const m = adrenoRe.exec(line);
      if (m) {
        signals.adreno_gen = m[1].trim();
      }
    }

    if (/lm_ggml_opencl: Adreno large buffer enabled/.test(line)) {
      signals.large_buffer_enabled = true;
    }
    if (lbUnsupportedRe.test(line)) {
      signals.large_buffer_unsupported = true;
    }

    if (signals.offloaded_layers === null) {
      const m = offloadedRe.exec(line);
      if (m) {
        signals.offloaded_layers = Number(m[1]);
        signals.total_layers = Number(m[2]);
      }
    }
  }

  return signals;
}

/**
 * Map a parsed LogSignals payload to an effective-backend label.
 *
 *   - no opencl init -> cpu
 *   - opencl init, all layers offloaded, no large-buffer regression -> opencl
 *   - opencl init, partial offload -> cpu+opencl-partial
 *   - large_buffer_unsupported -> cpu+opencl-partial (regression co-occurs
 *     with CPU reassignment even when the offloaded count "matches")
 *   - else -> unknown (logs were collected but no signal; investigate)
 */
export function deriveEffectiveBackend(signals: LogSignals): EffectiveBackend {
  if (!signals.opencl_init) {
    return 'cpu';
  }
  if (signals.large_buffer_unsupported) {
    return 'cpu+opencl-partial';
  }
  if (
    signals.offloaded_layers !== null &&
    signals.total_layers !== null &&
    signals.offloaded_layers < signals.total_layers
  ) {
    return 'cpu+opencl-partial';
  }
  if (
    signals.offloaded_layers !== null &&
    signals.total_layers !== null &&
    signals.offloaded_layers === signals.total_layers
  ) {
    return 'opencl';
  }
  return 'unknown';
}
