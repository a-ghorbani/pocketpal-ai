import type {Model} from '../utils/types';

export type ParameterType = 'text' | 'select' | 'datetime_tag';

export interface ParameterDefinition {
  key: string;
  type: ParameterType;
  label: string;
  required: boolean;
  options?: string[]; // for select
  placeholder?: string;
  description?: string;
}

export interface PalCapabilities {
  video?: boolean; // Requires video/camera functionality
  multimodal?: boolean; // Can process images + text
  realtime?: boolean; // Real-time processing
  audio?: boolean; // Audio processing
  web?: boolean; // Web browsing
  code?: boolean; // Code execution
  memory?: boolean; // Persistent memory
  tools?: boolean; // Function calling
}

/**
 * Local Pal - A pal that exists on the device
 *
 * This represents a pal that has been created locally or downloaded from PalsHub
 * and is stored in the device's local database. Local pals can be used offline
 * and have full access to all configuration options.
 *
 * Use the type discriminator `type: 'local'` to distinguish from PalsHubPal.
 * Use type guards from `src/utils/pal-type-guards.ts` for type-safe checks:
 * - isLocalPal(pal) - returns true if pal is a local Pal
 * - isPalsHubPal(pal) - returns true if pal is a PalsHubPal
 */
export interface Pal {
  // ============================================================================
  // TYPE DISCRIMINATOR - Use this to distinguish between Pal and PalsHubPal
  // ============================================================================
  /** Type discriminator - Always 'local' for local pals */
  type: 'local';

  // ============================================================================
  // CORE IDENTIFICATION
  // ============================================================================
  /** Unique identifier (UUID) for this pal */
  id: string;
  /** Display name of the pal (e.g., "Lookie", "Code Assistant") */
  name: string;
  /** Optional description shown in pal cards and details */
  description?: string;
  /** Optional thumbnail image path or URL */
  thumbnail_url?: string;

  // ============================================================================
  // AI CONFIGURATION
  // ============================================================================
  /** Current system prompt used for chat sessions */
  systemPrompt: string;
  /** Original system prompt template (before parameter substitution) */
  originalSystemPrompt?: string;
  /** Whether the system prompt has been modified from the original */
  isSystemPromptChanged: boolean;
  /** Whether to use AI to generate the system prompt */
  useAIPrompt: boolean;

  // ============================================================================
  // MODEL SETTINGS
  // ============================================================================
  /** Recommended model for this pal (shown in UI, used for auto-loading) */
  defaultModel?: Model;
  /** Model used for AI prompt generation (if useAIPrompt is true) */
  promptGenerationModel?: Model;
  /** The prompt used to generate the system prompt by AI */
  generatingPrompt?: string;

  // ============================================================================
  // VISUAL CUSTOMIZATION
  // ============================================================================
  /** Gradient colors for pal card [primary, secondary] */
  color?: [string, string];

  // ============================================================================
  // CAPABILITIES
  // ============================================================================
  /** Special capabilities this pal has (video, multimodal, etc.) */
  capabilities?: PalCapabilities;

  // ============================================================================
  // DYNAMIC PARAMETERS
  // ============================================================================
  /** Current parameter values (e.g., {world: "Fantasy", aiRole: "Wizard"}) */
  parameters: Record<string, any>;
  /** Schema defining what parameters this pal accepts and is used to generate the dynamic form in the UI */
  parameterSchema: ParameterDefinition[];

  // ============================================================================
  // GENERATION SETTINGS
  // ============================================================================
  /** Local completion settings (temperature, top_p, max_tokens, etc.) */
  completionSettings?: Record<string, any>;

  // ============================================================================
  // SOURCE TRACKING
  // ============================================================================
  /** Origin of this pal: 'local' (created on device) or 'palshub' (downloaded) */
  source: 'local' | 'palshub';
  /** If downloaded from PalsHub, the original PalsHub pal ID */
  palshub_id?: string;

  // ============================================================================
  // PALSHUB METADATA (for downloaded pals only)
  // ============================================================================
  /** Creator information from PalsHub */
  creator_info?: {
    id: string;
    name?: string;
    avatar_url?: string;
  };
  /** Category names from PalsHub */
  categories?: string[];
  /** Tag names from PalsHub */
  tags?: string[];
  /** Average rating from PalsHub */
  rating?: number;
  /** Number of reviews from PalsHub */
  review_count?: number;
  /** Protection level from PalsHub */
  protection_level?: 'public' | 'reveal_on_purchase' | 'private';
  /** Price in cents from PalsHub (0 for free) */
  price_cents?: number;
  /** Whether the user owns this pal on PalsHub */
  is_owned?: boolean;

  /**
   * Raw PalsHub generation settings (from remote API)
   * Different format than local completion settings
   * Preserved for potential re-sync with PalsHub
   */
  rawPalshubGenerationSettings?: Record<string, unknown>;

