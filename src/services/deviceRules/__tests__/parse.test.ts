import {parseDeviceRules} from '../parse';

const textCandidate = {
  model: 'gemma-3-1b-it',
  display_name: 'Gemma-3-1b-it (Q4_K_M)',
  quant: 'q4_k_m',
  hf_repo: 'ggml-org/gemma-3-1b-it-GGUF',
  hf_filename: 'gemma-3-1b-it-Q4_K_M.gguf',
  params: 999885952,
  size_bytes: 806058240,
  min_ram_gb: 2,
  obs_tg: 30,
  native_low_bit: false,
  sha256: 'deadbeef',
};

const validRaw = {
  schema_version: '1.2.0-draft',
  platform: 'android',
  rules_version: '2026-06-10.1',
  classifier: {
    ram_bands: [
      {id: '6-8', max_bytes: 8589934592, label: '6-8 GiB'},
      {id: '12-plus', max_bytes: null, label: '12+ GiB'},
    ],
    soc_model_to_class: {'Tensor G3': 'mid'},
    hardware_to_class: {shiba: 'mid'},
    cpu_heuristic: {
      rules: [
        {match: {features_any: ['i8mm']}, class: 'flagship'},
        {match: {}, class: 'budget'},
      ],
    },
    tier_matrix: [{ram_band: '6-8', soc_class: 'mid', tier: 'mid'}],
  },
  tiers: {
    mid: {candidates: [textCandidate]},
  },
};

const withCandidate = (candidate: Record<string, unknown>) => {
  const raw = JSON.parse(JSON.stringify(validRaw));
  // size_bytes is required; default it so a test that targets another field
  // isn't also dropped for a missing size (override it where size is the point).
  raw.tiers.mid.candidates = [{size_bytes: 1, ...candidate}];
  return raw;
};

