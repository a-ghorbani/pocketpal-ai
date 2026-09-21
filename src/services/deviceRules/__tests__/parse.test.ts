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
  schema_version: '2.0.0',
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
    const rules = parseDeviceRules(validRaw, '1.17.3');
    expect(rules.platform).toBe('android');
    expect(rules.rulesVersion).toBe('2026-06-10.1');
    expect(rules.classifier.socModelToClass).toEqual({'Tensor G3': 'mid'});
    expect(rules.classifier.ramBands[1].maxBytes).toBeNull();
    expect(rules.classifier.cpuHeuristic).toHaveLength(2);
  });

  it('maps a wire candidate into the internal models array', () => {
    const rules = parseDeviceRules(validRaw, '1.17.3');
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
    const rules = parseDeviceRules(validRaw, '1.17.3');
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
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
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
        '1.17.3',
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
    const rules = parseDeviceRules(noName, '1.17.3');
    expect(rules.tiers.mid.models[0].displayName).toBeUndefined();
  });

  it('drops tier_matrix entries with a non-canonical tier', () => {
    const withBadTier = JSON.parse(JSON.stringify(validRaw));
    withBadTier.classifier.tier_matrix = [
      {ram_band: '6-8', soc_class: 'mid', tier: 'mid'},
      {ram_band: '6-8', soc_class: 'flagship', tier: 'ultra'},
    ];
    const rules = parseDeviceRules(withBadTier, '1.17.3');
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
    expect(() => parseDeviceRules(extra, '1.17.3')).not.toThrow();
  });

  it('throws on a structurally invalid file', () => {
    expect(() => parseDeviceRules(null, '1.17.3')).toThrow();
    expect(() => parseDeviceRules({}, '1.17.3')).toThrow();
    expect(() =>
      parseDeviceRules(
        {
          schema_version: '2.0.0',
          platform: 'android',
          rules_version: '1',
          classifier: {tier_matrix: []},
        },
        '1.17.3',
      ),
    ).toThrow(/ram_bands/);
  });

  it.each(['1.2.0-draft', '3.0.0', '2', 'v2.0.0', 'two', '2.0', ' 2.0.0'])(
    'throws on an unsupported schema_version %p',
    schemaVersion => {
      expect(() =>
        parseDeviceRules(
          {...validRaw, schema_version: schemaVersion},
          '1.17.3',
        ),
      ).toThrow(/schema_version/);
    },
  );

  it.each(['2.0.0', '2.1.0-draft', '2.3.4+build'])(
    'parses a schema major 2 document %p',
    schemaVersion => {
      const rules = parseDeviceRules(
        {
          ...validRaw,
          schema_version: schemaVersion,
        },
        '1.17.3',
      );
      expect(rules.schemaVersion).toBe(schemaVersion);
      expect(rules.tiers.mid.models).toHaveLength(1);
    },
  );

  it('defaults all four tiers even when only some are present', () => {
    const rules = parseDeviceRules(validRaw, '1.17.3');
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
    const rules = parseDeviceRules(broken, '1.17.3');
    expect(rules.tiers.mid.models).toHaveLength(1);
  });

  it('skips a candidate whose hf_repo has no slash', () => {
    const rules = parseDeviceRules(
      withCandidate({model: 'x', hf_repo: 'singlepart', hf_filename: 'x.gguf'}),
      '1.17.3',
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose hf_repo has more than two parts', () => {
    const rules = parseDeviceRules(
      withCandidate({model: 'x', hf_repo: 'a/b/c', hf_filename: 'x.gguf'}),
      '1.17.3',
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate whose hf_repo has an empty part', () => {
    const rules = parseDeviceRules(
      withCandidate({model: 'x', hf_repo: 'a/', hf_filename: 'x.gguf'}),
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('skips a candidate missing size_bytes (would be undownloadable)', () => {
    const raw = JSON.parse(JSON.stringify(validRaw));
    raw.tiers.mid.candidates = [
      {model: 'x', hf_repo: 'a/b', hf_filename: 'x.gguf'},
    ];
    expect(parseDeviceRules(raw, '1.17.3').tiers.mid.models).toEqual([]);
  });

  it('accepts a literal ".." inside a repo/filename (not a traversal)', () => {
    const rules = parseDeviceRules(
      withCandidate({
        model: 'x',
        hf_repo: 'author/repo..v2',
        hf_filename: 'model..q4.gguf',
      }),
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
    );
    expect(rules.tiers.mid.models).toEqual([]);
  });

  it('derives the download url from a huggingface.co template', () => {
    const rules = parseDeviceRules(validRaw, '1.17.3');
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
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
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
      '1.17.3',
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
    const rules = parseDeviceRules(old, '1.17.3');
    expect(rules.tiers.mid.models).toEqual([]);
  });
});

describe('parseDeviceRules min_app_version gates', () => {
  const APP = '1.17.3';

  const target = {
    model: 'x',
    hf_repo: 'a/b',
    hf_filename: 'x.gguf',
  };

  const visionTarget = (mmprojExtra: Record<string, unknown>) => ({
    ...target,
    multimodal: true,
    mmproj: {
      hf_repo: 'a/b',
      hf_filename: 'mmproj-BF16.gguf',
      size_bytes: 100,
      ...mmprojExtra,
    },
  });

  const draftTarget = (draftExtra: Record<string, unknown>) => ({
    ...target,
    draft: {
      hf_repo: 'c/d',
      hf_filename: 'd.gguf',
      size_bytes: 100,
      ...draftExtra,
    },
  });

  const midModels = (candidate: Record<string, unknown>, app = APP) =>
    parseDeviceRules(withCandidate(candidate), app).tiers.mid.models;

  it('keeps a candidate with no min_app_version', () => {
    expect(midModels(target)).toHaveLength(1);
  });

  it.each(['1.17.3', '1.16.9', '0.0.0'])(
    'keeps a candidate whose min_app_version %p is met',
    min => {
      expect(midModels({...target, min_app_version: min})).toHaveLength(1);
    },
  );

  it.each(['1.17.4', '1.18.0', '2.0.0'])(
    'drops a candidate whose min_app_version %p is above the app',
    min => {
      expect(midModels({...target, min_app_version: min})).toEqual([]);
    },
  );

  it.each([['1.17'], ['1.17.3-rc.1'], [1.17], [null], [''], [{}]])(
    'drops a candidate with a malformed min_app_version %p',
    min => {
      expect(midModels({...target, min_app_version: min})).toEqual([]);
    },
  );

  it('compares versions numerically', () => {
    expect(
      midModels({...target, min_app_version: '1.17.9'}, '1.17.10'),
    ).toHaveLength(1);
    expect(midModels({...target, min_app_version: '1.10.0'}, '1.9.0')).toEqual(
      [],
    );
  });

  it.each(['1.17.3-rc.1', '1.17.3+45'])(
    'strips the app version suffix %p before comparing',
    app => {
      expect(
        midModels({...target, min_app_version: '1.17.3'}, app),
      ).toHaveLength(1);
    },
  );

  it('drops every gated candidate and keeps ungated ones when the app version is unknown', () => {
    const raw = JSON.parse(JSON.stringify(validRaw));
    raw.tiers.mid.candidates = [
      {...target, model: 'gated', size_bytes: 1, min_app_version: '1.0.0'},
      {...target, model: 'ungated', size_bytes: 1},
    ];
    const models = parseDeviceRules(raw, 'unknown').tiers.mid.models;
    expect(models.map(m => m.model)).toEqual(['ungated']);
  });

  it('keeps a multimodal candidate whose mmproj gate is met', () => {
    const [c] = midModels(visionTarget({min_app_version: '1.17.3'}));
    expect(c.mmproj?.hfFilename).toBe('mmproj-BF16.gguf');
  });

  it.each(['9.0.0', 'bad', null])(
    'drops the whole multimodal candidate when its mmproj gate %p fails',
    min => {
      expect(midModels(visionTarget({min_app_version: min}))).toEqual([]);
    },
  );

  it('ignores the mmproj gate of a candidate that is not multimodal', () => {
    const [c] = midModels({
      ...visionTarget({min_app_version: '9.0.0'}),
      multimodal: false,
    });
    expect(c).toBeDefined();
    expect(c.mmproj).toBeUndefined();
  });

  it('keeps a draft whose gate is met', () => {
    const [c] = midModels(draftTarget({min_app_version: '1.0.0'}));
    expect(c.draft?.hfRepo).toBe('c/d');
  });

  it.each(['9.0.0', 'bad', null])(
    'drops only the draft when its gate %p fails',
    min => {
      const [c] = midModels(draftTarget({min_app_version: min}));
      expect(c).toBeDefined();
      expect(c.hfRepo).toBe('a/b');
      expect(c.draft).toBeUndefined();
    },
  );
});
