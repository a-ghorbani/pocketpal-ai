/**
 * Unit tests for the pure functions in `src/__automation__/logSignals.ts`:
 *   - deriveLogSignals(lines): parses native log lines into a structured payload.
 *   - deriveEffectiveBackend(signals): maps the payload to a 4-state enum.
 *
 * Fixtures are modelled on real native-log excerpts from llama.rn's
 * `cpp/ggml-opencl/ggml-opencl.cpp` init/load paths. BenchmarkRunnerScreen
 * captures the same lines in-process via addNativeLogListener.
 */

import {
  deriveEffectiveBackend,
  deriveLogSignals,
} from '../../src/__automation__/logSignals';

// -----------------------------------------------------------------------------
// Fixture builders
// -----------------------------------------------------------------------------

/**
 * Canonical OpenCL init + full GPU offload (the happy path on S26 Ultra /
 * Adreno A8X when a supported quant is selected). 28/28 layers on GPU,
 * large-buffer feature enabled, no regressions.
 */
const GPU_FULL_OFFLOAD_LINES = [
  'I/lm_ggml_opencl: Initializing OpenCL backend',
  'I/lm_ggml_opencl: device Adreno (TM) 830',
  'I/lm_ggml_opencl: adreno_gen: A8X',
  'I/lm_ggml_opencl: Adreno large buffer enabled',
  'I/llama_model_load: load_tensors: offloaded 28/28 layers to GPU',
  'I/ggml_backend_opencl: buffer allocated',
];

/**
 * CPU-only path: llama.rn never hits the OpenCL init tag at all.
 * Captured lines are mostly backend/load tags from the CPU path.
 */
const CPU_ONLY_LINES = [
  'I/ggml_backend_cpu: using CPU backend',
  'I/llama_model_load: load_tensors: tensors loaded',
];

/**
 * Silent-fallback case (the one this infrastructure exists to catch):
 * OpenCL init succeeds, the Adreno large buffer feature is requested but
 * the driver rejects it, so llama.rn silently reassigns layers back to CPU.
 * deriveEffectiveBackend must report `cpu+opencl-partial` even though the
 * offloaded count string might still say "28/28".
 */
const LARGE_BUFFER_UNSUPPORTED_LINES = [
  'I/lm_ggml_opencl: Initializing OpenCL backend',
  'I/lm_ggml_opencl: device Adreno (TM) 830',
  'I/lm_ggml_opencl: adreno_gen: A8X',
  'W/lm_ggml_opencl: Adreno large buffer requested but not supported by driver',
  'I/llama_model_load: load_tensors: offloaded 28/28 layers to GPU',
];

/**
 * Partial offload: OpenCL initialized but only some layers landed on GPU
 * (e.g. memory pressure pushed the final few back to CPU).
 */
const PARTIAL_OFFLOAD_LINES = [
  'I/lm_ggml_opencl: Initializing OpenCL backend',
  'I/lm_ggml_opencl: device Adreno (TM) 830',
  'I/llama_model_load: load_tensors: offloaded 22/28 layers to GPU',
];

// -----------------------------------------------------------------------------
// deriveLogSignals
// -----------------------------------------------------------------------------

