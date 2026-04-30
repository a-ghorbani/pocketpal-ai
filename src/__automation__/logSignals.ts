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
 */

/**
 * Broad filter applied to every native log line. Matches anything from
 * llama.rn's ggml-opencl backend, the generic ggml_backend_ log tags, and
 * the load-tensor / model-load statements that tell us how many layers
 * ended up on GPU. Patterns calibrated against llama.rn 0.12.x native-log
 * output (verified live on POCO Adreno 840).
 */
export const BENCH_LOG_RE =
  /(ggml_opencl|using device GPUOpenCL|ggml_backend_|Adreno large buffer|offloaded \d+\/\d+ layers|load_tensors:|llama_model_load|ggml_cl|adreno_gen)/;

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

// Larger than strictly necessary on purpose — when a cell goes wrong we
// want context, and the parser's structured output is what regression
// tooling actually consumes (raw_matches is debug-only).
const RAW_MATCHES_CAP = 200;

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

  // Calibrated against llama.rn 0.12.x output. Examples:
  //   "llama_model_load_from_file_impl: using device GPUOpenCL (QUALCOMM Adreno(TM) 840) ..."
  //   "load_tensors: offloaded 25/25 layers to GPU"
  //   "lm_ggml_opencl: Adreno large buffer enabled"   (when env var set + supported)
  //   "Adreno large buffer requested but not supported by driver"  (regression case)
  // The device-name segment can itself contain parentheses (e.g.
  // "QUALCOMM Adreno(TM) 840"), so we anchor on the trailing ") (" separator
  // before the "(unknown id)" suffix instead of `[^)]+`.
  const usingDeviceRe = /using device GPUOpenCL\s*\((.+?)\)\s+\(/;
  // Legacy pattern (`lm_ggml_opencl: device <name>`) kept as a fallback in
  // case llama.rn rolls back the log format.
  const legacyDeviceRe = /lm_ggml_opencl: device\s+(.+?)(?:,|\s*$)/;
  const adrenoModelRe = /Adreno\s*\(TM\)\s*(\d+)/i;
  const adrenoRe = /adreno_gen:\s*(.+?)$/;
  const offloadedRe = /offloaded (\d+)\/(\d+) layers to GPU/;
  const lbUnsupportedRe =
    /Adreno large buffer.*(requested but not supported|unsupported)/i;

  for (const line of lines) {
    if (signals.raw_matches.length < RAW_MATCHES_CAP) {
      signals.raw_matches.push(line);
    }

    // Two valid markers for "OpenCL backend actually came up":
    //   1. legacy "lm_ggml_opencl: Initializing" (pre-0.12)
    //   2. "using device GPUOpenCL" (current llama.rn 0.12.x; this is the
    //      only one the listener saw on POCO during smoke verification).
    if (
      /lm_ggml_opencl: Initializing/.test(line) ||
      /using device GPUOpenCL/.test(line)
    ) {
      signals.opencl_init = true;
    }

    if (!signals.opencl_device_name) {
      const m = usingDeviceRe.exec(line) ?? legacyDeviceRe.exec(line);
      if (m) {
        signals.opencl_device_name = m[1].trim();
      }
    }

    // Adreno generation: prefer explicit `adreno_gen:` line if present,
    // otherwise fall back to model number from the device-name line
    // (Adreno 8XX → A8X, Adreno 7XX → A7X, etc.).
    if (!signals.adreno_gen) {
      const m = adrenoRe.exec(line);
      if (m) {
        signals.adreno_gen = m[1].trim();
      } else {
        const dm = adrenoModelRe.exec(line);
        if (dm) {
          const hundreds = dm[1].charAt(0);
          signals.adreno_gen = `A${hundreds}X`;
        }
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
