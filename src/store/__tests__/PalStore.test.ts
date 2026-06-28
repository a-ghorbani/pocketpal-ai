import {runInAction} from 'mobx';
import {Platform} from 'react-native';
import {palStore} from '../PalStore';
import {palsHubService} from '../../services';
import {isUSStorefront} from '../../utils/region';
import {palRepository} from '../../repositories/PalRepository';
import type {Pal} from '../../types/pal';
import type {PalsHubPal} from '../../types/palshub';
import * as imageUtils from '../../utils/imageUtils';
import {resolveHFModelForDownload} from '../../utils/hfResolve';
import {LOOKIE_DEFAULT_MODEL} from '../builtinPalModels';

// Mock dependencies
jest.mock('../../utils/hfResolve', () => ({
  resolveHFModelForDownload: jest.fn(),
}));
jest.mock('../../repositories/PalRepository', () => ({
  palRepository: {
    getAllPals: jest.fn(),
    createPal: jest.fn(),
    updatePal: jest.fn(),
    deletePal: jest.fn(),
    getPalById: jest.fn(),
    checkAndMigrateFromJSON: jest.fn(),
    getLocalPals: jest.fn(),
    getPalsHubPals: jest.fn(),
  },
}));

jest.mock('../../utils/imageUtils', () => ({
  downloadPalThumbnail: jest.fn(),
  deletePalThumbnail: jest.fn(),
}));

jest.mock('../../services', () => ({
  palsHubService: {
    getPals: jest.fn(),
    getPal: jest.fn(),
    getLibrary: jest.fn(),
    getMyPals: jest.fn(),
    getCategories: jest.fn(),
    getTags: jest.fn(),
    checkPalOwnership: jest.fn(),
  },
}));

// Mock MobX persist
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn(),
}));

// Eligibility writer dependencies: iOS StoreKit storefront + Android probe.
jest.mock('../../utils/region', () => ({
  isUSStorefront: jest.fn(),
}));

// Toggle the Android external-content-link module per test through a getter so
// the null-module fail-closed path can be exercised in the same file.
// prepareExternalLink / reportExternalContentLink are stubbed so a test can
// assert the eligibility probe is side-effect-free (never mints a token,
// launches a link-out, or reports — I-E1).
const makeExternalContentLink = () => ({
  isExternalContentLinkAvailable: jest.fn(),
  prepareExternalLink: jest.fn(),
  reportExternalContentLink: jest.fn(),
});
let mockExternalContentLink: ReturnType<typeof makeExternalContentLink> | null =
  makeExternalContentLink();
jest.mock('../../specs/NativeExternalContentLink', () => ({
  __esModule: true,
  get default() {
    return mockExternalContentLink;
  },
}));

