jest.unmock('../../store');

import {downloadManager} from '../../services/downloads';
import {modelStore} from '..';
import {ModelOrigin} from '../../utils/types';
import type {OnboardingPalModelEntry} from '../onboarding/onboardingPals';

jest.mock('../../utils/deviceCapabilities', () => ({
  ...jest.requireActual('../../utils/deviceCapabilities'),
  getCpuCoreCount: jest.fn().mockResolvedValue(8),
  getRecommendedThreadCount: jest.fn().mockResolvedValue(6),
  checkGpuSupport: jest.fn().mockResolvedValue({isSupported: false}),
  isHighEndDevice: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../services/downloads', () => ({
  DownloadCancelledError: class extends Error {},
  downloadManager: {
    isDownloading: jest.fn().mockReturnValue(false),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    setCallbacks: jest.fn(),
    syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
  },
}));

const codieBalanced: OnboardingPalModelEntry = {
  tier: 'balanced',
  recommended: true,
  repo: 'lmstudio-community/Qwen3.5-2B-GGUF',
  filename: 'Qwen3.5-2B-Q4_K_M.gguf',
  author: 'lmstudio-community',
  downloadUrl:
    'https://huggingface.co/lmstudio-community/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
  displayName: 'Qwen3.5 2B',
  sizeBytes: 1270808032,
  params: 1881825088,
};

describe('ModelStore.registerOnboardingPalModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelStore.models = [];
    (downloadManager.syncWithActiveDownloads as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  it('synthesizes and registers an HF entry; returned Model.id matches `${repo}/${filename}`', async () => {
    const expectedId = `${codieBalanced.repo}/${codieBalanced.filename}`;

    const result = await modelStore.registerOnboardingPalModel(codieBalanced);

    expect(result).toBeDefined();
    expect(result!.id).toBe(expectedId);
    expect(modelStore.models).toHaveLength(1);
    expect(modelStore.models[0].id).toBe(expectedId);
    expect(modelStore.models[0].origin).toBe(ModelOrigin.HF);
    // siblings: undefined ⇒ supportsMultimodal stays false.
    expect(modelStore.models[0].supportsMultimodal).toBeFalsy();
    expect(modelStore.models[0].size).toBe(codieBalanced.sizeBytes);
  });

  it('is idempotent: a second call with the same entry returns the existing Model and does not append a row', async () => {
    const first = await modelStore.registerOnboardingPalModel(codieBalanced);
    const second = await modelStore.registerOnboardingPalModel(codieBalanced);

    expect(modelStore.models).toHaveLength(1);
    expect(second!.id).toBe(first!.id);
  });
});
