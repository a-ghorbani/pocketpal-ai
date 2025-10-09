/**
 * PalStore - Dynamic Parameter Pal Store
 *
 * This is the new pal store that replaces the legacy PalStore with a flexible,
 * schema-driven approach that supports dynamic parameters and custom pal types.
 *
 * KEY FEATURES:
 * - Dynamic parameter schemas: Create pals with any custom parameters
 * - Unified UI: Single PalSheet component works for all pal types
 * - PalsHub integration: Support for marketplace pals with custom parameters
 * - Extensible: Easy to add new parameter types (text, select, datetime_tag)
 * - Migration: Automatically migrates data from legacy PalStore on startup
 *
 * @see src/types/pal.ts for type definitions
 * @see src/utils/pal-migration.ts for migration utilities
 * @see src/components/PalsSheets/PalSheet.tsx for unified UI component
 */

import {v4 as uuidv4} from 'uuid';
import {makeAutoObservable, runInAction} from 'mobx';

import {fetchModelInfo, fetchModelFilesDetails} from '../api/hf';

import {HF_DOMAIN} from '../config/urls';

import {palRepository} from '../repositories/PalRepository';

import {hfAsModel} from '../utils';
import {palsHubService} from '../services';
import {defaultModels} from './defaultModels';
import {parsePalsHubTemplate} from '../utils/palshub-template-parser';

import type {Pal, ParameterDefinition} from '../types/pal';
import type {
  ModelReference,
  PalsHubPal,
  SearchFilters,
  SyncState,
} from '../types/palshub';

import {ModelOrigin} from '../utils/types';
import {createSiblingsFromFileDetails} from '../utils/hf';
import type {Model, HuggingFaceModel, ModelFile} from '../utils/types';
import {downloadPalThumbnail, deletePalThumbnail} from '../utils/imageUtils';

class PalStore {
  // Core pals storage
  pals: Pal[] = [];

  // PalsHub integration state
  cachedPalsHubPals: PalsHubPal[] = [];
  userLibrary: PalsHubPal[] = [];
  userCreatedPals: PalsHubPal[] = [];
  isLoadingPalsHub: boolean = false;
  searchFilters: SearchFilters = {};
  syncState: SyncState = {status: 'idle'};

  // Migration state
  isMigrating: boolean = false;
  migrationComplete: boolean = false;
  migrationVersion: string = '1.0';

  constructor() {
    makeAutoObservable(this);
    this.initialize();
    console.log('Pal store initialized');
    console.log('Pals number: ', this.pals.length);
  }

  async initialize() {
    try {
      runInAction(() => {
        this.isMigrating = true;
      });

      // Migrate from JSON/AsyncStorage to database
      await palRepository.checkAndMigrateFromJSON();

      // Load pals from database
      await this.loadPalsFromDatabase();

      // Initialize Lookie pal after database is loaded
      await this.initializeLookiePal();

      console.log('Pal store initialization completed');

      runInAction(() => {
        this.isMigrating = false;
        this.migrationComplete = true;
      });
    } catch (error) {
      console.error('Failed to initialize pal store:', error);
      runInAction(() => {
        this.isMigrating = false;
        this.migrationComplete = false;
      });
    }
  }

  /**
   * Load pals from database into MobX store
   */
  private async loadPalsFromDatabase() {
    try {
      const pals = await palRepository.getAllPals();
      runInAction(() => {
        this.pals = pals;
      });
    } catch (error) {
      console.error('Error loading pals from database:', error);
    }
  }

  // Core unified pal management methods

