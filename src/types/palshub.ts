// PalsHub data types and interfaces

export interface PalsHubProfile {
  id: string;
  email?: string;
  full_name?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  provider_user_id?: string;
  provider_profile_url?: string;
  provider: string;
  created_at: string;
  updated_at: string;
}

export interface PalsHubCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
  created_at: string;
}

export interface PalsHubTag {
  id: string;
  name: string;
  usage_count: number;
  created_at: string;
}

export interface PalsHubReview {
  id: string;
  pal_id: string;
  user_id: string;
  rating: number; // 1-5
  comment?: string;
  created_at: string;
  updated_at: string;

  // Joined data
  user?: PalsHubProfile;
  reply?: PalsHubReviewReply;
}

export interface PalsHubReviewReply {
  id: string;
  review_id: string;
  creator_id: string;
  reply_text: string;
  created_at: string;
  updated_at: string;
}

export interface ModelReference {
  repo_id: string; // e.g., "MaziyarPanahi/gemma-3-1b-it-GGUF"
  filename: string; // e.g., "gemma-3-1b-it.Q8_0.gguf"
  author: string; // e.g., "MaziyarPanahi"
  downloadUrl: string; // Full download URL
  size: number; // Model storage size in bytes
}

/**
 * PalsHub Pal - A pal from the PalsHub marketplace
 *
 * This represents a pal that exists on PalsHub (remote) but has NOT been
 * downloaded to the device yet. These are shown in the marketplace/discovery
 * sections and can be downloaded to become local Pals.
 *
 * Key differences from local Pal:
 * - Uses 'title' instead of 'name'
 * - Uses 'system_prompt' instead of 'systemPrompt'
 * - May have restricted content based on protection_level and ownership
 * - Cannot be used directly - must be downloaded first
 *
 * Use the type discriminator `type: 'palshub'` to distinguish from Pal.
 * Use type guards from `src/utils/pal-type-guards.ts` for type-safe checks:
 * - isLocalPal(pal) - returns true if pal is a local Pal
 * - isPalsHubPal(pal) - returns true if pal is a PalsHubPal
 */
export interface PalsHubPal {
  // ============================================================================
  // TYPE DISCRIMINATOR - Use this to distinguish between Pal and PalsHubPal
  // ============================================================================
  /** Type discriminator - Always 'palshub' for remote PalsHub pals */
  type: 'palshub';

  // ============================================================================
  // CORE IDENTIFICATION
  // ============================================================================
  /** Unique identifier from PalsHub database */
  id: string;
  /** User ID of the creator on PalsHub */
  creator_id: string;
  /** Display name of the pal (NOTE: called 'title' not 'name') */
  title: string;
  /** Optional description shown in marketplace */
  description?: string;
  /** Optional thumbnail image URL from PalsHub */
  thumbnail_url?: string;

  // ============================================================================
  // AI CONFIGURATION
  // ============================================================================
  /**
   * System prompt template (NOTE: called 'system_prompt' not 'systemPrompt')
   * Only available for:
   * - Public pals (protection_level === 'public')
   * - Owned pals (is_owned === true)
   * Will be undefined for premium pals that aren't owned
   */
  system_prompt?: string;

  // ============================================================================
  // MODEL SETTINGS
  // ============================================================================
  /** Reference to recommended model on Hugging Face */
  model_reference?: ModelReference;

  /** LLM generation settings (temperature, top_p, top_k, etc.) */
  model_settings?: Record<string, unknown>;

  // ============================================================================
  // ACCESS CONTROL
  // ============================================================================
  /**
   * Protection level determines content visibility:
   * - 'public': All content visible to everyone
   * - 'reveal_on_purchase': System prompt hidden until purchased
   * - 'private': Not visible in marketplace (shouldn't normally appear)
   */
  protection_level: 'public' | 'reveal_on_purchase' | 'private';

  /**
   * Price in cents (0 for free pals)
   * Free pals can be downloaded immediately
   * Premium pals require purchase first
   */
  price_cents: number;

  /** Whether users can fork/copy this pal. This is not used yet. */
  allow_fork: boolean;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================
  /** When this pal was created on PalsHub */
  created_at: string;
  /** When this pal was last updated on PalsHub */
  updated_at: string;

