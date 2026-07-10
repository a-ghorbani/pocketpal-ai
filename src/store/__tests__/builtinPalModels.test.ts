import {ModelOrigin, ModelType} from '../../utils/types';

import {LOOKIE_DEFAULT_MODEL} from '../builtinPalModels';

describe('LOOKIE_DEFAULT_MODEL', () => {
  it('is a self-contained offline vision model (no network resolve at init)', () => {
    expect(LOOKIE_DEFAULT_MODEL.origin).toBe(ModelOrigin.HF);
    expect(LOOKIE_DEFAULT_MODEL.modelType).toBe(ModelType.VISION);
    expect(LOOKIE_DEFAULT_MODEL.capabilities).toContain('vision');
    expect(LOOKIE_DEFAULT_MODEL.supportsMultimodal).toBe(true);
    expect(LOOKIE_DEFAULT_MODEL.visionEnabled).toBe(true);
  });

  it('bakes the download url and HF file metadata so no fetch is needed', () => {
    expect(LOOKIE_DEFAULT_MODEL.downloadUrl).toMatch(
      /^https:\/\/huggingface\.co\/.+\/resolve\/main\/.+\.gguf$/,
    );
    expect(LOOKIE_DEFAULT_MODEL.hfModelFile?.url).toBe(
      LOOKIE_DEFAULT_MODEL.downloadUrl,
    );
    expect(LOOKIE_DEFAULT_MODEL.hfModelFile?.rfilename).toBe(
      LOOKIE_DEFAULT_MODEL.filename,
    );
    expect(LOOKIE_DEFAULT_MODEL.size).toBeGreaterThan(0);
    expect(LOOKIE_DEFAULT_MODEL.params).toBeGreaterThan(0);
  });

  it('points the SmolVLM repo/filename at a downloadable GGUF', () => {
    expect(LOOKIE_DEFAULT_MODEL.repo).toBe('SmolVLM-500M-Instruct-GGUF');
    expect(LOOKIE_DEFAULT_MODEL.filename).toMatch(/\.gguf$/);
    expect(LOOKIE_DEFAULT_MODEL.id).toBe(
      `${LOOKIE_DEFAULT_MODEL.author}/${LOOKIE_DEFAULT_MODEL.repo}/${LOOKIE_DEFAULT_MODEL.filename}`,
    );
  });

  it('carries a projection model so vision pairing works offline', () => {
    expect(LOOKIE_DEFAULT_MODEL.defaultProjectionModel).toBeTruthy();
    expect(
      LOOKIE_DEFAULT_MODEL.compatibleProjectionModels?.length,
    ).toBeGreaterThan(0);
    expect(LOOKIE_DEFAULT_MODEL.compatibleProjectionModels).toContain(
      LOOKIE_DEFAULT_MODEL.defaultProjectionModel,
    );
  });

  it('starts not downloaded so the user pulls it via the normal flow', () => {
    expect(LOOKIE_DEFAULT_MODEL.isDownloaded).toBe(false);
    expect(LOOKIE_DEFAULT_MODEL.isLocal).toBe(false);
  });
});
