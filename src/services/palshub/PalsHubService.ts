import {authService} from './AuthService';
import {palsHubApiService} from './PalsHubApiService';

import type {
  PalsQuery,
  LibraryQuery,
  TagsQuery,
  PalsResponse,
  LibraryResponse,
  CategoriesResponse,
  TagsResponse,
  PalsHubPal,
} from '../../types/palshub';

export class PalsHubError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'PalsHubError';
  }
}

class PalsHubService {
  constructor() {}

  // Browse and search Pals - Using REST API
  async getPals(query: PalsQuery = {}): Promise<PalsResponse> {
    return palsHubApiService.getPals(query);
  }

  // Get detailed Pal information - Using REST API
  async getPal(id: string): Promise<PalsHubPal> {
    return palsHubApiService.getPal(id);
  }

  // Get user's library - Using REST API
  async getLibrary(query: LibraryQuery = {}): Promise<LibraryResponse> {
    return palsHubApiService.getLibrary(query);
  }

  // Get user's created Pals - Using REST API
  async getMyPals(query: LibraryQuery = {}): Promise<PalsResponse> {
    return palsHubApiService.getMyPals(query);
  }

  // Advanced search
  async searchPals(query: PalsQuery): Promise<PalsResponse> {
    return this.getPals(query);
  }

  // Get all categories - Using REST API (extracted from pals data)
  async getCategories(): Promise<CategoriesResponse> {
    return palsHubApiService.getCategories();
  }

  // Get popular tags - Using REST API (extracted from pals data)
  async getTags(query: TagsQuery = {}): Promise<TagsResponse> {
    return palsHubApiService.getTags(query);
  }

  // Check if user owns a Pal - Using REST API
  async checkPalOwnership(
    palId: string,
  ): Promise<{owned: boolean; purchase_date?: string}> {
    try {
      if (!authService.user?.id) {
        return {owned: false};
      }

      // Get pal details which includes ownership information
      const pal = await this.getPal(palId);

      return {
        owned: pal.is_owned || false,
        purchase_date: undefined, // Purchase date not available in current API
      };
    } catch (error) {
      if (error instanceof PalsHubError) {
        throw error;
      }
      throw new PalsHubError(
        `Failed to check ownership: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}

export const palsHubService = new PalsHubService();
