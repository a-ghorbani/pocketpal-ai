import {mockHFModel1, mockHFModel2} from '../../jest/fixtures/models';

export const mockHFStore = {
  models: [mockHFModel1, mockHFModel2],
  isLoading: false,
  error: '',
  nextPageLink: null,
  searchQuery: '',
  queryFilter: 'gguf',
  queryFull: true,
  queryConfig: true,
  hfToken: '',
  useHfToken: true,
  searchFilters: {
    author: '',
    sortBy: 'relevance' as const,
  },

  get isTokenPresent(): boolean {
    return !!this.hfToken && this.hfToken.trim().length > 0;
  },
  get shouldUseToken(): boolean {
    return this.isTokenPresent && this.useHfToken;
  },

  setUseHfToken: jest.fn(),
  setToken: jest.fn().mockResolvedValue(Promise.resolve(true)),
  clearToken: jest.fn().mockResolvedValue(Promise.resolve(true)),

  // Methods
  setSearchQuery: jest.fn(),
  setSearchFilters: jest.fn(),
  fetchAndSetGGUFSpecs: jest.fn().mockResolvedValue(undefined),
  fetchModelFileDetails: jest.fn().mockResolvedValue(undefined),
  getModelById: jest.fn(id =>
    mockHFStore.models.find(model => model.id === id),
  ),
  fetchModelData: jest.fn().mockResolvedValue(undefined),
  fetchModels: jest.fn().mockResolvedValue(undefined),
  fetchMoreModels: jest.fn().mockResolvedValue(undefined),
};

// Mock the store instance
export const hfStore = mockHFStore;
