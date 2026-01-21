import {
  formatBytes,
  formatNumber,
  getDisplayNameFromFilename,
  getOriginalModelName,
} from '../formatters';
import {defaultModels} from '../../store/defaultModels';
import {ModelOrigin} from '../types';

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.02 kB');
    expect(formatBytes(1048576)).toBe('1.05 MB');
  });
});

describe('formatNumber', () => {
  it('should format numbers correctly', () => {
    expect(formatNumber(500)).toBe('500');
    expect(formatNumber(1500)).toBe('1.5k');
    expect(formatNumber(1500000)).toBe('1.5m');
  });
});

describe('getDisplayNameFromFilename', () => {
  it('should strip .gguf extension', () => {
    expect(getDisplayNameFromFilename('model-q4_0.gguf')).toBe('model-q4_0');
  });

  it('should strip .GGUF extension (case-insensitive)', () => {
    expect(getDisplayNameFromFilename('model-q4_0.GGUF')).toBe('model-q4_0');
  });

  it('should return empty string for empty input', () => {
    expect(getDisplayNameFromFilename('')).toBe('');
  });

  it('should return filename unchanged if no .gguf extension', () => {
    expect(getDisplayNameFromFilename('model-q4_0')).toBe('model-q4_0');
  });
});

describe('getOriginalModelName', () => {
  it('should return original name for preset models', () => {
    const presetModel = {
      id: defaultModels[0].id,
      filename: defaultModels[0].filename,
      origin: ModelOrigin.PRESET,
    };

    expect(getOriginalModelName(presetModel)).toBe(defaultModels[0].name);
  });

  it('should strip .gguf for local models', () => {
    const localModel = {
      id: 'local-id',
      filename: 'my-model.gguf',
      origin: ModelOrigin.LOCAL,
    };

    expect(getOriginalModelName(localModel)).toBe('my-model');
  });

  it('should fallback to stripped filename if preset not found in defaultModels', () => {
    const orphanPreset = {
      id: 'unknown-preset-id',
      filename: 'orphan.gguf',
      origin: ModelOrigin.PRESET,
    };

    expect(getOriginalModelName(orphanPreset)).toBe('orphan');
  });

  it('should strip .gguf for HF models', () => {
    const hfModel = {
      id: 'hf-id',
      filename: 'hf-model.gguf',
      origin: ModelOrigin.HF,
    };

    expect(getOriginalModelName(hfModel)).toBe('hf-model');
  });
});
