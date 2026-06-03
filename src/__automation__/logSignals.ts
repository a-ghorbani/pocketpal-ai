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
 * llama.rn's ggml-opencl backend, the ggml-hexagon backend, the generic
 * ggml_backend_ log tags, and the load-tensor / model-load statements that
 * tell us how many layers ended up on GPU. Patterns calibrated against
 * llama.rn 0.12.x native-log output (verified live on POCO Adreno 840;
 * Hexagon literals verified at HEAD per WHAT D2).
 */
export const BENCH_LOG_RE =
  /(ggml_opencl|using device GPUOpenCL|ggml_backend_|Adreno large buffer|offloaded \d+\/\d+ layers|load_tensors:|llama_model_load|ggml_cl|adreno_gen|ggml-hex|ggml_hexagon|Hexagon backend|new session: HTP|Hexagon Arch version|KV buffer size|compute buffer size)/;

export interface LogSignals {
  opencl_init: boolean;
  opencl_device_name: string | null;
  adreno_gen: string | null;
  large_buffer_enabled: boolean;
  large_buffer_unsupported: boolean;
  /** True when the Hexagon registry-allocation line was observed. Mirrors
   * `opencl_init` (WHAT 1d, 8 D2 — verified literal:
   * `ggml-hex: Hexagon backend (experimental) : allocating new registry`). */
  hexagon_init: boolean;
  /** First HTP device name observed (e.g. "HTP0"). Mirrors
   * `opencl_device_name`'s first-match-wins semantic. */
  hexagon_device_name: string | null;
  offloaded_layers: number | null;
  total_layers: number | null;
  /** Memory buffers reported by llama.cpp at load + context-init time.
   * Deterministic given (model, backend, context params) — does not depend
   * on OS / PSS / GC state. Sources:
   *   - weights_mib: `load_tensors: <DEV> model buffer size = X MiB`
   *     (cpp/llama-model.cpp). Keys include "CPU", "CPU_REPACK", "OpenCL",
   *     "HTP0".."HTP5", "HTP0-REPACK".."HTP5-REPACK", etc.
   *   - kv_cache_mib: `<func>: <DEV> KV buffer size = X MiB`
   *     (cpp/llama-kv-cache.cpp:267).
   *   - compute_mib: `<func>: <DEV> compute buffer size = X MiB`
   *     (cpp/llama-context.cpp:608).
   * Empty objects when the cell failed before the corresponding lines fired. */
  memory_buffers: MemoryBuffers;
  /** First 20 matched lines, kept for human debugging. Never the primary data. */
  raw_matches: string[];
}

export interface MemoryBuffers {
  /** Per-allocator weight buffer sizes (MiB). */
  weights_mib: Record<string, number>;
  /** Sum of weights_mib values. Always equals the sum by construction in
   * deriveLogSignals — it cannot drift from the record. */
  weights_total_mib: number;
  /** Per-allocator KV cache buffer sizes (MiB). */
  kv_cache_mib: Record<string, number>;
  /** Sum of kv_cache_mib values. */
  kv_cache_total_mib: number;
  /** Per-allocator compute scratch buffer sizes (MiB). */
  compute_mib: Record<string, number>;
  /** Sum of compute_mib values. */
  compute_total_mib: number;
  /** Grand total: weights + kv_cache + compute (MiB). */
  total_mib: number;
}

export type EffectiveBackend =
  | 'cpu'
  | 'opencl'
  | 'cpu+opencl-partial'
  | 'hexagon'
  | 'cpu+hexagon-partial'
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
    hexagon_init: false,
    hexagon_device_name: null,
    offloaded_layers: null,
    total_layers: null,
    memory_buffers: {
      weights_mib: {},
      weights_total_mib: 0,
      kv_cache_mib: {},
      kv_cache_total_mib: 0,
      compute_mib: {},
      compute_total_mib: 0,
      total_mib: 0,
    },
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
  // Hexagon (Qualcomm NPU) anchors. Strings are stable across llama.rn rc
  // bumps even when line numbers drift (WHAT D2):
  //   "ggml-hex: Hexagon backend (experimental) : allocating new registry : ndev N"
  //   "ggml-hex: new session: HTP0 : ..."
  // Layer-offload reuses `offloadedRe` because the underlying log line
  // ("offloaded N/M layers to GPU" in cpp/llama-model.cpp) is
  // backend-agnostic — it prints for any non-CPU backend that received
  // layers, including Hexagon.
  const hexagonInitRe = /ggml-hex:\s+Hexagon backend.*allocating new registry/;
  const hexagonDeviceRe = /ggml-hex:\s+new session:\s+(HTP\d+)/;
  // Memory buffer anchors. llama.cpp emits these at load_tensors time and
  // at context-init time; the device label is a fixed-width left-padded
  // field (`%10s`), so we strip surrounding whitespace before keying.
  //   "load_tensors:          CPU model buffer size =  189.42 MiB"
  //   "load_tensors:  HTP0-REPACK model buffer size =  114.75 MiB"
  //   "llama_kv_cache:        CPU KV buffer size =    8.50 MiB"
  //   "llama_context:        CPU compute buffer size =  296.05 MiB"
  const weightBufferRe =
    /load_tensors:\s+(\S+)\s+model buffer size\s*=\s*([\d.]+)\s*MiB/;
  const kvBufferRe = /:\s+(\S+)\s+KV buffer size\s*=\s*([\d.]+)\s*MiB/;
  const computeBufferRe =
    /:\s+(\S+)\s+compute buffer size\s*=\s*([\d.]+)\s*MiB/;

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

    // Hexagon registry-allocation marker — the llama.rn-side anchor for
    // "Hexagon backend actually came up." Mirrors the OpenCL `init` line
    // semantic.
    if (hexagonInitRe.test(line)) {
      signals.hexagon_init = true;
    }

    // First-match-wins on the session-start line. Multi-device fusion
    // (e.g. ndev=2 → HTP0 + HTP1 sessions) keeps only the first one for
    // the structured field; both lines remain in raw_matches.
    if (!signals.hexagon_device_name) {
      const m = hexagonDeviceRe.exec(line);
      if (m) {
        signals.hexagon_device_name = m[1];
      }
    }

    // Memory buffers — last-write-wins per (kind, device) key. llama.cpp
    // only prints each buffer line once per context init, so collisions
    // would mean a re-init within the same listener window; taking the
    // latest value is correct for that case.
    const wm = weightBufferRe.exec(line);
    if (wm) {
      signals.memory_buffers.weights_mib[wm[1]] = Number(wm[2]);
    } else {
      const km = kvBufferRe.exec(line);
      if (km) {
        signals.memory_buffers.kv_cache_mib[km[1]] = Number(km[2]);
      } else {
        const cm = computeBufferRe.exec(line);
        if (cm) {
          signals.memory_buffers.compute_mib[cm[1]] = Number(cm[2]);
        }
      }
    }
  }

  // Totals are computed once at the end so they're always consistent with
  // the records — last-write-wins on duplicate keys is honoured.
  const sumValues = (rec: Record<string, number>): number =>
    Object.values(rec).reduce((acc, v) => acc + v, 0);
  signals.memory_buffers.weights_total_mib = sumValues(
    signals.memory_buffers.weights_mib,
  );
  signals.memory_buffers.kv_cache_total_mib = sumValues(
    signals.memory_buffers.kv_cache_mib,
  );
  signals.memory_buffers.compute_total_mib = sumValues(
    signals.memory_buffers.compute_mib,
  );
  signals.memory_buffers.total_mib =
    signals.memory_buffers.weights_total_mib +
    signals.memory_buffers.kv_cache_total_mib +
    signals.memory_buffers.compute_total_mib;

  return signals;
}