  // ============================================================================
  // Metadata
  // ============================================================================
  /** Creator profile information */
  creator?: PalsHubProfile;
  /** Categories this pal belongs to */
  categories?: PalsHubCategory[];
  /** Tags associated with this pal */
  tags?: PalsHubTag[];
  /** Average rating from user reviews */
  average_rating?: number;
  /** Total number of reviews */
  review_count?: number;
  /** Whether the current user owns this pal (for premium pals) */
  is_owned?: boolean;
}

export interface PalsHubUserPal {
  id: string;
  user_id: string;
  pal_id: string;
  purchased_at: string;
  purchase_id?: string;
  created_at: string;

  // Joined data
  pal?: PalsHubPal;
}

// API Query interfaces
export interface PalsQuery {
  query?: string; // Text search
  category_ids?: string[]; // Filter by categories
  tag_names?: string[]; // Filter by tags
  protection_level?: 'public' | 'reveal_on_purchase' | 'private';
  price_min?: number; // Minimum price in cents
  price_max?: number; // Maximum price in cents
  sort_by?:
    | 'newest'
    | 'oldest'
    | 'rating'
    | 'popular'
    | 'price_low'
    | 'price_high';
  page?: number; // Page number (default: 1)
  limit?: number; // Items per page (default: 20, max: 50)
}

export interface LibraryQuery {
  page?: number;
  limit?: number;
  filter?: 'all' | 'free' | 'purchased';
  sort_by?: 'newest' | 'oldest' | 'title' | 'price';
}

export interface TagsQuery {
  limit?: number; // Default: 50, Max: 100
  query?: string; // Search tags by name
}

// API Response interfaces
export interface PalsResponse {
  pals: PalsHubPal[];
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface LibraryResponse {
  pals: PalsHubPal[]; // Processed pals, not raw user_pals
  total_count: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface CategoriesResponse {
  categories: PalsHubCategory[];
}

export interface TagsResponse {
  tags: PalsHubTag[];
}

// Request interfaces
export interface CreatePalRequest {
  title: string; // 3-100 characters
  description?: string; // Max 1000 characters
  system_prompt: string; // Required
  model_reference?: ModelReference;
  model_settings: Record<string, unknown>;
  protection_level: 'public' | 'reveal_on_purchase' | 'private';
  price_cents: number; // >= 0
  allow_fork: boolean;
  category_ids?: string[];
  tag_names?: string[];
  thumbnail_url?: string;
}

export interface CreateReviewRequest {
  pal_id: string;
  rating: number; // 1-5
  comment?: string; // Max 2000 characters
}

export interface CreatePurchaseRequest {
  pal_id: string;
}

export interface PurchaseResponse {
  checkout_url: string; // Stripe checkout URL
  purchase_id: string;
}

// Error response interface
export interface PalsHubErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

// Sync status types
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

export interface SyncState {
  status: SyncStatus;
  lastSync?: number;
  error?: string;
}

// Search filters for UI
export interface SearchFilters {
  query?: string;
  categories?: string[];
  tags?: string[];
  priceRange?: [number, number];
  protectionLevel?: 'public' | 'reveal_on_purchase' | 'private';
  sortBy?:
    | 'newest'
    | 'oldest'
    | 'rating'
    | 'popular'
    | 'price_low'
    | 'price_high';
  limit?: number; // Items per page (default: 20, max: 50)
}

// Local cache metadata
export interface CacheMetadata {
  lastUpdated: number;
  version: string;
  expiresAt?: number;
}

// Download status for owned Pals
export interface DownloadStatus {
  isDownloaded: boolean;
  downloadPath?: string;
  downloadedAt?: number;
  fileSize?: number;
}

// Enhanced local Pal type that combines local and PalsHub data
export interface EnhancedPalData {
  // PalsHub integration fields
  palshub_id?: string; // Link to PalsHub pal
  source: 'local' | 'palshub'; // Origin of the pal
  generation_settings?: Record<string, unknown>; // Model parameters

  // PalsHub metadata (for synced pals)
  creator_info?: {
    id: string;
    name?: string;
    avatar_url?: string;
  };
  categories?: string[];
  tags?: string[];
  rating?: number;
  review_count?: number;
  protection_level?: 'public' | 'reveal_on_purchase' | 'private';
  price_cents?: number;
  is_owned?: boolean;

  // Download and sync status
  download_status?: DownloadStatus;
  sync_status?: SyncState;
  cache_metadata?: CacheMetadata;
}

// API Configuration
export interface ApiConfig {
  baseUrl: string;
  timeout?: number;
}

// API Error types
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
  status?: number;
}
