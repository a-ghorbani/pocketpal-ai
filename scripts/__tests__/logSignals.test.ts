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

// -----------------------------------------------------------------------------
// Hexagon parses + effective-backend arms (WHAT 1d, 6.D, 8 D2)
// -----------------------------------------------------------------------------

/**
 * Canonical Hexagon init + full-offload happy path. Three load-bearing
 * lines (literals verified against llama.rn 0.12.0-rc.9):
 *   - registry-allocation marker (sets hexagon_init=true)
 *   - new session: HTP0 (sets hexagon_device_name)
 *   - offloaded N/M layers to GPU (backend-agnostic counter — same line
 *     used for OpenCL; partial-vs-full classification reuses the existing
 *     offload regex).
 */
const HEXAGON_FULL_OFFLOAD_LINES = [
  'ggml-hex: Hexagon backend (experimental) : allocating new registry : ndev 1',
  'ggml-hex: Hexagon Arch version v75',
  'ggml-hex: new session: HTP0 : default',
  // load_tensors entries are the ground truth that the model actually
  // ended up on Hexagon — without them the registry alloc alone could
  // fire even on a CPU-routed model (see Snapdragon 8 Elite Gen 5).
  'load_tensors:          CPU model buffer size =   189.42 MiB',
  'load_tensors:  HTP0-REPACK model buffer size =   980.00 MiB',
  'load_tensors: offloaded 28/28 layers to GPU',
];

const HEXAGON_PARTIAL_OFFLOAD_LINES = [
  'ggml-hex: Hexagon backend (experimental) : allocating new registry : ndev 1',
  'ggml-hex: new session: HTP0 : default',
  'load_tensors:          CPU model buffer size =   400.00 MiB',
  'load_tensors:  HTP0-REPACK model buffer size =   600.00 MiB',
  'load_tensors: offloaded 22/28 layers to GPU',
];

describe('deriveLogSignals (Hexagon)', () => {
  it('parses the Hexagon happy-path init with full offload', () => {
    const signals = deriveLogSignals(HEXAGON_FULL_OFFLOAD_LINES);
    expect(signals.hexagon_init).toBe(true);
    expect(signals.hexagon_device_name).toBe('HTP0');
    expect(signals.offloaded_layers).toBe(28);
    expect(signals.total_layers).toBe(28);
    // Hexagon path must NOT set opencl_init by mistake.
    expect(signals.opencl_init).toBe(false);
    expect(signals.opencl_device_name).toBeNull();
  });

  it('captures only the FIRST HTP device when multiple sessions are logged', () => {
    // ndev=2 (fused) emits two `new session:` lines in sequence; the
    // structured field keeps the first to mirror opencl_device_name's
    // first-match-wins semantic. raw_matches still contains both lines.
    const signals = deriveLogSignals([
      'ggml-hex: Hexagon backend (experimental) : allocating new registry : ndev 2',
      'ggml-hex: new session: HTP0 : default',
      'ggml-hex: new session: HTP1 : default',
    ]);
    expect(signals.hexagon_init).toBe(true);
    expect(signals.hexagon_device_name).toBe('HTP0');
  });

  it('returns hexagon_init=false on OpenCL-only output (no cross-contamination)', () => {
    const signals = deriveLogSignals(GPU_FULL_OFFLOAD_LINES);
    expect(signals.hexagon_init).toBe(false);
    expect(signals.hexagon_device_name).toBeNull();
  });
});

describe('deriveEffectiveBackend (Hexagon)', () => {
  it('returns "hexagon" on full Hexagon offload', () => {
    expect(
      deriveEffectiveBackend(deriveLogSignals(HEXAGON_FULL_OFFLOAD_LINES)),
    ).toBe('hexagon');
  });

  it('returns "cpu+hexagon-partial" when offloaded < total under hexagon_init', () => {
    expect(
      deriveEffectiveBackend(deriveLogSignals(HEXAGON_PARTIAL_OFFLOAD_LINES)),
    ).toBe('cpu+hexagon-partial');
  });

  it('returns "unknown" when hexagon_init seen but no layer counts (init aborted before offload line)', () => {
    // Symmetric with the OpenCL path's `unknown` fallback (WHAT 8 D2).
    const signals = deriveLogSignals([
      'ggml-hex: Hexagon backend (experimental) : allocating new registry : ndev 1',
      'ggml-hex: new session: HTP0 : default',
    ]);
    expect(deriveEffectiveBackend(signals)).toBe('unknown');
  });

  it('hexagon takes precedence over opencl when both init lines fire and HTP buffers exist (defense)', () => {
    // By construction only one device set is dispatched per cell, so
    // both inits firing is hypothetical. memory_buffers ground truth:
    // if HTP* keys are present, the model ran on Hexagon regardless of
    // which init lines were observed.
    const signals = deriveLogSignals([
      'I/lm_ggml_opencl: Initializing OpenCL backend',
      'ggml-hex: Hexagon backend (experimental) : allocating new registry : ndev 1',
      'load_tensors:  HTP0-REPACK model buffer size =   980.00 MiB',
      'load_tensors: offloaded 28/28 layers to GPU',
    ]);
    expect(signals.opencl_init).toBe(true);
    expect(signals.hexagon_init).toBe(true);
    expect(deriveEffectiveBackend(signals)).toBe('hexagon');
  });

  it('returns "cpu" when hexagon_init fires but only CPU weight buffers landed (registry-alloc false-positive)', () => {
    // Real-world Snapdragon 8 Elite Gen 5 case: getDeviceOptions()
    // enumeration triggers ggml-hex registry allocation (hexagon_init
    // becomes true), but devices=['CPU'] keeps the model on CPU. The
    // weights_mib ground truth dominates.
    const signals = deriveLogSignals([
      'ggml-hex: Hexagon backend (experimental) : allocating new registry : ndev 1',
      'load_tensors:          CPU model buffer size =  1169.07 MiB',
      'load_tensors: offloaded 29/29 layers to GPU',
    ]);
    expect(signals.hexagon_init).toBe(true);
    expect(deriveEffectiveBackend(signals)).toBe('cpu');
  });
});