/**
 * Map a parsed LogSignals payload to an effective-backend label.
 *
 * Ground truth: `memory_buffers.weights_mib` keys. llama.cpp emits one
 * `load_tensors: <DEV> model buffer size = X MiB` line per allocator that
 * actually received tensors, so the key set is exact evidence of which
 * backend(s) hold the weights — independent of any init-line side
 * effects (e.g. `getDeviceOptions()` triggering a Hexagon registry
 * allocation that fires `hexagon_init=true` even when the model never
 * runs on Hexagon, observed on Snapdragon 8 Elite Gen 5).
 *
 * Decision order:
 *   - HTP* keys present -> hexagon (full, or cpu+hexagon-partial via offloaded counts)
 *   - OpenCL key present -> opencl (full, or cpu+opencl-partial via large_buffer_unsupported / offloaded counts)
 *   - only CPU/CPU_REPACK keys -> cpu
 *   - empty weight set: fall back to log-init heuristics:
 *       * hexagon_init -> unknown (Hexagon registry-allocation fires even when the model never runs there)
 *       * !opencl_init -> cpu
 *       * large_buffer_unsupported -> cpu+opencl-partial
 *       * partial offload counts -> cpu+opencl-partial
 *       * full offload counts -> opencl
 *       * else -> unknown
 */
export function deriveEffectiveBackend(signals: LogSignals): EffectiveBackend {
  const wKeys = Object.keys(signals.memory_buffers.weights_mib);
  const hasHTP = wKeys.some(k => k.startsWith('HTP'));
  const hasOpenCL = wKeys.some(k => k === 'OpenCL');
  const hasOnlyCPU =
    wKeys.length > 0 && wKeys.every(k => k === 'CPU' || k === 'CPU_REPACK');

  if (hasHTP) {
    if (
      signals.offloaded_layers !== null &&
      signals.total_layers !== null &&
      signals.offloaded_layers < signals.total_layers
    ) {
      return 'cpu+hexagon-partial';
    }
    return 'hexagon';
  }

  if (hasOpenCL) {
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
    return 'opencl';
  }

  if (hasOnlyCPU) {
    return 'cpu';
  }

  // Fallback to log-init heuristics for cells that failed before
  // `load_tensors:` lines fired (cells where weights_mib stays empty).
  if (signals.hexagon_init) {
    return 'unknown';
  }
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

/**
 * Closed enum of requested-backend values the bench config can carry.
 * Mirrors `Backend` in `BenchmarkRunnerScreen.tsx`; redeclared here so
 * `logSignals.ts` stays standalone and importable from non-screen code
 * (tests, future tooling).
 */
export type RequestedBackend = 'cpu' | 'gpu' | 'hexagon';

/**
 * Returns true when the actual backend the cell landed on satisfies the
 * cell's `requested_backend`. Partial offload (cpu+opencl-partial,
 * cpu+hexagon-partial) IS considered a satisfied request — the runner
 * landed on the requested backend, just incompletely; the report's
 * `effective_backend` field carries the partial signal so operators can
 * still spot it. Mismatch happens when the cell asked for one backend
 * and the model loaded on a fundamentally different one (e.g. requested
 * gpu, weights landed entirely on CPU).
 *
 * Pure: no closure capture, no side effects. Exported for unit tests.
 */
export function requestSatisfiedBy(
  requested: RequestedBackend,
  actual: EffectiveBackend,
): boolean {
  switch (requested) {
    case 'cpu':
      return actual === 'cpu';
    case 'gpu':
      return actual === 'opencl' || actual === 'cpu+opencl-partial';
    case 'hexagon':
      return actual === 'hexagon' || actual === 'cpu+hexagon-partial';
  }
}
