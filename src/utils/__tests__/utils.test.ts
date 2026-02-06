import {
  deepMerge,
  extractHFModelTitle,
  extractHFModelType,
  extractModelPrecision,
  formatBytes,
  getTextSizeInBytes,
  safeParseJSON,
  unwrap,
} from '..';

describe('formatBytes', () => {
  it('formats bytes correctly when the size is 0', () => {
    expect.assertions(1);
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats kiB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(1024, 2, true)).toBe('1 KiB');
  });

  it('formats GiB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(1024 * 1024 * 1024, 2, true)).toBe('1 GiB');
  });

  it('formats MB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(1234567, 2, false)).toBe('1.23 MB');
  });

  it('formats GB correctly', () => {
    expect.assertions(1);
    expect(formatBytes(12345678901, 2, false)).toBe('12.35 GB');
  });

  it('formats correctly with three digits with 2 decimals', () => {
    expect.assertions(1);
    expect(formatBytes(1234567890, 2, false, true)).toBe('1.23 GB');
  });

  it('formats correctly with three digits with 1 decimals', () => {
    expect.assertions(1);
    expect(formatBytes(12345678901, 2, false, true)).toBe('12.3 GB');
  });

  it('formats correctly with three digits with 0 decimals', () => {
    expect.assertions(1);
    expect(formatBytes(123456789000, 2, false, true)).toBe('123 GB');
  });
});

describe('getTextSizeInBytes', () => {
  it('calculates the size for a simple text', () => {
    expect.assertions(1);
    const text = 'text';
    expect(getTextSizeInBytes(text)).toBe(4);
  });

  it('calculates the size for an emoji text', () => {
    expect.assertions(1);
    const text = '🤔 🤓';
    expect(getTextSizeInBytes(text)).toBe(9);
  });
});

describe('unwrap', () => {
  it('returns an empty object', () => {
    expect.assertions(1);
    expect(unwrap(undefined)).toStrictEqual({});
  });

  it('returns a provided prop', () => {
    expect.assertions(1);
    const prop = 'prop';
    expect(unwrap(prop)).toStrictEqual(prop);
  });
});

describe('deepMerge', () => {
  it('should merge two flat objects', () => {
    const target = {a: 1, b: 2};
    const source = {b: 3, c: 4};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: 1, b: 2, c: 4}); // b should remain 2
  });

  it('should merge nested objects', () => {
    const target = {a: {b: 1}};
    const source = {a: {c: 2}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1, c: 2}}); // c should be added
  });

  it('should overwrite nested properties', () => {
    const target = {a: {b: 1, c: 2}};
    const source = {a: {b: 3}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1, c: 2}}); // b should remain 1
  });

  it('should handle arrays correctly', () => {
    const target = {a: [1, 2]};
    const source = {a: [3, 4]};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: [1, 2]});
  });

  it('should handle null values', () => {
    const target = {a: null};
    const source = {a: {b: 1}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1}}); // Replaces null with the object
  });

  it('should handle flat to nested', () => {
    const target = {a: 1, c: {d: 2, e: 3}};
    const source = {a: {b: 1}, c: 4};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: 1}, c: 4});
  });

  it('should not modify the original objects', () => {
    const target = {a: 1};
    const source = {b: 2};
    deepMerge(target, source);
    expect(target).toEqual({a: 1, b: 2});
    expect(source).toEqual({b: 2}); // Source should remain unchanged
  });

  it('should handle empty objects', () => {
    const target = {};
    const source = {a: 1};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: 1}); // Merges from source
  });

  it('should handle deeply nested objects', () => {
    const target = {a: {b: {c: 1}}};
    const source = {a: {b: {d: 2}}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: {c: 1, d: 2}}});
  });

  it('should merge multiple levels of nesting', () => {
    const target = {a: {b: {c: {d: 1, e: 3}}}};
    const source = {a: {b: {c: {e: 2, f: 4}}}};
    const result = deepMerge(target, source);
    expect(result).toEqual({a: {b: {c: {d: 1, e: 3, f: 4}}}});
  });
});

