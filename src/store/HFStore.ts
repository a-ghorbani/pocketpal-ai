import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {
  fetchGGUFSpecsFromSource,
  fetchModelFilesDetailsFromSource,
  fetchModelsFromSource,
} from '../api/modelSources';

import {
  createSiblingsFromFileDetails,
  hasEnoughSpace,
  hfAsModel,
} from '../utils';
import {ErrorState, createErrorState} from '../utils/errors';

import {HuggingFaceModel, ModelSourceId} from '../utils/types';

// Service name for keychain storage
const HF_TOKEN_SERVICE = 'hf_token_service';

// Filter types for enhanced search
export type SortOption = 'relevance' | 'downloads' | 'lastModified' | 'likes';

export interface SearchFilters {
  author: string;
  sortBy: SortOption;
}

class HFStore {
  models: HuggingFaceModel[] = [];
  isLoading = false;
  error: ErrorState | null = null;
  nextPageLink: string | null = null;
  private lastFetchedNextLink: string | null = null;
  private lastFetchMoreAttempt: number = 0;
  private consecutiveSmallResults: number = 0;
  private searchRequestId = 0;
  private fetchMoreRequestId = 0;
  private activeSearchRequestId = 0;
  private activeFetchMoreRequestId = 0;
  private modelDetailsRequestId = 0;
  modelDetailsLoading = false;
  private activeModelDetailsId: string | null = null;
  searchQuery = '';
  queryFilter = 'gguf,conversational';
  queryFull = true;
  queryConfig = true;
  hfToken: string | null = null;
  useHfToken: boolean = true; // Only applies when token is set
  selectedSource: ModelSourceId = 'huggingface';

