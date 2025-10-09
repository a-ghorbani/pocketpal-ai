import {runInAction} from 'mobx';
import {palStore} from '../PalStore';
import {palsHubService} from '../../services';
import {palRepository} from '../../repositories/PalRepository';
import type {Pal} from '../../types/pal';
import type {PalsHubPal} from '../../types/palshub';
import * as imageUtils from '../../utils/imageUtils';

// Mock dependencies
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