describe('extractHFModelType', () => {
  test('extracts model type correctly', () => {
    expect(
      extractHFModelType('bartowski/Llama-3.1-Nemotron-70B-Instruct-HF-GGUF'),
    ).toBe('Llama');
    expect(extractHFModelType('author/Giraffe-2.0-Model-Guide-Example')).toBe(
      'Giraffe',
    );
    expect(extractHFModelType('foo/Bar-1.0-Test')).toBe('Bar');
    expect(extractHFModelType('invalidInputWithoutSlashOrHyphen')).toBe(
      'Unknown',
    );
    expect(extractHFModelType('slashOnly/')).toBe('Unknown');
    expect(extractHFModelType('owner/modelWithoutSuffix')).toBe(
      'modelWithoutSuffix',
    );
  });
});

describe('extractHFModelTitle', () => {
  test('extracts model title correctly', () => {
    expect(
      extractHFModelTitle('bartowski/Llama-3.1-Nemotron-70B-Instruct-HF-GGUF'),
    ).toBe('Llama-3.1-Nemotron-70B-Instruct-HF');
    expect(
      extractHFModelTitle('bartowski/Llama-3.1-Nemotron-70B-Instruct-HF_gguf'),
    ).toBe('Llama-3.1-Nemotron-70B-Instruct-HF');
    expect(
      extractHFModelTitle('bartowski/Llama-3.1-Nemotron-70B-Instruct-HFGGUF'),
    ).toBe('Llama-3.1-Nemotron-70B-Instruct-HF');
    expect(extractHFModelTitle('author/Giraffe-2.0-Model-Guide-Example')).toBe(
      'Giraffe-2.0-Model-Guide-Example',
    );
    expect(extractHFModelTitle('foo/Bar-1.0-Test')).toBe('Bar-1.0-Test');
    expect(extractHFModelTitle('withoutSlashOrHyphen')).toBe(
      'withoutSlashOrHyphen',
    );
    expect(extractHFModelTitle('slashOnly/')).toBe('Unknown');
    expect(extractHFModelTitle('owner/modelWithoutSuffix')).toBe(
      'modelWithoutSuffix',
    );
  });
});

describe('safeParseJSON', () => {
  // Case 1: Normal valid JSON
  test('parses valid JSON correctly', () => {
    const validJson = '{"prompt": "Hello world"}';
    expect(safeParseJSON(validJson)).toEqual({prompt: 'Hello world'});
  });

  // Case 2: JSON with trailing text
  test('parses JSON with trailing text', () => {
    const jsonWithTrailing = '{"prompt": "Hello world"} Some extra text here';
    expect(safeParseJSON(jsonWithTrailing)).toEqual({prompt: 'Hello world'});
  });

  // Case 3: Incomplete JSON missing closing brace
  test('handles incomplete JSON with missing closing brace', () => {
    const incompleteJson = '{"prompt": "Hello world';
    expect(safeParseJSON(incompleteJson)).toEqual({prompt: 'Hello world'});
  });

  // Additional edge cases
  test('handles different quote styles and spacing around prompt key', () => {
    const variations = [
      '{"prompt" : "Hello"}',
      '{"prompt"  :  "Hello"}',
      '{"prompt"\n:\n"Hello"}',
    ];

    variations.forEach(json => {
      expect(safeParseJSON(json)).toHaveProperty('prompt', 'Hello');
    });
  });

  test('returns null for invalid JSON', () => {
    const invalidCases = ['', 'not json at all', '{notEvenJson}'];

    invalidCases.forEach(invalid => {
      expect(safeParseJSON(invalid)).toEqual({
        prompt: '',
        error: expect.any(Error),
      });
    });
  });

  // Additional tests for extractModelPrecision function
  describe('extractModelPrecision', () => {
    it('extracts standard quantization levels correctly', () => {
      expect(extractModelPrecision('model-q1_M.gguf')).toBe('q1');
      expect(extractModelPrecision('model-q2_M.gguf')).toBe('q2');
      expect(extractModelPrecision('model-q2.gguf')).toBe('q2');
      expect(extractModelPrecision('model-iq4_xs.gguf')).toBe('q4');
      expect(extractModelPrecision('model-q4_0.gguf')).toBe('q4');
      expect(extractModelPrecision('model-q4.0.gguf')).toBe('q4');
      expect(extractModelPrecision('model-q4-0.gguf')).toBe('q4');
      expect(extractModelPrecision('model-Q4_k_m.gguf')).toBe('q4');
      expect(extractModelPrecision('model-IQ4_XS.gguf')).toBe('q4');
      expect(extractModelPrecision('model-q5_k_m.gguf')).toBe('q5');
      expect(extractModelPrecision('model-q6_k_m.gguf')).toBe('q6');
      expect(extractModelPrecision('model-q8_0.gguf')).toBe('q8');
      expect(extractModelPrecision('model-f16.gguf')).toBe('f16');
      expect(extractModelPrecision('model-bf16.gguf')).toBe('bf16');
      expect(extractModelPrecision('model-f32.gguf')).toBe('f32');
    });
  });
});