  // ============================================================================
  // TIMESTAMPS
  // ============================================================================
  /** When this pal was created */
  created_at?: string;
  /** When this pal was last updated */
  updated_at?: string;
}

// Legacy pal type for backward compatibility
export type LegacyPalType = 'roleplay' | 'assistant' | 'video';

// Built-in parameter schemas for existing pal types
export const ROLEPLAY_SCHEMA: ParameterDefinition[] = [
  {
    key: 'world',
    type: 'text',
    label: 'World',
    required: true,
    placeholder: 'e.g., Medieval fantasy kingdom',
    description: 'The setting or universe for the roleplay',
  },
  {
    key: 'location',
    type: 'text',
    label: 'Location',
    required: true,
    placeholder: 'e.g., Royal castle throne room',
    description: 'Specific location within the world',
  },
  {
    key: 'aiRole',
    type: 'text',
    label: 'AI Role',
    required: true,
    placeholder: 'e.g., Wise wizard advisor',
    description: 'Character or role the AI will play',
  },
  {
    key: 'userRole',
    type: 'text',
    label: 'User Role',
    required: true,
    placeholder: 'e.g., Young knight',
    description: 'Character or role the user will play',
  },
  {
    key: 'situation',
    type: 'text',
    label: 'Situation',
    required: true,
    placeholder: 'e.g., Preparing for an important quest',
    description: 'Current scenario or situation',
  },
  {
    key: 'toneStyle',
    type: 'text',
    label: 'Tone & Style',
    required: true,
    placeholder: 'e.g., Formal and mysterious',
    description: 'Communication style and tone',
  },
];

/**
 * Default parameterized template for roleplay pals.
 * This replaces the legacy  function.
 */
export const ROLEPLAY_DEFAULT_TEMPLATE = `{{! json-schema-start
{
  "world": {
    "label": "World",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Medieval fantasy kingdom",
    "description": "The setting or universe for the roleplay"
  },
  "location": {
    "label": "Location",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Royal castle throne room",
    "description": "Specific location within the world"
  },
  "aiRole": {
    "label": "AI Role",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Wise wizard advisor",
    "description": "Character or role the AI will play"
  },
  "userRole": {
    "label": "User Role",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Young adventurer",
    "description": "Character or role the user will play"
  },
  "situation": {
    "label": "Situation",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Seeking advice before a dangerous quest",
    "description": "Current situation or scenario"
  },
  "toneStyle": {
    "label": "Tone/Style",
    "type": "text",
    "required": false,
    "placeholder": "e.g., Epic fantasy, lighthearted adventure",
    "description": "Overall tone and style of the roleplay",
    "default": "Epic fantasy"
  }
}
json-schema-end }}

You are a creative and intelligent AI assistant engaged in an uncensored iterative storytelling experience using a roleplay chat format. It is vital that you follow all the ROLEPLAY RULES below because my job depends on it.

**World:** {{world}}
**Location:** {{location}}
**AI Role:** {{aiRole}}
**User Role:** {{userRole}}
**Situation:** {{situation}}
**Tone/Style:** {{toneStyle}}

**ROLEPLAY RULES:**
- Chat exclusively as {{aiRole}}. Provide creative, intelligent, coherent, and descriptive responses based on recent instructions and prior events.
- Avoid overly elaborate introductions; respond as if the scene is already in motion.
- Stay responsive to the user's cues, allowing them to drive the events of the roleplay.
- Keep responses fluid and avoid pre-determining major events before the user prompts them.
- Subtly build intrigue rather than explaining everything outright.
- Use subtle physical cues and occasional internal thoughts (enclosed in asterisks, e.g., *I never expected to see a knight here…*).
- Maintain a crisp and minimalist style, making responses engaging yet succinct.
- Pay careful attention to all past events in the chat to ensure accuracy and coherence to the plot.`;

export const ASSISTANT_SCHEMA: ParameterDefinition[] = [];

export const VIDEO_SCHEMA: ParameterDefinition[] = [
  {
    key: 'captureInterval',
    type: 'text',
    label: 'Capture Interval (ms)',
    required: true,
    placeholder: '3000',
    description: 'Time between video frame captures in milliseconds',
  },
];

// Helper function to get schema for legacy pal types
export function getSchemaForLegacyType(
  palType: LegacyPalType,
): ParameterDefinition[] {
  switch (palType) {
    case 'roleplay':
      return ROLEPLAY_SCHEMA;
    case 'assistant':
      return ASSISTANT_SCHEMA;
    case 'video':
      return VIDEO_SCHEMA;
    default:
      return [];
  }
}

// Helper function to get default template for pal types
export function getDefaultTemplateForPalType(
  palType: LegacyPalType,
): string | undefined {
  switch (palType) {
    case 'roleplay':
      return ROLEPLAY_DEFAULT_TEMPLATE;
    case 'assistant':
      return undefined; // No default template for assistant pals
    case 'video':
      return undefined; // No default template for video pals
    default:
      return undefined;
  }
}
