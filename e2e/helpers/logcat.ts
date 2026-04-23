/**
 * Android logcat helpers for the benchmark-matrix spec.
 *
 * Starts an `adb logcat` tail, accumulates lines matching a narrow filter
 * regex, and exposes a `stop()` that kills the process and returns captured
 * lines. `deriveLogSignals()` parses those lines into a structured payload;
 * `deriveEffectiveBackend()` maps the payload to a 4-state enum.
 *
 * Android-only. iOS callers should not import this module.
 */

import {spawn, execSync, ChildProcess} from 'child_process';

/**
 * Broad filter applied to every logcat line. Matches anything from llama.rn's
 * ggml-opencl backend, the generic ggml_backend_ log tags, and the load-tensor
 * / model-load statements that tell us how many layers ended up on GPU.
 */
const BENCH_LOG_RE =
  /(lm_ggml_opencl|ggml_backend_|Adreno large buffer|offloaded \d+\/\d+ layers|load_tensors:|llama_model_load|ggml_cl|adreno_gen)/;

export interface LogcatCapture {
  /** Live-updating list of captured lines (stop() returns a snapshot). */
  readonly lines: string[];
  stop(): string[];
}

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

export type EffectiveBackend = 'cpu' | 'opencl' | 'cpu+opencl-partial' | 'unknown';

const RAW_MATCHES_CAP = 20;

/**
 * Start a logcat tail for the given device. Expands the ring buffer,
 * clears it, then spawns `adb [-s udid] logcat -v brief`.
 *
 * Returns a live `lines` array (filtered) and a `stop()` that kills the
 * child and returns the snapshot. Non-matching lines are discarded to keep
 * memory bounded for long runs.
 */
export function startCapture(udid?: string): LogcatCapture {
  const baseArgs = udid ? ['-s', udid] : [];

  // Expand the ring buffer so we don't lose startup logs; best-effort.
  try {
    execSync(['adb', ...baseArgs, 'logcat', '-G', '4M'].join(' '), {
      timeout: 5000,
    });
  } catch {
    // Older adb / unrooted device may reject -G. Non-fatal.
  }

  // Clear before spawning so our capture starts from a clean slate.
  try {
    execSync(['adb', ...baseArgs, 'logcat', '-c'].join(' '), {timeout: 5000});
  } catch {
    // Some devices reject -c without root; non-fatal.
  }

  const proc: ChildProcess = spawn('adb', [
    ...baseArgs,
    'logcat',
    '-v',
    'brief',
  ]);

  const lines: string[] = [];
  let buf = '';

  proc.stdout?.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    const parts = buf.split('\n');
    buf = parts.pop() ?? '';
    for (const line of parts) {
      if (BENCH_LOG_RE.test(line)) {
        lines.push(line);
      }
    }
  });
  proc.stderr?.on('data', () => {
    // Silence stderr; adb emits "- waiting for device -" etc. here.
  });
  // Swallow "ENOENT: adb not found" and process exits; surface as empty lines.
  proc.on('error', () => {});

  return {
    lines,
    stop(): string[] {
      try {
        proc.kill('SIGTERM');
      } catch {
        // Already dead.
      }
      // Flush any trailing buffered line that matched.
      if (buf && BENCH_LOG_RE.test(buf)) {
        lines.push(buf);
      }
      return lines.slice();
    },
  };
}

/**
 * Parse captured logcat lines into a structured payload.
 * All regex anchors derive from llama.rn's ggml-opencl.cpp.
 */
export function deriveLogSignals(lines: string[]): LogSignals {
  const signals: LogSignals = {
    opencl_init: false,
    opencl_device_name: null,
    adreno_gen: null,
    large_buffer_enabled: false,
    large_buffer_unsupported: false,
    offloaded_layers: null,
    total_layers: null,
    raw_matches: [],
  };

  const deviceRe = /lm_ggml_opencl: device\s+(.+?)(?:,|\s*$)/;
  const adrenoRe = /adreno_gen:\s*(.+?)$/;
  const offloadedRe = /offloaded (\d+)\/(\d+) layers to GPU/;
  const lbUnsupportedRe = /Adreno large buffer.*(requested but not supported|unsupported)/i;

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
 * Logic (v2.0 resolution of log_signals structure):
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