  // search filters
  searchFilters: SearchFilters = {
    author: '',
    sortBy: 'relevance',
  };

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'HFStore',
      properties: ['useHfToken', 'selectedSource'],
      storage: AsyncStorage,
    });

    // Load token from secure storage on initialization
    this.loadTokenFromSecureStorage();
  }

  // Load token from secure storage
  private async loadTokenFromSecureStorage() {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: HF_TOKEN_SERVICE,
      });

      if (credentials) {
        runInAction(() => {
          this.hfToken = credentials.password;
        });
      }
    } catch (error) {
      console.error('Failed to load token from secure storage:', error);
    }
  }

  get isTokenPresent(): boolean {
    return !!this.hfToken && this.hfToken.trim().length > 0;
  }

  get shouldUseToken(): boolean {
    return this.isTokenPresent && this.useHfToken;
  }

  get shouldUseTokenForSelectedSource(): boolean {
    return this.shouldUseTokenForSource(this.selectedSource);
  }

  setSelectedSource(source: ModelSourceId) {
    runInAction(() => {
      this.selectedSource = source;
      this.models = [];
      this.nextPageLink = null;
      this.error = null;
      this.lastFetchedNextLink = null;
      this.consecutiveSmallResults = 0;
      this.lastFetchMoreAttempt = 0;
      this.searchRequestId++;
      this.fetchMoreRequestId++;
      this.isLoading = false;
      this.activeModelDetailsId = null;
      this.modelDetailsLoading = false;
    });
  }

  setUseHfToken(useToken: boolean) {
    runInAction(() => {
      this.useHfToken = useToken;
    });
  }

  async setToken(token: string) {
    try {
      // Save token in secure storage
      await Keychain.setGenericPassword('hf_token', token, {
        service: HF_TOKEN_SERVICE,
      });

      runInAction(() => {
        this.hfToken = token;
      });
      return true;
    } catch (error) {
      console.error('Failed to save HF token:', error);
      return false;
    }
  }

  async clearToken() {
    try {
      // Remove token from secure storage
      await Keychain.resetGenericPassword({
        service: HF_TOKEN_SERVICE,
      });

      runInAction(() => {
        this.hfToken = null;
      });
      return true;
    } catch (error) {
      console.error('Failed to clear HF token:', error);
      return false;
    }
  }

  setSearchQuery(query: string) {
    this.searchQuery = query;
  }

  setSearchFilters(filters: Partial<SearchFilters>) {
    if (
      filters.author !== undefined &&
      this.searchFilters.author !== filters.author
    ) {
      this.searchFilters.author = filters.author;
    }
    if (
      filters.sortBy !== undefined &&
      this.searchFilters.sortBy !== filters.sortBy
    ) {
      this.searchFilters.sortBy = filters.sortBy;
    }
  }

  setAuthorFilter(author: string) {
    this.searchFilters.author = author;
  }

  setSortBy(sortBy: SortOption) {
    this.searchFilters.sortBy = sortBy;
  }

  clearFilters() {
    this.searchFilters = {
      author: '',
      sortBy: 'relevance',
    };
  }

  clearError() {
    this.error = null;
  }

  private isCurrentSearchRequest(
    requestId: number,
    source: ModelSourceId,
    searchQuery: string,
    filters: SearchFilters,
  ) {
    return (
      requestId === this.searchRequestId &&
      source === this.selectedSource &&
      searchQuery === this.searchQuery &&
      filters.author === this.searchFilters.author &&
      filters.sortBy === this.searchFilters.sortBy
    );
  }

  private isCurrentFetchMoreRequest(
    requestId: number,
    source: ModelSourceId,
    nextPageLink: string,
  ) {
    return (
      requestId === this.fetchMoreRequestId &&
      source === this.selectedSource &&
      nextPageLink === this.lastFetchedNextLink
    );
  }

  private isCurrentModelDetailsRequest(requestId?: number, modelId?: string) {
    return (
      requestId === undefined ||
      (requestId === this.modelDetailsRequestId &&
        (!modelId || modelId === this.activeModelDetailsId))
    );
  }

  // Fetch the GGUF specs for a specific model,
  // such as number of parameters, context length, chat template, etc.
  async fetchAndSetGGUFSpecs(modelId: string, requestId?: number) {
    try {
      const source = this.getSourceForModelId(modelId);
      const authToken = this.shouldUseTokenForSource(source)
        ? this.hfToken
        : null;
      const specs = await fetchGGUFSpecsFromSource({
        source,
        modelId,
        authToken,
      });
      if (!this.isCurrentModelDetailsRequest(requestId, modelId)) {
        return;
      }
      const model = this.models.find(m => m.id === modelId);
      if (model) {
        runInAction(() => {
          model.specs = specs;
        });
      }
    } catch (error) {
      if (!this.isCurrentModelDetailsRequest(requestId, modelId)) {
        return;
      }
      console.error('Failed to fetch GGUF specs:', error);
      runInAction(() => {
        this.error = createErrorState(
          error,
          'modelDetails',
          this.getSourceForModelId(modelId),
        );
      });
    }
  }

  private async updateSiblingsWithFileDetails(
    model: HuggingFaceModel,
    fileDetails: any[],
  ) {
    return Promise.all(
      model.siblings.map(async file => {
        const details = fileDetails.find(
          detail => detail.path === file.rfilename,
        );
        if (!details) {
          return {...file};
        }

        const enrichedFile = {
          ...file,
          size: details.size,
          oid: details.oid,
          lfs: details.lfs,
          split: details.split || file.split,
        };

        return {
          ...enrichedFile,
          canFitInStorage: await hasEnoughSpace(hfAsModel(model, enrichedFile)),
        };
      }),
    );
  }

  // Fetch the details (sizes, oid, lfs, ...) of the model files
  async fetchModelFileDetails(modelId: string, requestId?: number) {
    try {
      console.log('Fetching model file details for', modelId);
      const source = this.getSourceForModelId(modelId);
      const authToken = this.shouldUseTokenForSource(source)
        ? this.hfToken
        : null;
      const fileDetails = await fetchModelFilesDetailsFromSource({
        source,
        modelId,
        authToken,
      });
      if (!this.isCurrentModelDetailsRequest(requestId, modelId)) {
        return;
      }
      const model = this.models.find(m => m.id === modelId);

      if (!model) {
        return;
      }

      if (model.siblings.length === 0 && fileDetails.length > 0) {
        const source = this.getSourceForModelId(modelId);
        const updatedSiblings = await Promise.all(
          createSiblingsFromFileDetails(
            model.sourceRepoId || model.id,
            fileDetails,
          ).map(async file => ({
            ...file,
            canFitInStorage: await hasEnoughSpace(hfAsModel(model, file)),
          })),
        );

        runInAction(() => {
          model.source = source;
          model.siblings = updatedSiblings;
        });
        return;
      }

      const updatedSiblings = await this.updateSiblingsWithFileDetails(
        model,
        fileDetails,
      );

      runInAction(() => {
        model.siblings = updatedSiblings;
      });
    } catch (error) {
      if (!this.isCurrentModelDetailsRequest(requestId, modelId)) {
        return;
      }
      console.error('Error fetching model file sizes:', error);
      runInAction(() => {
        this.error = createErrorState(
          error,
          'modelDetails',
          this.getSourceForModelId(modelId),
        );
      });
    }
  }

  getModelById(id: string): HuggingFaceModel | null {
    return this.models.find(model => model.id === id) || null;
  }

  async fetchModelData(modelId: string) {
    const requestId = ++this.modelDetailsRequestId;
    runInAction(() => {
      this.modelDetailsLoading = true;
      this.activeModelDetailsId = modelId;
      this.error = null;
    });

    try {
      await this.fetchAndSetGGUFSpecs(modelId, requestId);
      await this.fetchModelFileDetails(modelId, requestId);
    } catch (error) {
      if (!this.isCurrentModelDetailsRequest(requestId, modelId)) {
        return;
      }
      console.error('Error fetching model data:', error);
      runInAction(() => {
        this.error = createErrorState(
          error,
          'modelDetails',
          this.getSourceForModelId(modelId),
        );
      });
    } finally {
      if (this.isCurrentModelDetailsRequest(requestId, modelId)) {
        runInAction(() => {
          this.modelDetailsLoading = false;
        });
      }
    }
  }

  private shouldUseTokenForSource(source: ModelSourceId): boolean {
    return this.shouldUseToken;
  }

  private getSourceForModelId(modelId: string): ModelSourceId {
    return (
      this.models.find(model => model.id === modelId)?.source ||
      this.selectedSource
    );
  }

  get hasMoreResults() {
    return this.nextPageLink !== null;
  }

  // Check if we should prevent fetching more due to small result sets
  private shouldPreventFetchMore(): boolean {
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastFetchMoreAttempt;

    // If we have very few models and recent attempts, apply debouncing
    if (this.models.length < 5 && timeSinceLastAttempt < 2000) {
      console.log('🔵 Preventing fetchMore: too few models and recent attempt');
      return true;
    }

    // If we've had multiple consecutive small results, be more cautious
    if (this.consecutiveSmallResults >= 3 && timeSinceLastAttempt < 5000) {
      console.log(
        '🔵 Preventing fetchMore: multiple small results, applying longer debounce',
      );
      return true;
    }

    return false;
  }

  // Helper method to build filter string based on current filters
  private buildFilterString(): string {
    return this.queryFilter; // Just use the base filter
  }

  // Helper method to get sort parameters
  private getSortParams(): {sort: string; direction: string} | null {
    switch (this.searchFilters.sortBy) {
      case 'lastModified':
        return {sort: 'lastModified', direction: '-1'};
      case 'likes':
        return {sort: 'likes', direction: '-1'};
      case 'downloads':
        return {sort: 'downloads', direction: '-1'};
      case 'relevance':
      default:
        return null; // No sorting - use HF's default relevance ranking
    }
  }

  // Fetch the models from the Hugging Face API
  async fetchModels() {
    const requestId = ++this.searchRequestId;
    const source = this.selectedSource;
    const searchQuery = this.searchQuery;
    const searchFilters = {...this.searchFilters};
    const filter = this.buildFilterString();
    const sortParams = this.getSortParams();
    const authToken = this.shouldUseTokenForSelectedSource
      ? this.hfToken
      : null;

    this.activeSearchRequestId = requestId;
    this.isLoading = true;
    this.error = null;

    // Fresh search → reset pagination guards
    this.lastFetchedNextLink = null;
    this.consecutiveSmallResults = 0;
    this.lastFetchMoreAttempt = 0;

    try {
      const {models, nextLink} = await fetchModelsFromSource({
        source,
        search: searchQuery,
        author: searchFilters.author || undefined,
        limit: 10,
        sort: sortParams?.sort,
        direction: sortParams?.direction,
        filter,
        full: this.queryFull,
        config: this.queryConfig,
        authToken: authToken,
      });

      if (
        !this.isCurrentSearchRequest(
          requestId,
          source,
          searchQuery,
          searchFilters,
        )
      ) {
        return;
      }

      runInAction(() => {
        this.models = models;
        this.nextPageLink = nextLink;
      });
    } catch (error) {
      if (
        !this.isCurrentSearchRequest(
          requestId,
          source,
          searchQuery,
          searchFilters,
        )
      ) {
        return;
      }

      runInAction(() => {
        this.isLoading = false;
        this.nextPageLink = null;
        this.models = [];
      });
      // this need to be in a separate runInAction for the ui to render properly.
      runInAction(() => {
        this.error = createErrorState(error, 'search', source);
      });
    } finally {
      if (requestId === this.activeSearchRequestId) {
        runInAction(() => {
          this.isLoading = false;
        });
      }
    }
  }

  // Fetch the next page of models
  async fetchMoreModels() {
    console.log('fetchMoreModels called');
    if (!this.nextPageLink || this.isLoading) {
      return;
    }

    // Check if we should prevent fetching more due to small result sets
    if (this.shouldPreventFetchMore()) {
      return;
    }

    // ⛔️ Don't refetch the same page over and over
    if (this.lastFetchedNextLink === this.nextPageLink) {
      console.log(
        '🔵 Skipping duplicate fetch for same nextPageLink:',
        this.nextPageLink,
      );
      return;
    }
    const requestId = ++this.fetchMoreRequestId;
    const source = this.selectedSource;
    const nextPageLink = this.nextPageLink;
    this.activeFetchMoreRequestId = requestId;
    this.lastFetchedNextLink = nextPageLink;
    this.lastFetchMoreAttempt = Date.now();

    this.isLoading = true;
    this.error = null;

    try {
      const authToken = this.shouldUseTokenForSelectedSource
        ? this.hfToken
        : null;
      const {models, nextLink} = await fetchModelsFromSource({
        source,
        nextPageUrl: nextPageLink,
        authToken: authToken,
      });

      if (!this.isCurrentFetchMoreRequest(requestId, source, nextPageLink)) {
        return;
      }

      runInAction(() => {
        // Track consecutive small results for pagination protection
        if (models.length < 3) {
          this.consecutiveSmallResults++;
        } else {
          this.consecutiveSmallResults = 0;
        }

        models.forEach((model: HuggingFaceModel) => this.models.push(model));
        this.nextPageLink = nextLink;
      });
    } catch (error) {
      if (!this.isCurrentFetchMoreRequest(requestId, source, nextPageLink)) {
        return;
      }

      runInAction(() => {
        this.error = createErrorState(error, 'search', source);
      });
    } finally {
      if (requestId === this.activeFetchMoreRequestId) {
        runInAction(() => {
          this.isLoading = false;
        });
      }
    }
  }
}

export const hfStore = new HFStore();