describe('deriveLogSignals', () => {
  it('returns all-default signals for an empty input', () => {
    const signals = deriveLogSignals([]);
    expect(signals).toEqual({
      opencl_init: false,
      opencl_device_name: null,
      adreno_gen: null,
      large_buffer_enabled: false,
      large_buffer_unsupported: false,
      offloaded_layers: null,
      total_layers: null,
      raw_matches: [],
    });
  });

  it('parses the happy-path GPU init with full offload', () => {
    const signals = deriveLogSignals(GPU_FULL_OFFLOAD_LINES);

    expect(signals.opencl_init).toBe(true);
    expect(signals.opencl_device_name).toBe('Adreno (TM) 830');
    expect(signals.adreno_gen).toBe('A8X');
    expect(signals.large_buffer_enabled).toBe(true);
    expect(signals.large_buffer_unsupported).toBe(false);
    expect(signals.offloaded_layers).toBe(28);
    expect(signals.total_layers).toBe(28);
  });

  it('returns opencl_init=false when no init line is present (CPU path)', () => {
    const signals = deriveLogSignals(CPU_ONLY_LINES);
    expect(signals.opencl_init).toBe(false);
    expect(signals.opencl_device_name).toBeNull();
    expect(signals.offloaded_layers).toBeNull();
    expect(signals.total_layers).toBeNull();
  });

  it('flags large_buffer_unsupported on the silent-fallback regression', () => {
    const signals = deriveLogSignals(LARGE_BUFFER_UNSUPPORTED_LINES);
    expect(signals.opencl_init).toBe(true);
    expect(signals.large_buffer_unsupported).toBe(true);
    // The "enabled" line is NOT present in this case, by construction.
    expect(signals.large_buffer_enabled).toBe(false);
  });

  it('parses llama.rn 0.12.x "using device GPUOpenCL" format (POCO live capture)', () => {
    const lines = [
      'llama_model_load_from_file_impl: using device GPUOpenCL (QUALCOMM Adreno(TM) 840) (unknown id) - 0 MiB free',
      'llama_model_loader: loaded meta data with 45 key-value pairs',
      'load_tensors: offloaded 25/25 layers to GPU',
    ];
    const signals = deriveLogSignals(lines);
    expect(signals.opencl_init).toBe(true);
    expect(signals.opencl_device_name).toBe('QUALCOMM Adreno(TM) 840');
    // Generation derived from device-number pattern when no adreno_gen: line
    // is logged (8XX → A8X).
    expect(signals.adreno_gen).toBe('A8X');
    expect(signals.offloaded_layers).toBe(25);
    expect(signals.total_layers).toBe(25);
  });

  it('parses partial-offload layer counts', () => {
    const signals = deriveLogSignals(PARTIAL_OFFLOAD_LINES);
    expect(signals.opencl_init).toBe(true);
    expect(signals.offloaded_layers).toBe(22);
    expect(signals.total_layers).toBe(28);
  });

  it('captures the FIRST device_name when multiple init passes are logged', () => {
    const lines = [
      'I/lm_ggml_opencl: device Adreno (TM) 830',
      'I/lm_ggml_opencl: device Adreno (TM) 740',
    ];
    const signals = deriveLogSignals(lines);
    expect(signals.opencl_device_name).toBe('Adreno (TM) 830');
  });

  it('strips trailing commas from device_name (regex tolerates both anchors)', () => {
    const signals = deriveLogSignals([
      'I/lm_ggml_opencl: device Adreno (TM) 830, driver v1.2.3',
    ]);
    expect(signals.opencl_device_name).toBe('Adreno (TM) 830');
  });

  it('caps raw_matches at 200 lines (debug-only, not primary data)', () => {
    const lines: string[] = [];
    for (let i = 0; i < 250; i++) {
      lines.push(`I/lm_ggml_opencl: synthetic line ${i}`);
    }
    const signals = deriveLogSignals(lines);
    expect(signals.raw_matches).toHaveLength(200);
    expect(signals.raw_matches[0]).toContain('synthetic line 0');
    expect(signals.raw_matches[199]).toContain('synthetic line 199');
  });

  it('tolerates malformed / unrelated lines interleaved with good data', () => {
    const lines = [
      '',
      'random garbage line without any matching tokens',
      'I/lm_ggml_opencl: Initializing OpenCL backend',
      '\x00\x01\x02 corrupt binary junk',
      'I/llama_model_load: load_tensors: offloaded 16/28 layers to GPU',
      'malformed: offloaded XX/YY layers to GPU', // regex demands digits; no match
    ];
    const signals = deriveLogSignals(lines);
    expect(signals.opencl_init).toBe(true);
    expect(signals.offloaded_layers).toBe(16);
    expect(signals.total_layers).toBe(28);
  });

  it('is case-insensitive for the "requested but not supported" anchor', () => {
    const signals = deriveLogSignals([
      'W/lm_ggml_opencl: Adreno large buffer REQUESTED BUT NOT SUPPORTED by driver',
    ]);
    expect(signals.large_buffer_unsupported).toBe(true);
  });

  it('matches the alternate "unsupported" short form', () => {
    const signals = deriveLogSignals([
      'W/lm_ggml_opencl: Adreno large buffer unsupported on this GPU',
    ]);
    expect(signals.large_buffer_unsupported).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// deriveEffectiveBackend
// -----------------------------------------------------------------------------

describe('deriveEffectiveBackend', () => {
  it('returns "cpu" when opencl_init is false (no OpenCL init seen)', () => {
    expect(deriveEffectiveBackend(deriveLogSignals(CPU_ONLY_LINES))).toBe(
      'cpu',
    );
  });

  it('returns "opencl" on the full-offload happy path', () => {
    expect(
      deriveEffectiveBackend(deriveLogSignals(GPU_FULL_OFFLOAD_LINES)),
    ).toBe('opencl');
  });

  it('returns "cpu+opencl-partial" on the silent-fallback regression', () => {
    // This is the primary motivation for effective_backend vs requested_backend:
    // without this detection, a regression shows up as "opencl" when the user
    // asked for GPU but the driver silently reassigned to CPU.
    expect(
      deriveEffectiveBackend(deriveLogSignals(LARGE_BUFFER_UNSUPPORTED_LINES)),
    ).toBe('cpu+opencl-partial');
  });

  it('returns "cpu+opencl-partial" when offloaded < total', () => {
    expect(
      deriveEffectiveBackend(deriveLogSignals(PARTIAL_OFFLOAD_LINES)),
    ).toBe('cpu+opencl-partial');
  });

  it('returns "unknown" when opencl initialized but no layer counts were seen', () => {
    // e.g. a truncated logcat tail that missed the load_tensors line.
    const signals = deriveLogSignals([
      'I/lm_ggml_opencl: Initializing OpenCL backend',
      'I/lm_ggml_opencl: device Adreno (TM) 830',
    ]);
    expect(deriveEffectiveBackend(signals)).toBe('unknown');
  });

  it('prioritises large_buffer_unsupported over matching layer counts', () => {
    // Explicit: when the regression flag fires but counts still say 28/28,
    // we must trust the flag and report partial — matching the v2.0 resolution
    // comment in deriveEffectiveBackend.
    const signals = deriveLogSignals([
      'I/lm_ggml_opencl: Initializing OpenCL backend',
      'W/lm_ggml_opencl: Adreno large buffer requested but not supported',
      'I/llama_model_load: load_tensors: offloaded 28/28 layers to GPU',
    ]);
    expect(signals.offloaded_layers).toBe(28);
    expect(signals.total_layers).toBe(28);
    expect(signals.large_buffer_unsupported).toBe(true);
    expect(deriveEffectiveBackend(signals)).toBe('cpu+opencl-partial');
  });

  it('returns "cpu" when only non-OpenCL ggml backend tags are seen', () => {
    // Regression guard: the BENCH_LOG_RE capture filter matches
    // ggml_backend_* lines (broad), but that alone must NOT imply opencl.
    const signals = deriveLogSignals([
      'I/ggml_backend_cpu: CPU backend selected',
      'I/ggml_backend_cpu: alloc 512 MB',
    ]);
    expect(signals.opencl_init).toBe(false);
    expect(deriveEffectiveBackend(signals)).toBe('cpu');
  });
});
