import {
  mockHFModel1,
  mockHFModel2,
  mockGGUFSpecs1,
  mockGGUFSpecs2,
  mockHFModelFiles1,
} from '../../../jest/fixtures/models';
import {hfStore} from '../../store/HFStore';
import {
  fetchGGUFSpecs,
  fetchModelFilesDetails,
  fetchModels,
} from '../../api/hf';

// Mock the API calls
jest.mock('../../api/hf');

describe('HFStore', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Reset store to initial state
    hfStore.models = [];
    hfStore.isLoading = false;
    hfStore.error = null;
    hfStore.nextPageLink = null;
    hfStore.searchQuery = '';
    // Clear the token to ensure tests start with no authentication
    hfStore.hfToken = null;
    hfStore.useHfToken = true;
    // Reset pagination protection state
    (hfStore as any).lastFetchMoreAttempt = 0;
    (hfStore as any).consecutiveSmallResults = 0;
    (hfStore as any).lastFetchedNextLink = null;
  });

  describe('fetchModels', () => {
    it('should fetch and process models successfully', async () => {
      const mockResponse = {
        models: [mockHFModel1, mockHFModel2],
        nextLink: 'next-page-url',
      };
      (fetchModels as jest.Mock).mockResolvedValueOnce(mockResponse);

      await hfStore.fetchModels();

      expect(hfStore.models).toHaveLength(2);
      expect(hfStore.models[0].url).toBe(
        'https://huggingface.co/owner/hf-model-name-1',
      );
      expect(hfStore.nextPageLink).toBe('next-page-url');
      expect(hfStore.error).toBe(null);
      expect(hfStore.isLoading).toBe(false);
    });

    it('should handle fetch error', async () => {
      (fetchModels as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      await hfStore.fetchModels();

      expect(hfStore.models).toHaveLength(0);
      expect(hfStore.error).toEqual(
        expect.objectContaining({
          context: 'search',
          message: 'Network error',
          recoverable: true,
          service: 'huggingface',
        }),
      );
      expect(hfStore.isLoading).toBe(false);
    });
  });

  describe('fetchMoreModels', () => {
    it('should not fetch if nextPageLink is null', async () => {
      hfStore.nextPageLink = null;
      await hfStore.fetchMoreModels();

      expect(fetchModels).not.toHaveBeenCalled();
    });

    it('should append new models to existing ones', async () => {
      // Set initial state
      hfStore.models = [mockHFModel1];
      hfStore.nextPageLink = 'next-page-url';

      const mockResponse = {
        models: [mockHFModel2],
        nextLink: null,
      };
      (fetchModels as jest.Mock).mockResolvedValueOnce(mockResponse);

      await hfStore.fetchMoreModels();

      expect(hfStore.models).toHaveLength(2);
      expect(hfStore.models[1].id).toBe(mockHFModel2.id);
      expect(hfStore.nextPageLink).toBeNull();
    });

    it('should prevent rapid successive calls with debouncing', async () => {
      // Set initial state with few models to trigger protection
      hfStore.models = [mockHFModel1];
      hfStore.nextPageLink = 'next-page-url';

      // First call should go through
      const mockResponse = {
        models: [mockHFModel2],
        nextLink: 'next-page-url-2',
      };
      (fetchModels as jest.Mock).mockResolvedValueOnce(mockResponse);

      await hfStore.fetchMoreModels();
      expect(fetchModels).toHaveBeenCalledTimes(1);

      // Immediate second call should be prevented due to debouncing
      await hfStore.fetchMoreModels();
      expect(fetchModels).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should track consecutive small results', async () => {
      hfStore.models = [];
      hfStore.nextPageLink = 'next-page-url';

      // Mock multiple responses with small result sets
      const smallResponse = {
        models: [mockHFModel1], // Only 1 model (< 3)
        nextLink: 'next-page-url-2',
      };

      (fetchModels as jest.Mock)
        .mockResolvedValueOnce(smallResponse)
        .mockResolvedValueOnce(smallResponse)
        .mockResolvedValueOnce(smallResponse);

      // Make multiple calls to trigger consecutive small results tracking
      await hfStore.fetchMoreModels();
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      await hfStore.fetchMoreModels();
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      await hfStore.fetchMoreModels();

      // Should have tracked consecutive small results
      expect((hfStore as any).consecutiveSmallResults).toBeGreaterThan(0);
    });
  });

  describe('fetchModelData', () => {
    it('should fetch both GGUF specs and file sizes', async () => {
      const modelId = 'owner/hf-model-name-1';

      (fetchGGUFSpecs as jest.Mock).mockResolvedValueOnce(mockGGUFSpecs1);
      (fetchModelFilesDetails as jest.Mock).mockResolvedValueOnce(
        mockHFModelFiles1,
      );

      await hfStore.fetchModelData(modelId);

      expect(fetchGGUFSpecs).toHaveBeenCalledWith(modelId, null);
      expect(fetchModelFilesDetails).toHaveBeenCalledWith(modelId, null);
    });
  });

  describe('getModelById', () => {
    it('should return model by id', () => {
      hfStore.models = [mockHFModel1, mockHFModel2];

      const model = hfStore.getModelById(mockHFModel1.id);

      // With MobX stores, the objects are wrapped in Proxies, hence toStrictEqual as opposed to toBe.
      expect(model).toStrictEqual(mockHFModel1);
    });

    it('should return null for non-existent model', () => {
      hfStore.models = [mockHFModel1];

      const model = hfStore.getModelById('non-existent-id');

      expect(model).toBeNull();
    });
  });

  describe('setSearchQuery', () => {
    it('should update search query', () => {
      const query = 'test query';

      hfStore.setSearchQuery(query);

      expect(hfStore.searchQuery).toBe(query);
    });
  });

  describe('pagination protection', () => {
    it('should reset pagination guards on fresh search', async () => {
      // Set some state that should be reset
      (hfStore as any).consecutiveSmallResults = 5;
      (hfStore as any).lastFetchMoreAttempt = Date.now();

      const mockResponse = {
        models: [mockHFModel1],
        nextLink: null,
      };
      (fetchModels as jest.Mock).mockResolvedValueOnce(mockResponse);

      await hfStore.fetchModels();

      expect((hfStore as any).consecutiveSmallResults).toBe(0);
      expect((hfStore as any).lastFetchMoreAttempt).toBe(0);
    });

    it('should use correct sort parameters', () => {
      hfStore.setSortBy('lastModified');
      const sortParams = (hfStore as any).getSortParams();

      expect(sortParams?.sort).toBe('lastModified');
      expect(sortParams?.direction).toBe('-1');
    });

    it('should use relevance as default sort (no sorting)', () => {
      hfStore.setSortBy('relevance');
      const sortParams = (hfStore as any).getSortParams();

      expect(sortParams).toBeNull();
    });

    it('should use downloads sort when specified', () => {
      hfStore.setSortBy('downloads');
      const sortParams = (hfStore as any).getSortParams();

      expect(sortParams?.sort).toBe('downloads');
      expect(sortParams?.direction).toBe('-1');
    });
  });

  describe('fetchAndSetGGUFSpecs', () => {
    it('should update model specs when successful', async () => {
      hfStore.models = [mockHFModel1];
      (fetchGGUFSpecs as jest.Mock).mockResolvedValueOnce(mockGGUFSpecs2);

      await hfStore.fetchAndSetGGUFSpecs(mockHFModel1.id);

      expect(hfStore.models[0].specs).toEqual(mockGGUFSpecs2);
    });

    it('should handle non-existent model', async () => {
      hfStore.models = [];
      (fetchGGUFSpecs as jest.Mock).mockResolvedValueOnce(mockGGUFSpecs1);

      await hfStore.fetchAndSetGGUFSpecs('non-existent-id');

      expect(fetchGGUFSpecs).toHaveBeenCalled();
      // Should not throw error
    });
  });

  describe('fetchModelFileDetails', () => {
    it('should update model siblings with file sizes', async () => {
      hfStore.models = [mockHFModel1];
      const fileDetails = [
        {path: 'hf-model-name-1.Q4_K_M.gguf', size: 1111, oid: 'abc123'},
      ];

      (fetchModelFilesDetails as jest.Mock).mockResolvedValueOnce(fileDetails);

      await hfStore.fetchModelFileDetails(mockHFModel1.id);

      expect(hfStore.models[0].siblings[0].size).toBe(1111);
      expect(hfStore.models[0].siblings[0].oid).toBe('abc123');
    });

    it('should handle non-existent model', async () => {
      hfStore.models = [];
      (fetchModelFilesDetails as jest.Mock).mockResolvedValueOnce([]);

      await hfStore.fetchModelFileDetails('non-existent-id');

      expect(fetchModelFilesDetails).toHaveBeenCalled();
      // Should not throw error
    });
  });
});
