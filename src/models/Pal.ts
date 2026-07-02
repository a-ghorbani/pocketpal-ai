/**
 * Pal Model
 *
 * Represents a Pal (AI personality/assistant configuration).
 * Users can create custom Pals with specific system prompts and model configs.
 *
 * @phase Phase 1 - Data Model
 */

/**
 * ModelConfig - Configuration for the AI model
 */
export interface ModelConfig {
  /**
   * Model identifier
   */
  modelId: string;

  /**
   * Temperature for response generation (0-1)
   */
  temperature: number;

  /**
   * Max tokens per response
   */
  maxTokens: number;

  /**
   * Top-p sampling parameter
   */
  topP?: number;

  /**
   * Frequency penalty
   */
  frequencyPenalty?: number;

  /**
   * Presence penalty
   */
  presencePenalty?: number;
}

/**
 * Pal - An AI personality/assistant configuration
 *
 * Properties:
 * - id: Unique identifier
 * - name: Display name
 * - systemPrompt: System message for the AI
 * - modelConfig: Model configuration
 * - updatedAt: Last update timestamp
 * - _dirty: Local-only flag for sync tracking
 */
export interface Pal {
  /**
   * Unique Pal identifier
   * Format: 'pal_${timestamp}_${random}'
   */
  id: string;

  /**
   * Display name for the Pal
   */
  name: string;

  /**
   * Avatar emoji or image URI
   */
  avatar?: string;

  /**
   * System prompt (instructions for the AI)
   */
  systemPrompt: string;

  /**
   * Model configuration
   */
  modelConfig: ModelConfig;

  /**
   * Whether this is a default Pal (cannot be deleted)
   */
  isDefault: boolean;

  /**
   * Last update timestamp (Unix milliseconds)
   * Used for sync conflict resolution
   */
  updatedAt: number;

  /**
   * Sync dirty flag (local only)
   * If true, this Pal needs to be synced to remote
   */
  _dirty?: boolean;

  /**
   * Tags for categorizing Pals
   */
  tags?: string[];

  /**
   * Number of times this Pal has been used
   */
  usageCount?: number;
}

/**
 * Create a new Pal with defaults
 * @param name - Pal name
 * @param systemPrompt - System prompt
 * @param id - Optional ID (auto-generated if not provided)
 * @returns Pal - New Pal object
 */
export function createPal(name: string, systemPrompt: string = '', id?: string): Pal {
  const palId = id || `pal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: palId,
    name,
    systemPrompt: systemPrompt || `You are ${name}, a helpful AI assistant.`,
    avatar: '🤖',
    modelConfig: {
      modelId: 'default',
      temperature: 0.7,
      maxTokens: 2048,
    },
    isDefault: false,
    updatedAt: Date.now(),
    _dirty: true,
    tags: [],
    usageCount: 0,
  };
}

/**
 * Mark a Pal as dirty (needs sync)
 * @param pal - Pal to mark
 * @returns Pal - Updated Pal
 */
export function markPalDirty(pal: Pal): Pal {
  return {
    ...pal,
    _dirty: true,
  };
}

/**
 * Mark a Pal as clean (sync complete)
 * @param pal - Pal to mark
 * @returns Pal - Updated Pal
 */
export function markPalClean(pal: Pal): Pal {
  return {
    ...pal,
    _dirty: false,
  };
}

/**
 * Increment Pal usage count
 * @param pal - Pal to update
 * @returns Pal - Updated Pal
 */
export function incrementPalUsage(pal: Pal): Pal {
  return {
    ...pal,
    usageCount: (pal.usageCount || 0) + 1,
    updatedAt: Date.now(),
    _dirty: true,
  };
}

/**
 * Default Pals - Pre-configured assistants
 */
export const DEFAULT_PALS: Pal[] = [
  createPal(
    'General Assistant',
    'You are a helpful, harmless, and honest AI assistant. Provide clear, accurate, and concise responses.',
  ),
  createPal(
    'Code Helper',
    'You are an expert programmer. Help with coding questions, debug issues, and provide best practices. Include code examples when helpful.',
  ),
  createPal(
    'Creative Writer',
    'You are a creative writing assistant. Help with storytelling, brainstorming, editing, and generating creative content.',
  ),
];