describe('parseDeviceRules', () => {
  it('parses the classifier into camelCase types', () => {
    const rules = parseDeviceRules(validRaw);
    expect(rules.platform).toBe('android');
    expect(rules.rulesVersion).toBe('2026-06-10.1');
    expect(rules.classifier.socModelToClass).toEqual({'Tensor G3': 'mid'});
    expect(rules.classifier.ramBands[1].maxBytes).toBeNull();
    expect(rules.classifier.cpuHeuristic).toHaveLength(2);
  });

  it('maps a wire candidate into the internal models array', () => {
    const rules = parseDeviceRules(validRaw);
    const c = rules.tiers.mid.models[0];
    expect(c.model).toBe('gemma-3-1b-it');
    expect(c.displayName).toBe('Gemma-3-1b-it (Q4_K_M)');
    expect(c.hfRepo).toBe('ggml-org/gemma-3-1b-it-GGUF');
    expect(c.hfFilename).toBe('gemma-3-1b-it-Q4_K_M.gguf');
    expect(c.params).toBe(999885952);
    expect(c.sizeBytes).toBe(806058240);
    expect(c.minRamGb).toBe(2);
  });

  it('drops informational fields the app ignores', () => {
    const rules = parseDeviceRules(validRaw);
    const c = rules.tiers.mid.models[0] as unknown as Record<string, unknown>;
    expect(c.quant).toBeUndefined();
    expect(c.obsTg).toBeUndefined();
    expect(c.nativeLowBit).toBeUndefined();
    expect(c.sha256).toBeUndefined();
  });

  it('parses a multimodal candidate with its explicit mmproj', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'gemma-4-e2b',
        hf_repo: 'unsloth/gemma-4-E2B-it-GGUF',
        hf_filename: 'gemma-4-E2B-it-Q4_0.gguf',
        params: 4647450147,
        size_bytes: 3041376384,
        multimodal: true,
        mmproj: {
          hf_repo: 'unsloth/gemma-4-E2B-it-GGUF',
          hf_filename: 'mmproj-BF16.gguf',
          size_bytes: 986833728,
          modalities: ['vision'],
        },
      }),
    );
    const c = rules.tiers.mid.models[0];
    expect(c.multimodal).toBe(true);
    expect(c.mmproj?.hfFilename).toBe('mmproj-BF16.gguf');
    expect(c.mmproj?.sizeBytes).toBe(986833728);
    expect(c.mmproj?.modalities).toEqual(['vision']);
  });

  it('parses a candidate with a cross-repo speculative draft', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'qwen3-8b',
        hf_repo: 'Qwen/Qwen3-8B-GGUF',
        hf_filename: 'Qwen3-8B-Q4_K_M.gguf',
        draft: {
          // A DIFFERENT repo than the target — the case mmproj rejects.
          hf_repo: 'Qwen/Qwen3-0.6B-GGUF',
          hf_filename: 'Qwen3-0.6B-Q4_K_M.gguf',
          size_bytes: 500000000,
        },
      }),
    );
    const c = rules.tiers.mid.models[0];
    expect(c.draft?.hfRepo).toBe('Qwen/Qwen3-0.6B-GGUF');
    expect(c.draft?.hfFilename).toBe('Qwen3-0.6B-Q4_K_M.gguf');
    expect(c.draft?.sizeBytes).toBe(500000000);
  });

  it('drops only the draft (keeps the target) when the draft is missing size', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'qwen3-8b',
        hf_repo: 'Qwen/Qwen3-8B-GGUF',
        hf_filename: 'Qwen3-8B-Q4_K_M.gguf',
        draft: {
          hf_repo: 'Qwen/Qwen3-0.6B-GGUF',
          hf_filename: 'Qwen3-0.6B-Q4_K_M.gguf',
          // no size_bytes
        },
      }),
    );
    const c = rules.tiers.mid.models[0];
    expect(c).toBeDefined();
    expect(c.hfRepo).toBe('Qwen/Qwen3-8B-GGUF');
    expect(c.draft).toBeUndefined();
  });

  it('drops only the draft (keeps the target) for an unsafe draft path', () => {
    const cases = [
      {hf_repo: '../evil', hf_filename: 'd.gguf'}, // bad repo shape
      {hf_repo: 'a/b/c', hf_filename: 'd.gguf'}, // three-part repo
      {hf_repo: 'a/', hf_filename: 'd.gguf'}, // empty repo part
      {hf_repo: 'a/b', hf_filename: '../d.gguf'}, // path traversal
      {hf_repo: 'a/b', hf_filename: 'd\\e.gguf'}, // path separator
      {hf_repo: 'a/b', hf_filename: 'd.bin'}, // non-.gguf
    ];
    for (const bad of cases) {
      const rules = parseDeviceRules(
        withCandidate({
          model: 'qwen3-8b',
          hf_repo: 'Qwen/Qwen3-8B-GGUF',
          hf_filename: 'Qwen3-8B-Q4_K_M.gguf',
          draft: {...bad, size_bytes: 500000000},
        }),
      );
      const c = rules.tiers.mid.models[0];
      expect(c).toBeDefined();
      expect(c.hfRepo).toBe('Qwen/Qwen3-8B-GGUF');
      expect(c.draft).toBeUndefined();
    }
  });

  it('omits an optional display_name when absent', () => {
    const noName = withCandidate({
      model: 'x',
      hf_repo: 'a/b',
      hf_filename: 'x.gguf',
    });
    const rules = parseDeviceRules(noName);
    expect(rules.tiers.mid.models[0].displayName).toBeUndefined();
  });

  it('drops tier_matrix entries with a non-canonical tier', () => {
    const withBadTier = JSON.parse(JSON.stringify(validRaw));
    withBadTier.classifier.tier_matrix = [
      {ram_band: '6-8', soc_class: 'mid', tier: 'mid'},
      {ram_band: '6-8', soc_class: 'flagship', tier: 'ultra'},
    ];
    const rules = parseDeviceRules(withBadTier);
    expect(rules.classifier.tierMatrix).toEqual([
      {ramBand: '6-8', socClass: 'mid', tier: 'mid'},
    ]);
  });

  it('ignores unknown top-level fields', () => {
    const extra = {
      ...validRaw,
      $schema: 'http://x',
      generated_at: 'now',
      _status: 'draft',
    };
    expect(() => parseDeviceRules(extra)).not.toThrow();
  });

  it('throws on a structurally invalid file', () => {
    expect(() => parseDeviceRules(null)).toThrow();
    expect(() => parseDeviceRules({})).toThrow();
    expect(() =>
      parseDeviceRules({
        schema_version: '1',
        platform: 'android',
        rules_version: '1',
        classifier: {tier_matrix: []},
      }),
    ).toThrow(/ram_bands/);
  });

  it('defaults all four tiers even when only some are present', () => {
    const rules = parseDeviceRules(validRaw);
    expect(rules.tiers.low.models).toEqual([]);
    expect(rules.tiers.mid.models).toHaveLength(1);
    expect(rules.tiers.high.models).toEqual([]);
    expect(rules.tiers.flagship.models).toEqual([]);
  });

  it('skips a candidate missing a required field', () => {
    const broken = JSON.parse(JSON.stringify(validRaw));
    broken.tiers.mid.candidates.push({
      model: 'no-file',
      hf_repo: 'a/b',
      // no hf_filename
    });
    const rules = parseDeviceRules(broken);
    expect(rules.tiers.mid.models).toHaveLength(1);
  });

  it('skips a candidate whose hf_repo has no slash', () => {
    const rules = parseDeviceRules(
      withCandidate({model: 'x', hf_repo: 'singlepart', hf_filename: 'x.gguf'}),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose hf_repo has more than two parts', () => {
    const rules = parseDeviceRules(
      withCandidate({model: 'x', hf_repo: 'a/b/c', hf_filename: 'x.gguf'}),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose hf_repo has an empty part', () => {
    const rules = parseDeviceRules(
      withCandidate({model: 'x', hf_repo: 'a/', hf_filename: 'x.gguf'}),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose hf_filename contains a path traversal', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: '../../etc/passwd.gguf',
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose hf_filename contains a path separator', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'sub/dir/model.gguf',
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose author contains a path traversal', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: '../../evil/repo',
        hf_filename: 'x.gguf',
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose hf_filename is not a .gguf file', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'model.bin',
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate missing size_bytes (would be undownloadable)', () => {
    const raw = JSON.parse(JSON.stringify(validRaw));
    raw.tiers.mid.candidates = [
      {model: 'x', hf_repo: 'a/b', hf_filename: 'x.gguf'},
    ];
    expect(parseDeviceRules(raw).tiers.mid.models).toEqual([]);
  });

  it('accepts a literal ".." inside a repo/filename (not a traversal)', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'author/repo..v2',
        hf_filename: 'model..q4.gguf',
      }),
    );
    expect(rules.tiers.mid.models).toHaveLength(1);
    expect(rules.tiers.mid.models[0].hfRepo).toBe('author/repo..v2');
  });

  it('skips a candidate whose hf_filename contains a backslash separator', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'sub\\dir\\model.gguf',
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a multimodal candidate whose mmproj.hf_repo has no slash', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'x.gguf',
        multimodal: true,
        mmproj: {
          hf_repo: 'singlepart',
          hf_filename: 'proj.gguf',
          size_bytes: 100,
        },
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('derives the download url from a huggingface.co template', () => {
    const rules = parseDeviceRules(validRaw);
    // The candidate carries no url; the consumer derives it from repo+filename.
    // Re-derive here to assert the parsed parts compose the expected target.
    const c = rules.tiers.mid.models[0];
    const url = `https://huggingface.co/${c.hfRepo}/resolve/main/${c.hfFilename}`;
    expect(url).toBe(
      'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
    );
  });

  it('drops a multimodal candidate whose mmproj segments are unsafe', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'x.gguf',
        multimodal: true,
        mmproj: {
          hf_repo: 'a/b',
          hf_filename: '../../proj.gguf',
          size_bytes: 100,
        },
      }),
    );
    // A failing mmproj drops the whole candidate, not just the projector.
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('drops a multimodal candidate whose mmproj is missing', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'x.gguf',
        multimodal: true,
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('drops a multimodal candidate whose mmproj is in a different repo', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'x.gguf',
        multimodal: true,
        mmproj: {
          hf_repo: 'a/other-repo',
          hf_filename: 'mmproj-BF16.gguf',
          size_bytes: 100,
        },
      }),
    );
    // Cross-repo projectors are not supported: id (LLM repo) and downloadUrl
    // (mmproj repo) would split silently, so the whole candidate is dropped.
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('drops a multimodal candidate whose mmproj filename is not a projector', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'x.gguf',
        multimodal: true,
        mmproj: {
          hf_repo: 'a/b',
          hf_filename: 'model-Q4_0.gguf',
          size_bytes: 100,
        },
      }),
    );
    // A non-mmproj projector filename would degrade the model to a plain LLM
    // with no projector, so the candidate is dropped.
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('drops a multimodal candidate whose mmproj size_bytes is missing', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'a/b',
        hf_filename: 'x.gguf',
        multimodal: true,
        mmproj: {hf_repo: 'a/b', hf_filename: 'proj.gguf'},
      }),
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('yields empty tiers for an old fat models[] schema doc', () => {
    const old = JSON.parse(JSON.stringify(validRaw));
    old.tiers = {
      mid: {
        models: [
          {
            hfModel: {id: 'a/b', author: 'a', url: 'u'},
            modelFile: {rfilename: 'x.gguf'},
          },
        ],
      },
    };
    const rules = parseDeviceRules(old);
    expect(rules.tiers.mid.models).toEqual([]);
  });
});