describe('PalStore', () => {
  const mockPal: Pal = {
    type: 'local',
    id: 'test-pal-1',
    name: 'Test Pal',
    description: 'A test pal',
    systemPrompt: 'You are a helpful assistant.',
    originalSystemPrompt: 'You are a helpful assistant.',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'local',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  const mockPalsHubPal: PalsHubPal = {
    id: 'ph-pal-1',
    title: 'PalsHub Test Pal',
    description: 'A test pal from PalsHub',
    creator_id: 'creator-1',
    protection_level: 'public',
    price_cents: 0,
    system_prompt: 'You are a {{role}} assistant.',
    thumbnail_url: 'https://example.com/thumb.jpg',
    type: 'palshub',
    model_settings: {},
    allow_fork: true,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset store state
    runInAction(() => {
      palStore.pals = [];
      palStore.cachedPalsHubPals = [];
      palStore.userLibrary = [];
      palStore.userCreatedPals = [];
      palStore.isLoadingPalsHub = false;
      palStore.syncState = {status: 'idle'};
      palStore.isMigrating = false;
      palStore.migrationComplete = false;
    });

    // Setup default mocks
    (palRepository.getAllPals as jest.Mock).mockResolvedValue([]);
    (palRepository.checkAndMigrateFromJSON as jest.Mock).mockResolvedValue(
      undefined,
    );
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const mockPals = [mockPal];
      (palRepository.getAllPals as jest.Mock).mockResolvedValue(mockPals);

      // Create a new store instance to test initialization
      // eslint-disable-next-line no-new
      new (palStore.constructor as any)();

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(palRepository.checkAndMigrateFromJSON).toHaveBeenCalled();
      expect(palRepository.getAllPals).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      const error = new Error('Database error');
      (palRepository.getAllPals as jest.Mock).mockRejectedValue(error);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Create a new store instance to test initialization
      // eslint-disable-next-line no-new
      new (palStore.constructor as any)();

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading pals from database:',
        error,
      );

      consoleSpy.mockRestore();
    });

    it('creates the Lookie pal from the offline constant without a network resolve', async () => {
      (palRepository.getAllPals as jest.Mock).mockResolvedValue([]);
      (palRepository.createPal as jest.Mock).mockImplementation(
        async (palData: any) => ({
          ...palData,
          id: 'lookie-id',
          created_at: 'now',
          updated_at: 'now',
        }),
      );

      // eslint-disable-next-line no-new
      new (palStore.constructor as any)();
      await new Promise(resolve => setTimeout(resolve, 100));

      const lookieCall = (palRepository.createPal as jest.Mock).mock.calls.find(
        call => call[0]?.name === 'Lookie',
      );

      expect(lookieCall).toBeDefined();
      expect(lookieCall![0].defaultModel).toBe(LOOKIE_DEFAULT_MODEL);
      // No HF resolve / network call at pal init.
      expect(resolveHFModelForDownload).not.toHaveBeenCalled();
    });

    it('does not recreate the Lookie pal if one already exists', async () => {
      const existingLookie: Pal = {
        ...mockPal,
        id: 'existing-lookie',
        name: 'Lookie',
        capabilities: {video: true},
      } as Pal;
      (palRepository.getAllPals as jest.Mock).mockResolvedValue([
        existingLookie,
      ]);

      // eslint-disable-next-line no-new
      new (palStore.constructor as any)();
      await new Promise(resolve => setTimeout(resolve, 100));

      const lookieCreate = (
        palRepository.createPal as jest.Mock
      ).mock.calls.find(call => call[0]?.name === 'Lookie');
      expect(lookieCreate).toBeUndefined();
      expect(resolveHFModelForDownload).not.toHaveBeenCalled();
    });
  });

  describe('checkout eligibility writer', () => {
    const originalOS = Platform.OS;
    const originalE2E = (global as any).__E2E__;

    const runWriter = () => (palStore as any).checkCheckoutEligibility();

    beforeEach(() => {
      // Exercise the real per-platform branch (prod path), not the E2E override.
      (global as any).__E2E__ = false;
      mockExternalContentLink = makeExternalContentLink();
      (isUSStorefront as jest.Mock).mockReset();
      runInAction(() => {
        (palStore as any).isCheckoutEligible = false;
      });
    });

    afterEach(() => {
      Platform.OS = originalOS;
      (global as any).__E2E__ = originalE2E;
    });

    it('Android: EXTERNAL_CONTENT_LINK available -> eligible (locale irrelevant)', async () => {
      Platform.OS = 'android';
      mockExternalContentLink!.isExternalContentLinkAvailable.mockResolvedValue(
        true,
      );

      await runWriter();

      expect(
        mockExternalContentLink!.isExternalContentLinkAvailable,
      ).toHaveBeenCalledTimes(1);
      expect(isUSStorefront).not.toHaveBeenCalled();
      // The probe is side-effect-free: it never mints a token, launches a
      // link-out, or reports (I-E1 / scenario D, JS-observable portion).
      expect(
        mockExternalContentLink!.prepareExternalLink,
      ).not.toHaveBeenCalled();
      expect(
        mockExternalContentLink!.reportExternalContentLink,
      ).not.toHaveBeenCalled();
      expect(palStore.isCheckoutEligible).toBe(true);
    });

    it('Android: program unavailable -> ineligible (info text)', async () => {
      Platform.OS = 'android';
      mockExternalContentLink!.isExternalContentLinkAvailable.mockResolvedValue(
        false,
      );

      await runWriter();

      expect(palStore.isCheckoutEligible).toBe(false);
    });

    it('Android: null module -> ineligible (fail-closed)', async () => {
      Platform.OS = 'android';
      mockExternalContentLink = null;

      await runWriter();

      expect(isUSStorefront).not.toHaveBeenCalled();
      expect(palStore.isCheckoutEligible).toBe(false);
    });

    it('Android: probe throws -> ineligible (fail-closed)', async () => {
      Platform.OS = 'android';
      mockExternalContentLink!.isExternalContentLinkAvailable.mockRejectedValue(
        new Error('billing setup failed'),
      );
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await runWriter();

      expect(palStore.isCheckoutEligible).toBe(false);
      warnSpy.mockRestore();
    });

    it('E2E build: forces eligibility without probing the platform', async () => {
      Platform.OS = 'android';
      (global as any).__E2E__ = true;

      await runWriter();

      expect(palStore.isCheckoutEligible).toBe(true);
      expect(
        mockExternalContentLink!.isExternalContentLinkAvailable,
      ).not.toHaveBeenCalled();
      expect(isUSStorefront).not.toHaveBeenCalled();
    });

    it('iOS: keeps StoreKit storefront signal, never probes Play', async () => {
      Platform.OS = 'ios';
      (isUSStorefront as jest.Mock).mockResolvedValue(true);

      await runWriter();

      expect(isUSStorefront).toHaveBeenCalledTimes(1);
      expect(
        mockExternalContentLink!.isExternalContentLinkAvailable,
      ).not.toHaveBeenCalled();
      expect(palStore.isCheckoutEligible).toBe(true);
    });
  });

  describe('Pip seeding', () => {
    const callInitializePipPal = async () =>
      (palStore as any).initializePipPal();

    beforeEach(() => {
      runInAction(() => {
        palStore.pals = [];
      });
      (palRepository.createPal as jest.Mock).mockImplementation(
        async (palData: any) => ({
          ...palData,
          id: `pip-${Math.random().toString(36).slice(2, 8)}`,
          created_at: '2026-05-26T00:00:00Z',
          updated_at: '2026-05-26T00:00:00Z',
        }),
      );
    });

    it('seeds Pip when absent', async () => {
      await callInitializePipPal();
      const pip = palStore.pals.find(
        p => p.name === 'Pip' && p.source === 'local',
      );
      expect(pip).toBeDefined();
      expect(pip?.type).toBe('local');
      expect(pip?.defaultModel).toBeUndefined();
      expect(palRepository.createPal).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when Pip is already present', async () => {
      await callInitializePipPal();
      (palRepository.createPal as jest.Mock).mockClear();
      await callInitializePipPal();
      const pipCount = palStore.pals.filter(
        p => p.name === 'Pip' && p.source === 'local',
      ).length;
      expect(pipCount).toBe(1);
      expect(palRepository.createPal).not.toHaveBeenCalled();
    });

    it('preserves an existing Pip record (including defaultModel) on re-init', async () => {
      const boundModel = {
        id: 'some-bound-model',
        name: 'Some Bound Model',
      } as any;
      const existingPip: Pal = {
        ...mockPal,
        id: 'pip-existing',
        name: 'Pip',
        source: 'local',
        type: 'local',
        defaultModel: boundModel,
      } as any;
      runInAction(() => {
        palStore.pals = [existingPip];
      });

      await callInitializePipPal();

      const pip = palStore.pals.find(
        p => p.name === 'Pip' && p.source === 'local',
      );
      expect(pip).toBeDefined();
      expect(pip?.id).toBe('pip-existing');
      // defaultModel content is preserved across re-init (MobX wraps
      // observed objects in Proxies, so Object.is equality is brittle;
      // value equality verifies the field wasn't cleared or rewritten).
      expect(pip?.defaultModel).toEqual(boundModel);
      expect(palRepository.createPal).not.toHaveBeenCalled();
    });

    it('coexists with Lookie regardless of order (idempotent)', async () => {
      const lookie: Pal = {
        ...mockPal,
        id: 'lookie-1',
        name: 'Lookie',
        source: 'local',
        type: 'local',
        capabilities: {video: true},
      } as any;
      runInAction(() => {
        palStore.pals = [lookie];
      });

      await callInitializePipPal();
      await callInitializePipPal();

      const names = palStore.pals.map(p => p.name).sort();
      expect(names).toEqual(['Lookie', 'Pip']);
    });
  });

  describe('Core CRUD Operations', () => {
    describe('createPal', () => {
      it('should create a new pal successfully', async () => {
        const newPalData = {
          name: 'New Test Pal',
          description: 'A new test pal',
          systemPrompt: 'You are a helpful assistant.',
          originalSystemPrompt: 'You are a helpful assistant.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          parameters: {},
          parameterSchema: [],
          source: 'local' as const,
          type: 'local' as const,
        };

        const createdPal = {...newPalData, ...mockPal};
        (palRepository.createPal as jest.Mock).mockResolvedValue(createdPal);

        const result = await palStore.createPal(newPalData);

        expect(palRepository.createPal).toHaveBeenCalledWith(newPalData);
        expect(result).toEqual(createdPal);
        expect(palStore.pals).toContainEqual(createdPal);
      });

      it('should handle creation errors', async () => {
        const error = new Error('Creation failed');
        (palRepository.createPal as jest.Mock).mockRejectedValue(error);

        const newPalData = {
          name: 'New Test Pal',
          systemPrompt: 'You are a helpful assistant.',
          originalSystemPrompt: 'You are a helpful assistant.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          parameters: {},
          parameterSchema: [],
          source: 'local' as const,
          type: 'local' as const,
        };

        await expect(palStore.createPal(newPalData)).rejects.toThrow(
          'Creation failed',
        );
        expect(palStore.pals).not.toContain(
          expect.objectContaining({name: 'New Test Pal'}),
        );
      });
    });

    describe('updatePal', () => {
      beforeEach(() => {
        runInAction(() => {
          palStore.pals = [mockPal];
        });
      });

      it('should update an existing pal successfully', async () => {
        const updates = {
          name: 'Updated Pal Name',
          description: 'Updated description',
        };
        const updatedPal = {
          ...mockPal,
          ...updates,
          updated_at: '2023-01-02T00:00:00Z',
        };

        (palRepository.updatePal as jest.Mock).mockResolvedValue(updatedPal);

        await palStore.updatePal(mockPal.id, updates);

        expect(palRepository.updatePal).toHaveBeenCalledWith(
          mockPal.id,
          updates,
        );
        expect(palStore.pals[0]).toEqual(updatedPal);
      });

      it('should handle update errors', async () => {
        const error = new Error('Update failed');
        (palRepository.updatePal as jest.Mock).mockRejectedValue(error);

        await expect(
          palStore.updatePal(mockPal.id, {name: 'Updated'}),
        ).rejects.toThrow('Update failed');
      });

      it('should handle case when updated pal is not returned', async () => {
        (palRepository.updatePal as jest.Mock).mockResolvedValue(null);

        await expect(
          palStore.updatePal(mockPal.id, {name: 'Updated'}),
        ).rejects.toThrow('Failed to update pal - no updated pal returned');
      });
    });

    describe('deletePal', () => {
      beforeEach(() => {
        runInAction(() => {
          palStore.pals = [mockPal];
        });
      });

      it('should delete a pal successfully', async () => {
        (palRepository.deletePal as jest.Mock).mockResolvedValue(true);
        (imageUtils.deletePalThumbnail as jest.Mock).mockResolvedValue(
          undefined,
        );

        await palStore.deletePal(mockPal.id);

        expect(palRepository.deletePal).toHaveBeenCalledWith(mockPal.id);
        expect(palStore.pals).not.toContain(mockPal);
      });

      it('should handle deletion errors gracefully', async () => {
        const error = new Error('Deletion failed');
        (palRepository.deletePal as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        // Should not throw, but should log error
        await palStore.deletePal(mockPal.id);

        expect(consoleSpy).toHaveBeenCalledWith('Error deleting pal:', error);
        expect(palStore.pals).toContainEqual(mockPal); // Should still be there

        consoleSpy.mockRestore();
      });
    });
  });

  describe('PalsHub Integration', () => {
    describe('searchPalsHubPals', () => {
      it('should search pals and update state', async () => {
        const mockResponse = {
          pals: [mockPalsHubPal],
          total_count: 1,
          page: 1,
          limit: 20,
          has_more: false,
        };

        (palsHubService.getPals as jest.Mock).mockResolvedValue(mockResponse);

        expect(palStore.isLoadingPalsHub).toBe(false);
        expect(palStore.syncState.status).toBe('idle');

        const result = await palStore.searchPalsHubPals({query: 'test'});

        expect(palsHubService.getPals).toHaveBeenCalledWith({query: 'test'});
        expect(result).toEqual(mockResponse);
        expect(palStore.cachedPalsHubPals).toEqual(mockResponse.pals);
        expect(palStore.isLoadingPalsHub).toBe(false);
        expect(palStore.syncState.status).toBe('success');
      });

      it('should handle search errors gracefully', async () => {
        const error = new Error('Search failed');
        (palsHubService.getPals as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        // Should not throw, but return empty results
        const result = await palStore.searchPalsHubPals();

        expect(result).toEqual({
          pals: [],
          total_count: 0,
          page: 1,
          limit: 20,
          has_more: false,
        });
        expect(palStore.cachedPalsHubPals).toEqual([]);
        expect(palStore.isLoadingPalsHub).toBe(false);
        expect(palStore.syncState.status).toBe('success'); // Changed to success for graceful handling
        expect(consoleSpy).toHaveBeenCalledWith(
          'PalsHub search failed (this is expected if not configured):',
          error,
        );

        consoleSpy.mockRestore();
      });
    });

    describe('loadUserLibrary', () => {
      it('should load user library and update state', async () => {
        const mockResponse = {
          pals: [
            {
              ...mockPalsHubPal,
              is_owned: true,
            },
          ],
          total_count: 1,
          page: 1,
          limit: 20,
          has_more: false,
        };

        (palsHubService.getLibrary as jest.Mock).mockResolvedValue(
          mockResponse,
        );

        const result = await palStore.loadUserLibrary();

        expect(palsHubService.getLibrary).toHaveBeenCalled();
        expect(result).toEqual(mockResponse);
        expect(palStore.userLibrary).toEqual(mockResponse.pals);
        expect(palStore.syncState.status).toBe('success');
      });

      it('should handle library loading errors gracefully', async () => {
        const error = new Error('Library load failed');
        (palsHubService.getLibrary as jest.Mock).mockRejectedValue(error);

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

        // Should not throw, but return empty results
        const result = await palStore.loadUserLibrary();

        expect(result).toEqual({
          pals: [],
          total_count: 0,
          page: 1,
          limit: 20,
          has_more: false,
        });
        expect(palStore.userLibrary).toEqual([]);
        expect(palStore.syncState.status).toBe('success'); // Changed to success for graceful handling
        expect(consoleSpy).toHaveBeenCalledWith(
          'User library load failed (this is expected if not configured):',
          error,
        );

        consoleSpy.mockRestore();
      });
    });

    describe('helper methods', () => {
      it('should get categories', async () => {
        const mockCategories = {
          categories: [{id: '1', name: 'AI Assistant'}],
        };

        (palsHubService.getCategories as jest.Mock).mockResolvedValue(
          mockCategories,
        );

        const result = await palStore.getCategories();

        expect(result).toEqual(mockCategories);
        expect(palsHubService.getCategories).toHaveBeenCalled();
      });

      it('should get tags', async () => {
        const mockTags = {
          tags: [{id: '1', name: 'helpful'}],
        };

        (palsHubService.getTags as jest.Mock).mockResolvedValue(mockTags);

        const result = await palStore.getTags({query: 'help'});

        expect(result).toEqual(mockTags);
        expect(palsHubService.getTags).toHaveBeenCalledWith({query: 'help'});
      });

      it('should get specific pal', async () => {
        const mockPalsHubPalResponse = {
          ...mockPalsHubPal,
          id: '1',
          title: 'Test Pal',
          creator_id: 'user1',
        };

        (palsHubService.getPal as jest.Mock).mockResolvedValue(
          mockPalsHubPalResponse,
        );

        const result = await palStore.getPalsHubPal('1');

        expect(result).toEqual(mockPalsHubPalResponse);
        expect(palsHubService.getPal).toHaveBeenCalledWith('1');
      });

      it('should check pal ownership', async () => {
        const mockOwnership = {owned: true, purchase_date: '2023-01-01'};

        (palsHubService.checkPalOwnership as jest.Mock).mockResolvedValue(
          mockOwnership,
        );

        const result = await palStore.checkPalOwnership('pal-id');

        expect(result).toEqual(mockOwnership);
        expect(palsHubService.checkPalOwnership).toHaveBeenCalledWith('pal-id');
      });
    });

    describe('downloadPalsHubPal', () => {
      it('should download pal with provided information', async () => {
        const palToDownload: PalsHubPal = {
          ...mockPalsHubPal,
          id: 'pal-to-download',
          title: 'Test Pal',
          system_prompt:
            'You are a {{role}} assistant with {{expertise}} knowledge.',
          model_settings: {
            parameter_schema: [
              {
                key: 'role',
                type: 'text' as const,
                label: 'Role',
                required: true,
                placeholder: 'e.g., helpful, creative',
              },
            ],
            parameters: {
              role: 'helpful',
            },
            temperature: 0.7,
            max_tokens: 2048,
          },
        };

        const expectedLocalPal = {
          type: 'local',
          id: expect.any(String),
          name: 'Test Pal',
          systemPrompt:
            'You are a {{role}} assistant with {{expertise}} knowledge.',
          source: 'palshub',
          palshub_id: 'pal-to-download',
          rawPalshubGenerationSettings: palToDownload.model_settings,
        };

        // Mock the service calls
        (palRepository.createPal as jest.Mock).mockResolvedValue(
          expectedLocalPal,
        );
        (imageUtils.downloadPalThumbnail as jest.Mock).mockResolvedValue(
          '/path/to/thumbnail.jpg',
        );

        const result = await palStore.downloadPalsHubPal(palToDownload);

        // Verify that the pal was created with the provided information
        expect(palRepository.createPal).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Pal',
            systemPrompt:
              'You are a {{role}} assistant with {{expertise}} knowledge.',
            rawPalshubGenerationSettings: palToDownload.model_settings,
            source: 'palshub',
            palshub_id: 'pal-to-download',
          }),
        );

        expect(result).toEqual(expectedLocalPal);
        expect(palStore.pals).toContainEqual(expectedLocalPal);
      });

      it('should handle premium pal ownership check before downloading', async () => {
        const premiumPal: PalsHubPal = {
          ...mockPalsHubPal,
          id: 'premium-pal-id',
          price_cents: 500, // Premium pal
        };

        // Mock ownership check to return owned
        (palsHubService.checkPalOwnership as jest.Mock).mockResolvedValue({
          owned: true,
        });
        (palRepository.createPal as jest.Mock).mockResolvedValue({
          ...premiumPal,
          type: 'local',
          id: 'local-id',
        });

        await palStore.downloadPalsHubPal(premiumPal);

        // Verify ownership was checked
        expect(palsHubService.checkPalOwnership).toHaveBeenCalledWith(
          'premium-pal-id',
        );
      });

      it('should reject download for unowned premium pal', async () => {
        const premiumPal: PalsHubPal = {
          ...mockPalsHubPal,
          id: 'premium-pal-id',
          price_cents: 500, // Premium pal
        };

        // Mock ownership check to return not owned
        (palsHubService.checkPalOwnership as jest.Mock).mockResolvedValue({
          owned: false,
        });

        await expect(palStore.downloadPalsHubPal(premiumPal)).rejects.toThrow(
          'You must own this Pal to download it',
        );

        // Verify ownership was checked
        expect(palsHubService.checkPalOwnership).toHaveBeenCalledWith(
          'premium-pal-id',
        );
      });
    });

    describe('createLocalPalFromPalsHub (via downloadPalsHubPal)', () => {
      // Drive the private conversion through the public download entry point
      // and assert on the first argument of the palRepository.createPal mock.
      const buildPalsHubPal = (overrides: Partial<PalsHubPal>): PalsHubPal => ({
        ...mockPalsHubPal,
        id: 'conversion-test',
        ...overrides,
      });

      const getCreatePalArg = () =>
        (palRepository.createPal as jest.Mock).mock.calls[0][0];

      beforeEach(() => {
        (palRepository.createPal as jest.Mock).mockImplementation(
          async (data: any) => ({
            ...data,
            id: 'created-pal-id',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          }),
        );
        (imageUtils.downloadPalThumbnail as jest.Mock).mockResolvedValue(
          '/path/to/thumb.jpg',
        );
      });

      it('happy path: maps pact + greeting with snake_case to camelCase rename', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {
            version: 1,
            talents: [
              {name: 'render_html', required: true},
              {name: 'calculate', required: false},
            ],
          },
          greeting: {
            text: 'Hi! Want me to sketch something?',
            suggested_prompts: ['Draw a sunset', 'Make a chart'],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.pact).toEqual({
          talents: [
            {name: 'render_html', necessity: 'required'},
            {name: 'calculate', necessity: 'optional'},
          ],
        });
        expect(arg.greeting).toEqual({
          text: 'Hi! Want me to sketch something?',
          suggestedPrompts: ['Draw a sunset', 'Make a chart'],
        });
      });

      it('legacy / both absent: pact and greeting are undefined', async () => {
        const palsHubPal = buildPalsHubPal({});
        // mockPalsHubPal has no pact / greeting — older Palshub server shape.

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.pact).toBeUndefined();
        expect(arg.greeting).toBeUndefined();
      });

      it('unknown talent name is preserved (no registry validation)', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {
            version: 1,
            talents: [{name: 'web_search', required: true}],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.pact).toEqual({
          talents: [{name: 'web_search', necessity: 'required'}],
        });
      });

      it('strict-boolean coercion: only literal true maps to required', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {
            version: 1,
            talents: [
              {name: 'a', required: 'true' as any},
              {name: 'b', required: 1 as any},
              {name: 'c', required: true},
              {name: 'd', required: false},
              {name: 'e'},
              {name: 'f', required: null as any},
              {name: 'g', required: 0 as any},
              {name: 'h', required: '' as any},
              {name: 'i', required: 'false' as any},
              {name: 'j', required: {} as any},
            ],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.pact).toEqual({
          talents: [
            {name: 'a', necessity: 'optional'},
            {name: 'b', necessity: 'optional'},
            {name: 'c', necessity: 'required'},
            {name: 'd', necessity: 'optional'},
            {name: 'e', necessity: 'optional'},
            {name: 'f', necessity: 'optional'},
            {name: 'g', necessity: 'optional'},
            {name: 'h', necessity: 'optional'},
            {name: 'i', necessity: 'optional'},
            {name: 'j', necessity: 'optional'},
          ],
        });
      });

      it('drops pact.version at the conversion boundary', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {
            version: 1,
            talents: [{name: 'calculate'}],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.pact).not.toHaveProperty('version');
        expect(arg.pact).toEqual({
          talents: [{name: 'calculate', necessity: 'optional'}],
        });
      });

      it('empty talents array collapses to undefined', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {version: 1, talents: []},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().pact).toBeUndefined();
      });

      it('pact with no talents key collapses to undefined', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {version: 1} as any,
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().pact).toBeUndefined();
      });

      it('pact: null collapses to undefined', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: null as any,
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().pact).toBeUndefined();
      });

      it('greeting with only text: no suggestedPrompts key', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {text: 'Hi'},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.greeting).toEqual({text: 'Hi'});
        expect(arg.greeting).not.toHaveProperty('suggestedPrompts');
      });

      it('greeting with only prompts: text defaults to empty string', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {suggested_prompts: ['a']},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.greeting).toEqual({text: '', suggestedPrompts: ['a']});
      });

      it('greeting with text + empty prompts array: prompts key omitted', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {text: 'Hi', suggested_prompts: []},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.greeting).toEqual({text: 'Hi'});
        expect(arg.greeting).not.toHaveProperty('suggestedPrompts');
      });

      it('greeting all empty (text: "" + empty prompts): collapses to undefined', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {text: '', suggested_prompts: []},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().greeting).toBeUndefined();
      });

      it('greeting: null collapses to undefined', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: null as any,
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().greeting).toBeUndefined();
      });

      it('whitespace-only text passes through verbatim (no trim)', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {text: '   '},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.greeting).toEqual({text: '   '});
      });

      it('drops talent entries with missing or non-string name', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {
            version: 1,
            talents: [
              {name: 'render_html', required: true},
              {required: true} as any,
              {name: '', required: true} as any,
              {name: 42, required: true} as any,
              {name: null, required: true} as any,
            ],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.pact).toEqual({
          talents: [{name: 'render_html', necessity: 'required'}],
        });
      });

      it('drops non-object talent entries (null, string)', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {
            version: 1,
            talents: [
              {name: 'calculate', required: true},
              null as any,
              'render_html' as any,
              undefined as any,
            ],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.pact).toEqual({
          talents: [{name: 'calculate', necessity: 'required'}],
        });
      });

      it('pact collapses to undefined when all talent entries are invalid', async () => {
        const palsHubPal = buildPalsHubPal({
          pact: {
            version: 1,
            talents: [null as any, {required: true} as any, {name: ''} as any],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().pact).toBeUndefined();
      });

      it('drops non-array suggested_prompts (defends against payload drift)', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {text: 'Hi', suggested_prompts: 'render_html' as any},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.greeting).toEqual({text: 'Hi'});
        expect(arg.greeting).not.toHaveProperty('suggestedPrompts');
      });

      it('non-string text becomes empty string when prompts are present', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {text: 42 as any, suggested_prompts: ['a']},
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.greeting).toEqual({text: '', suggestedPrompts: ['a']});
      });

      it('non-array suggested_prompts + non-string text together collapse greeting to undefined', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {
            text: 42 as any,
            suggested_prompts: 'render_html' as any,
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().greeting).toBeUndefined();
      });

      it('drops non-string and empty-string entries from suggested_prompts', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {
            text: 'Hi',
            suggested_prompts: [
              'Draw a sunset',
              42 as any,
              null as any,
              '',
              'Make a chart',
            ],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.greeting).toEqual({
          text: 'Hi',
          suggestedPrompts: ['Draw a sunset', 'Make a chart'],
        });
      });

      it('collapses greeting when all suggested_prompts entries are invalid', async () => {
        const palsHubPal = buildPalsHubPal({
          greeting: {
            suggested_prompts: ['', null as any, 7 as any],
          },
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        expect(getCreatePalArg().greeting).toBeUndefined();
      });

      it('does not re-derive thumbnail_url or defaultModel from new server arrays', async () => {
        // Local conversion keeps reading the server-derived legacy singular
        // fields; the new arrays are not consumed.
        const palsHubPal = buildPalsHubPal({
          thumbnail_url: 'https://example.com/thumb.jpg',
          images: [
            {url: 'https://example.com/other.jpg', is_primary: true},
          ] as any,
          models: [
            {
              reference: {
                repo_id: 'other/repo',
                filename: 'other.gguf',
                author: 'other',
                downloadUrl: 'https://example.com/other.gguf',
                size: 1,
              },
              is_recommended: true,
            },
          ] as any,
        });

        await palStore.downloadPalsHubPal(palsHubPal);

        const arg = getCreatePalArg();
        expect(arg.thumbnail_url).toBe('/path/to/thumb.jpg');
        expect(arg.defaultModel).toBeUndefined();
        expect(arg).not.toHaveProperty('images');
        expect(arg).not.toHaveProperty('models');
      });
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      runInAction(() => {
        palStore.pals = [
          mockPal,
          {
            ...mockPal,
            id: 'video-pal',
            name: 'Video Pal',
            capabilities: {video: true},
          },
          {
            ...mockPal,
            id: 'palshub-pal',
            name: 'PalsHub Pal',
            source: 'palshub',
            palshub_id: 'ph-123',
          },
        ];
      });
    });

    it('should get video pals', () => {
      const videoPals = palStore.getVideoPals();
      expect(videoPals).toHaveLength(1);
      expect(videoPals[0].id).toBe('video-pal');
    });

    it('should get all pals', () => {
      const allPals = palStore.getAllPals();
      expect(allPals).toHaveLength(3);
    });

    it('should check if PalsHub pal is downloaded', () => {
      expect(palStore.isPalsHubPalDownloaded('ph-123')).toBe(true);
      expect(palStore.isPalsHubPalDownloaded('ph-456')).toBe(false);
    });
  });
});