// -----------------------------------------------------------------------------
// Memory buffers
// -----------------------------------------------------------------------------

describe('deriveLogSignals — memory_buffers', () => {
  it('parses CPU-only weights from load_tensors lines', () => {
    const signals = deriveLogSignals([
      'load_tensors:          CPU model buffer size =  1169.07 MiB',
      'llama_kv_cache:        CPU KV buffer size =    8.50 MiB',
      'llama_context:        CPU compute buffer size =  296.05 MiB',
    ]);
    expect(signals.memory_buffers.weights_mib).toEqual({CPU: 1169.07});
    expect(signals.memory_buffers.kv_cache_mib).toEqual({CPU: 8.5});
    expect(signals.memory_buffers.compute_mib).toEqual({CPU: 296.05});
  });

  it('parses split CPU + OpenCL weights (Adreno path)', () => {
    const signals = deriveLogSignals([
      'load_tensors:          CPU model buffer size =   166.92 MiB',
      'load_tensors:       OpenCL model buffer size =  1002.15 MiB',
    ]);
    expect(signals.memory_buffers.weights_mib).toEqual({
      CPU: 166.92,
      OpenCL: 1002.15,
    });
  });

  it('parses Hexagon multi-session split with REPACK overhead', () => {
    const signals = deriveLogSignals([
      'load_tensors:          CPU model buffer size =   189.42 MiB',
      'load_tensors:   CPU_REPACK model buffer size =   243.43 MiB',
      'load_tensors:         HTP0 model buffer size =     0.08 MiB',
      'load_tensors:  HTP0-REPACK model buffer size =   114.75 MiB',
      'load_tensors:         HTP1 model buffer size =     0.08 MiB',
      'load_tensors:  HTP1-REPACK model buffer size =   135.00 MiB',
    ]);
    expect(signals.memory_buffers.weights_mib).toEqual({
      CPU: 189.42,
      CPU_REPACK: 243.43,
      HTP0: 0.08,
      'HTP0-REPACK': 114.75,
      HTP1: 0.08,
      'HTP1-REPACK': 135.0,
    });
  });

  it('starts empty when no buffer lines are seen (failure path)', () => {
    const signals = deriveLogSignals([
      'I/RNLlama: loadModel:240 Using n_parallel: 1',
      'load_tensors: offloaded 0/0 layers to GPU',
    ]);
    expect(signals.memory_buffers.weights_mib).toEqual({});
    expect(signals.memory_buffers.kv_cache_mib).toEqual({});
    expect(signals.memory_buffers.compute_mib).toEqual({});
  });

  it('last-write-wins on duplicate (kind, device) keys', () => {
    // llama.cpp normally prints each buffer once, but if the listener
    // window straddles a re-init the second value is what was actually
    // loaded for the bench reps.
    const signals = deriveLogSignals([
      'load_tensors:          CPU model buffer size =   100.00 MiB',
      'load_tensors:          CPU model buffer size =   200.00 MiB',
    ]);
    expect(signals.memory_buffers.weights_mib).toEqual({CPU: 200});
    // Total reflects the post-deduplication value, not the sum of all writes.
    expect(signals.memory_buffers.weights_total_mib).toBe(200);
  });

  it('totals equal the sum of their records', () => {
    const signals = deriveLogSignals([
      'load_tensors:          CPU model buffer size =   189.42 MiB',
      'load_tensors:   CPU_REPACK model buffer size =   243.43 MiB',
      'load_tensors:  HTP0-REPACK model buffer size =   114.75 MiB',
      'load_tensors:  HTP1-REPACK model buffer size =   135.00 MiB',
      'llama_kv_cache:        CPU KV buffer size =     8.50 MiB',
      'llama_context:        CPU compute buffer size =   296.05 MiB',
    ]);
    expect(signals.memory_buffers.weights_total_mib).toBeCloseTo(682.6, 2);
    expect(signals.memory_buffers.kv_cache_total_mib).toBeCloseTo(8.5, 2);
    expect(signals.memory_buffers.compute_total_mib).toBeCloseTo(296.05, 2);
    expect(signals.memory_buffers.total_mib).toBeCloseTo(987.15, 2);
  });
});
