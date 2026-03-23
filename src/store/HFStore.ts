import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {fetchGGUFSpecs, fetchModelFilesDetails, fetchModels} from '../api/hf';

import {hasEnoughSpace, hfAsModel} from '../utils';
import {processHFSearchResults} from '../utils/hf';
import {ErrorState, createErrorState} from '../utils/errors';

import {HuggingFaceModel} from '../utils/types';

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
  searchQuery = '';
  queryFilter = 'gguf,conversational';
  queryFull = true;
  queryConfig = true;
  hfToken: string | null = null;
  useHfToken: boolean = true; // Only applies when token is set

  // search filters
  searchFilters: SearchFilters = {
    author: '',
    sortBy: 'relevance',
  };

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'HFStore',
      properties: ['useHfToken'],
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
    } catch {
      return;
    }
  }

  get isTokenPresent(): boolean {
    return !!this.hfToken && this.hfToken.trim().length > 0;
  }

  get shouldUseToken(): boolean {
    return this.isTokenPresent && this.useHfToken;
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
    } catch {
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
    } catch {
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

  // Fetch the GGUF specs for a specific model,
  // such as number of parameters, context length, chat template, etc.
  async fetchAndSetGGUFSpecs(modelId: string) {
    try {
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const specs = await fetchGGUFSpecs(modelId, authToken);
      const model = this.models.find(m => m.id === modelId);
      if (model) {
        runInAction(() => {
          model.specs = specs;
        });
      }
    } catch (error) {
      runInAction(() => {
        this.error = createErrorState(error, 'modelDetails', 'huggingface');
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
        };

        return {
          ...enrichedFile,
          canFitInStorage: await hasEnoughSpace(hfAsModel(model, enrichedFile)),
        };
      }),
    );
  }

  // Fetch the details (sizes, oid, lfs, ...) of the model files
  async fetchModelFileDetails(modelId: string) {
    try {
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const fileDetails = await fetchModelFilesDetails(modelId, authToken);
      const model = this.models.find(m => m.id === modelId);

      if (!model) {
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
      runInAction(() => {
        this.error = createErrorState(error, 'modelDetails', 'huggingface');
      });
    }
  }

  getModelById(id: string): HuggingFaceModel | null {
    return this.models.find(model => model.id === id) || null;
  }

  async fetchModelData(modelId: string) {
    try {
      await this.fetchAndSetGGUFSpecs(modelId);
      await this.fetchModelFileDetails(modelId);
    } catch (error) {
      runInAction(() => {
        this.error = createErrorState(error, 'modelDetails', 'huggingface');
      });
    }
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
      return true;
    }

    // If we've had multiple consecutive small results, be more cautious
    if (this.consecutiveSmallResults >= 3 && timeSinceLastAttempt < 5000) {
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

  // Force-reset loading state (e.g. when the user closes the search sheet)
  resetLoading() {
    runInAction(() => {
      this.isLoading = false;
      this.nextPageLink = null;
      this.lastFetchedNextLink = null;
      this.lastFetchMoreAttempt = 0;
      this.consecutiveSmallResults = 0;
    });
  }

  // Fetch the models from the Hugging Face API
  async fetchModels() {
    this.isLoading = true;
    this.error = null;

    // Fresh search → reset pagination guards
    this.lastFetchedNextLink = null;
    this.consecutiveSmallResults = 0;
    this.lastFetchMoreAttempt = 0;

    // Safety net: force-clear isLoading after 20s no matter what
    const safetyTimer = setTimeout(() => {
      if (this.isLoading) {
        runInAction(() => {
          this.isLoading = false;
          if (!this.error) {
            this.error = createErrorState(
              new Error('Request timed out'),
              'search',
              'huggingface',
            );
          }
        });
      }
    }, 20000);

    try {
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const sortParams = this.getSortParams();

      const {models, nextLink} = await fetchModels({
        search: this.searchQuery,
        author: this.searchFilters.author || undefined,
        limit: 10,
        sort: sortParams?.sort,
        direction: sortParams?.direction,
        filter: this.buildFilterString(),
        full: this.queryFull,
        config: this.queryConfig,
        authToken: authToken,
      });

      let processedModels = processHFSearchResults(models);

      runInAction(() => {
        this.models = processedModels;
        this.nextPageLink = nextLink;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
        this.nextPageLink = null;
        this.models = [];
      });
      // this need to be in a separate runInAction for the ui to render properly.
      runInAction(() => {
        this.error = createErrorState(error, 'search', 'huggingface');
      });
    } finally {
      clearTimeout(safetyTimer);
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  // Fetch the next page of models
  async fetchMoreModels() {
    if (!this.nextPageLink || this.isLoading) {
      return;
    }

    // Check if we should prevent fetching more due to small result sets
    if (this.shouldPreventFetchMore()) {
      return;
    }

    // ⛔️ Don't refetch the same page over and over
    if (this.lastFetchedNextLink === this.nextPageLink) {
      return;
    }
    this.lastFetchedNextLink = this.nextPageLink;
    this.lastFetchMoreAttempt = Date.now();

    this.isLoading = true;
    this.error = null;

    const safetyTimer = setTimeout(() => {
      if (this.isLoading) {
        runInAction(() => {
          this.isLoading = false;
          this.nextPageLink = null;
          if (!this.error) {
            this.error = createErrorState(
              new Error('Request timed out'),
              'search',
              'huggingface',
            );
          }
        });
      }
    }, 20000);

    try {
      const authToken = this.shouldUseToken ? this.hfToken : null;
      const {models, nextLink} = await fetchModels({
        nextPageUrl: this.nextPageLink,
        authToken: authToken,
      });

      let processedModels = processHFSearchResults(models);

      runInAction(() => {
        // Track consecutive small results for pagination protection
        if (processedModels.length < 3) {
          this.consecutiveSmallResults++;
        } else {
          this.consecutiveSmallResults = 0;
        }

        processedModels.forEach((model: HuggingFaceModel) =>
          this.models.push(model),
        );
        this.nextPageLink = nextLink;
      });
    } catch (error) {
      runInAction(() => {
        this.error = createErrorState(error, 'search', 'huggingface');
      });
    } finally {
      clearTimeout(safetyTimer);
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }
}

export const hfStore = new HFStore();