  /**
   * Adds a pal to both repository and store (handles persistence + state)
   * This is the ONLY method that should handle repository + store updates
   */
  private addPal = async (
    palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Pal> => {
    const savedPal = await palRepository.createPal(palData);

    runInAction(() => {
      this.pals.push(savedPal);
    });

    return savedPal;
  };

  /**
   * Creates a new pal
   */
  createPal = async (
    palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Pal> => {
    return this.addPal(palData);
  };

  /**
   * Updates an existing pal
   */
  updatePal = async (id: string, updates: Partial<Pal>): Promise<void> => {
    try {
      const updatedPal = await palRepository.updatePal(id, updates);
      if (updatedPal) {
        runInAction(() => {
          const palIndex = this.pals.findIndex(p => p.id === id);
          if (palIndex !== -1) {
            this.pals[palIndex] = updatedPal;
          }
        });
      } else {
        throw new Error('Failed to update pal - no updated pal returned');
      }
    } catch (error) {
      console.error('Error updating pal:', error);
      throw error; // Re-throw so calling code can handle it
    }
  };

  /**
   * Deletes a pal
   */
  deletePal = async (id: string): Promise<void> => {
    try {
      // Find the pal to get its thumbnail path before deletion
      const palIndex = this.pals.findIndex(p => p.id === id);
      const pal = palIndex !== -1 ? this.pals[palIndex] : null;

      const success = await palRepository.deletePal(id);
      if (success) {
        // Clean up local thumbnail image if it exists
        if (pal?.thumbnail_url) {
          try {
            // deletePalThumbnail now handles all path formats (relative, absolute, file://)
            await deletePalThumbnail(pal.thumbnail_url);
          } catch (imageError) {
            console.warn('Failed to delete thumbnail image:', imageError);
            // Don't fail the entire deletion if image cleanup fails
          }
        }

        runInAction(() => {
          if (palIndex !== -1) {
            this.pals.splice(palIndex, 1);
          }
        });
      }
    } catch (error) {
      console.error('Error deleting pal:', error);
    }
  };

  /**
   * Gets all pals
   */
  getPals = (): Pal[] => {
    return this.pals;
  };

  /**
   * Gets a pal by ID
   */
  getPalById = (id: string): Pal | undefined => {
    return this.pals.find(p => p.id === id);
  };

  // PalsHub integration methods

  /**
   * Downloads a PalsHub pal and converts it to unified format
   */
  downloadPalsHubPal = async (palsHubPal: PalsHubPal): Promise<Pal> => {
    try {
      // For free pals, allow direct download without ownership check
      // For premium pals, check ownership first
      if (palsHubPal.price_cents > 0) {
        const ownership = await palsHubService.checkPalOwnership(palsHubPal.id);
        if (!ownership.owned) {
          throw new Error('You must own this Pal to download it');
        }
      }

      // Convert PalsHub pal to local format
      const pal = await this.createLocalPalFromPalsHub(palsHubPal);
      let relativeThumbnailPath: string | null = null;

      // Download thumbnail image if available
      if (palsHubPal.thumbnail_url) {
        try {
          console.log('Downloading thumbnail for pal:', pal.name);
          relativeThumbnailPath = await downloadPalThumbnail(
            pal.id,
            palsHubPal.thumbnail_url,
          );

          // Update the pal with the relative path (no file:// protocol)
          pal.thumbnail_url = relativeThumbnailPath;
          console.log(
            'Thumbnail downloaded successfully:',
            relativeThumbnailPath,
          );
        } catch (imageError) {
          console.warn(
            'Failed to download thumbnail, keeping remote URL:',
            imageError,
          );
          // Keep the original remote URL as fallback
          pal.thumbnail_url = palsHubPal.thumbnail_url;
        }
      }

      try {
        // Persist the pal to the database and add to store
        return await this.addPal(pal);
      } catch (dbError) {
        // If database save fails, clean up the downloaded image
        if (relativeThumbnailPath) {
          try {
            await deletePalThumbnail(relativeThumbnailPath);
            console.log(
              'Cleaned up thumbnail after database error:',
              relativeThumbnailPath,
            );
          } catch (cleanupError) {
            console.warn(
              'Failed to cleanup thumbnail after database error:',
              cleanupError,
            );
          }
        }
        throw dbError;
      }
    } catch (error) {
      throw error;
    }
  };

  /**
   * Creates a Model object from PalsHub ModelReference with complete HF metadata
   */
  private createLocalModelFromPHModel = async (
    modelRef: ModelReference,
  ): Promise<Model> => {
    try {
      // Fetch complete model information from HF API
      const [modelInfo, fileDetails] = await Promise.all([
        fetchModelInfo({
          repoId: modelRef.repo_id,
          full: true,
        }).catch((error: any) => {
          console.warn('Failed to fetch model info:', error);
          return null;
        }),
        fetchModelFilesDetails(modelRef.repo_id).catch((error: any) => {
          console.warn('Failed to fetch file details:', error);
          return [];
        }),
      ]);
      const siblings = createSiblingsFromFileDetails(
        modelRef.repo_id,
        fileDetails,
      );

      // Find the specific file details for our model
      const modelFileDetail = siblings.find(
        (file: any) => file.rfilename === modelRef.filename,
      );
      // Create ModelFile object
      const modelFile: ModelFile = {
        rfilename: modelFileDetail?.rfilename || modelRef.filename,
        size: modelFileDetail?.size || modelRef.size,
        url: modelFileDetail?.url || modelRef.downloadUrl,
        oid: modelFileDetail?.oid,
        lfs: modelFileDetail?.lfs,
      };

      // Use fetched model info or create fallback HuggingFaceModel object
      const hfModel: HuggingFaceModel = modelInfo
        ? {
            // Use fetched model info with fallbacks for required fields
            _id: modelInfo._id || modelRef.repo_id,
            id: modelInfo.id || modelRef.repo_id,
            author: modelInfo.author || modelRef.author,
            gated: modelInfo.gated || false,
            inference: modelInfo.inference || 'cold',
            lastModified: modelInfo.lastModified || new Date().toISOString(),
            likes: modelInfo.likes || 0,
            trendingScore: modelInfo.trendingScore || 0,
            private: modelInfo.private || false,
            sha: modelInfo.sha || '',
            downloads: modelInfo.downloads || 0,
            tags: modelInfo.tags || [],
            library_name: modelInfo.library_name || '',
            createdAt: modelInfo.createdAt || new Date().toISOString(),
            model_id: modelInfo.model_id || modelRef.repo_id,
            url: modelInfo.url || `${HF_DOMAIN}/${modelRef.repo_id}`,
            specs: modelInfo.specs,
            siblings: siblings,
          }
        : {
            // Fallback when modelInfo is null
            _id: modelRef.repo_id,
            id: modelRef.repo_id,
            author: modelRef.author,
            gated: false,
            inference: 'cold',
            lastModified: new Date().toISOString(),
            likes: 0,
            trendingScore: 0,
            private: false,
            sha: '',
            downloads: 0,
            tags: [],
            library_name: '',
            createdAt: new Date().toISOString(),
            model_id: modelRef.repo_id,
            url: `${HF_DOMAIN}/${modelRef.repo_id}`,
            specs: undefined,
            siblings: siblings,
          };

      // Use the existing hfAsModel function to create a complete Model object
      return hfAsModel(hfModel, modelFile);
    } catch (error) {
      console.error('Failed to fetch complete model data from HF API:', error);

      // Fallback: create basic model with available data
      return this.createBasicModelFromReference(modelRef);
    }
  };

  /**
   * Creates a basic Model object from ModelReference (fallback when HF API fails)
   */
  private createBasicModelFromReference = (modelRef: any): Model => {
    // Use default model as template for settings
    const defaultModel = defaultModels[0];

    // Extract model name from filename (remove .gguf extension)
    const modelName = modelRef.filename.replace(/\.gguf$/i, '');

    return {
      id: `${modelRef.repo_id}/${modelRef.filename}`,
      author: modelRef.author,
      name: modelName,
      size: modelRef.size,
      params: 0, // Will be fetched from HF API if needed
      isDownloaded: false,
      downloadUrl: modelRef.downloadUrl,
      hfUrl: `${HF_DOMAIN}/${modelRef.repo_id}`,
      progress: 0,
      filename: modelRef.filename,
      isLocal: false,
      origin: ModelOrigin.HF,
      defaultChatTemplate: {...defaultModel.defaultChatTemplate},
      chatTemplate: {...defaultModel.chatTemplate},
      defaultCompletionSettings: {...defaultModel.defaultCompletionSettings},
      completionSettings: {...defaultModel.completionSettings},
      defaultStopWords: [...(defaultModel.defaultStopWords || [])],
      stopWords: [...(defaultModel.stopWords || [])],
    };
  };

  /**
   * Converts a PalsHub pal to local pal format
   */
  private createLocalPalFromPalsHub = async (
    palsHubPal: PalsHubPal,
  ): Promise<Pal> => {
    let parameterSchema: ParameterDefinition[] = [];
    let parameters: Record<string, any> = {};
    let systemPrompt = palsHubPal.system_prompt || '';

    // Parse system_prompt to extract parameter schema and default values
    // Parameters are embedded within the system_prompt field using Mustache templating
    // with JSON schema comments
    let originalSystemPrompt: string | undefined;
    if (systemPrompt && this.isTemplatedSystemPrompt(systemPrompt)) {
      // Parse the templated system prompt
      const parsed = parsePalsHubTemplate(systemPrompt);
      // CRITICAL: Preserve the original template for future editing
      originalSystemPrompt = systemPrompt;
      // Use the clean template with placeholders for the systemPrompt field
      systemPrompt = parsed.cleanSystemPrompt;
      parameterSchema = parsed.parameterSchema;
      parameters = parsed.defaultParameters;
    }
    // If no template found, use empty schema/parameters (assistant-style pal)

    // Convert PalsHub model_reference to Model object if available
    const defaultModel = palsHubPal.model_reference
      ? await this.createLocalModelFromPHModel(palsHubPal.model_reference)
      : undefined;

    return {
      type: 'local',
      id: uuidv4(),
      name: palsHubPal.title,
      description: palsHubPal.description,
      thumbnail_url: palsHubPal.thumbnail_url,
      systemPrompt,
      originalSystemPrompt, // Preserve the original template for editing
      isSystemPromptChanged: false,
      useAIPrompt: false,
      defaultModel,
      parameters,
      parameterSchema,
      source: 'palshub',
      palshub_id: palsHubPal.id,
      creator_info: {
        id: palsHubPal.creator_id,
        name: palsHubPal.creator?.display_name,
        avatar_url: palsHubPal.creator?.avatar_url,
      },
      categories: palsHubPal.categories?.map((c: any) => c.name) || [],
      tags: palsHubPal.tags?.map((t: any) => t.name) || [],
      rating: palsHubPal.average_rating,
      review_count: palsHubPal.review_count,
      protection_level: palsHubPal.protection_level,
      price_cents: palsHubPal.price_cents,
      is_owned: true,
      rawPalshubGenerationSettings: palsHubPal.model_settings,
      created_at: palsHubPal.created_at,
      updated_at: palsHubPal.updated_at,
    };
  };

  /**
   * Checks if a system prompt contains parameter template definitions
   * Parameters are embedded within the system_prompt field using Mustache templating
   * with JSON schema comments
   */
  private isTemplatedSystemPrompt = (systemPrompt: string): boolean => {
    // Check for Mustache JSON schema pattern
    const mustacheSchemaPattern =
      /\{\{!\s*json-schema-start\s*[\s\S]*?\s*json-schema-end\s*\}\}/;

    return mustacheSchemaPattern.test(systemPrompt);
  };

  // PalsHub methods
  searchPalsHubPals = async (filters: any = {}) => {
    try {
      runInAction(() => {
        this.isLoadingPalsHub = true;
        this.syncState = {status: 'syncing'};
      });

      const response = await palsHubService.getPals(filters);

      runInAction(() => {
        this.cachedPalsHubPals = response.pals;
        this.isLoadingPalsHub = false;
        this.syncState = {status: 'success'};
      });

      return response;
    } catch (error) {
      console.warn(
        'PalsHub search failed (this is expected if not configured):',
        error,
      );
      runInAction(() => {
        this.cachedPalsHubPals = []; // Set empty array instead of failing
        this.isLoadingPalsHub = false;
        this.syncState = {status: 'success'}; // Don't show error state for missing config
      });

      // Return empty response instead of throwing
      return {
        pals: [],
        total_count: 0,
        page: 1,
        limit: filters.limit || 20,
        has_more: false,
      };
    }
  };

  loadUserLibrary = async () => {
    try {
      runInAction(() => {
        this.isLoadingPalsHub = true;
        this.syncState = {status: 'syncing'};
      });

      const response = await palsHubService.getLibrary();

      runInAction(() => {
        this.userLibrary = response.pals;
        this.isLoadingPalsHub = false;
        this.syncState = {status: 'success'};
      });

      return response;
    } catch (error) {
      console.warn(
        'User library load failed (this is expected if not configured):',
        error,
      );
      runInAction(() => {
        this.userLibrary = []; // Set empty array instead of failing
        this.isLoadingPalsHub = false;
        this.syncState = {status: 'success'}; // Don't show error state for missing config
      });

      // Return empty response instead of throwing
      return {
        pals: [],
        total_count: 0,
        page: 1,
        limit: 20,
        has_more: false,
      };
    }
  };

  loadUserCreatedPals = async () => {
    try {
      runInAction(() => {
        this.isLoadingPalsHub = true;
        this.syncState = {status: 'syncing'};
      });

      const response = await palsHubService.getMyPals();

      runInAction(() => {
        this.userCreatedPals = response.pals;
        this.isLoadingPalsHub = false;
        this.syncState = {status: 'success'};
      });

      return response;
    } catch (error) {
      console.warn(
        'User created pals load failed (this is expected if not configured):',
        error,
      );
      runInAction(() => {
        this.userCreatedPals = []; // Set empty array instead of failing
        this.isLoadingPalsHub = false;
        this.syncState = {status: 'success'}; // Don't show error state for missing config
      });

      // Return empty response instead of throwing
      return {
        pals: [],
        total_count: 0,
        page: 1,
        limit: 20,
        has_more: false,
      };
    }
  };

  getLocalPals = () => {
    return this.pals.filter(pal => pal.source === 'local' || !pal.source);
  };

  getDownloadedPalsHubPals = () => {
    return this.pals.filter(pal => pal.source === 'palshub');
  };

  // Capability-based filtering methods
  getVideoPals = () => {
    return this.pals.filter(pal => pal.capabilities?.video === true);
  };

  getAllPals = () => {
    return this.pals;
  };

  isPalsHubPalDownloaded = (palsHubId: string) => {
    return this.pals.some(pal => pal.palshub_id === palsHubId);
  };

  // Additional helper methods for PalsHub integration

  /**
   * Get categories from PalsHub
   */
  getCategories = async () => {
    try {
      return await palsHubService.getCategories();
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      throw error;
    }
  };

  /**
   * Get tags from PalsHub
   */
  getTags = async (query?: any) => {
    try {
      return await palsHubService.getTags(query);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
      throw error;
    }
  };

  /**
   * Get a specific pal from PalsHub
   */
  getPalsHubPal = async (id: string) => {
    try {
      return await palsHubService.getPal(id);
    } catch (error) {
      console.error('Failed to fetch pal:', error);
      throw error;
    }
  };

  /**
   * Check if user owns a specific pal
   */
  checkPalOwnership = async (palId: string) => {
    try {
      return await palsHubService.checkPalOwnership(palId);
    } catch (error) {
      console.error('Failed to check pal ownership:', error);
      throw error;
    }
  };

  /**
   * Initialize the default "Lookie" VideoPal if it doesn't exist
   */
  private async initializeLookiePal(): Promise<void> {
    try {
      // Check if Lookie already exists
      const lookiePal = this.pals.find(
        p => p.capabilities?.video === true && p.name === 'Lookie',
      );

      if (!lookiePal) {
        console.log('Creating default Lookie pal...');

        // Find the default SmolVLM model directly from defaultModels
        // This avoids timing issues with ModelStore initialization
        const defaultModelId =
          'ggml-org/SmolVLM-500M-Instruct-GGUF/SmolVLM-500M-Instruct-Q8_0.gguf';
        const defaultModel = defaultModels.find(
          model => model.id === defaultModelId,
        );

        // Create the Lookie pal with all the original properties
        const palData: Omit<Pal, 'id' | 'created_at' | 'updated_at'> = {
          type: 'local',
          name: 'Lookie',
          description:
            'Real-time video analysis assistant that provides concise descriptions of your camera feed.',
          systemPrompt:
            'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          defaultModel: defaultModel, // Set the default model so users know what to download
          parameters: {
            captureInterval: '3000', // 3 seconds (original value) - stored as string for text input
          },
          parameterSchema: [
            {
              key: 'captureInterval',
              type: 'text',
              label: 'Capture Interval (ms)',
              required: false,
            },
          ],
          capabilities: {video: true},
          color: ['#9E204F', '#F6E1EA'], // Original Lookie colors
          source: 'local',
        };

        await this.addPal(palData);
      } else {
        console.log('Lookie pal already exists, skipping creation');
      }
    } catch (error) {
      console.error('Error initializing Lookie pal:', error);
    }
  }
}

export const palStore = new PalStore();

// Export types for external use
export type {Pal} from '../types/pal';
export type {LegacyPalData} from '../utils/pal-migration';