describe('inferRepoFromModelId', () => {
  const {inferRepoFromModelId} = require('..');

  it('should extract repo from valid HF model ID', () => {
    const modelId = 'bartowski/gemma-2-2b-it-GGUF/model.gguf';
    expect(inferRepoFromModelId(modelId)).toBe('gemma-2-2b-it-GGUF');
  });

  it('should handle model ID with special characters in repo', () => {
    const modelId = 'author/repo-name_v2.0/file.gguf';
    expect(inferRepoFromModelId(modelId)).toBe('repo-name_v2.0');
  });

  it('should return undefined for malformed ID (no slashes)', () => {
    const modelId = 'invalid-id';
    expect(inferRepoFromModelId(modelId)).toBeUndefined();
  });

  it('should return undefined for ID with only one slash', () => {
    const modelId = 'author/filename.gguf';
    expect(inferRepoFromModelId(modelId)).toBeUndefined();
  });

  it('should handle model ID with extra slashes', () => {
    const modelId = 'author/repo/subdir/file.gguf';
    expect(inferRepoFromModelId(modelId)).toBe('repo');
  });

  it('should handle null/undefined input', () => {
    expect(inferRepoFromModelId(null as any)).toBeUndefined();
    expect(inferRepoFromModelId(undefined as any)).toBeUndefined();
    expect(inferRepoFromModelId('')).toBeUndefined();
  });
});

describe('hfAsModel', () => {
  const {hfAsModel} = require('..');
  const {
    mockHFModel1,
    mockHFModelFiles1,
  } = require('../../../jest/fixtures/models');

  it('should extract and set repo from hfModel.id', () => {
    const model = hfAsModel(mockHFModel1, mockHFModelFiles1[0]);

    expect(model.repo).toBe('hf-model-name-1');
    expect(model.author).toBe('owner');
  });

  it('should handle hfModel.id with different author/repo format', () => {
    const customHFModel = {
      ...mockHFModel1,
      id: 'bartowski/gemma-2-2b-it-GGUF',
      author: 'bartowski',
    };

    const model = hfAsModel(customHFModel, mockHFModelFiles1[0]);

    expect(model.repo).toBe('gemma-2-2b-it-GGUF');
    expect(model.author).toBe('bartowski');
  });

  it('should handle hfModel.id with no slash (undefined repo)', () => {
    const malformedHFModel = {
      ...mockHFModel1,
      id: 'just-a-name',
      author: 'unknown',
    };

    const model = hfAsModel(malformedHFModel, mockHFModelFiles1[0]);

    expect(model.repo).toBeUndefined();
  });

  it('should handle hfModel.id with single slash (undefined repo)', () => {
    const singleSlashHFModel = {
      ...mockHFModel1,
      id: 'author/',
      author: 'author',
    };

    const model = hfAsModel(singleSlashHFModel, mockHFModelFiles1[0]);

    expect(model.repo).toBe('');
  });
});
