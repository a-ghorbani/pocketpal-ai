import {v4 as uuidv4} from 'uuid';
import type {Pal, LegacyPalType} from '../types/pal';
import {createCapabilitiesFromLegacyType} from './pal-capabilities';
import {ROLEPLAY_SCHEMA, ASSISTANT_SCHEMA, VIDEO_SCHEMA} from '../types/pal';
import {Model} from './types';

// Migration-specific types (moved from PalsSheets/types.ts)
export enum PalType {
  ROLEPLAY = 'roleplay',
  ASSISTANT = 'assistant',
  VIDEO = 'video',
}

// Base type for common fields
interface BaseFormData {
  id?: string;
  name: string;
  defaultModel?: Model;
  useAIPrompt: boolean;
  systemPrompt: string;
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  color?: [string, string];
  promptGenerationModel?: Model;
  generatingPrompt?: string;
}

// Assistant-specific type
export interface AssistantFormData extends BaseFormData {
  palType: PalType.ASSISTANT;
}

// Roleplay-specific type
export interface RoleplayFormData extends BaseFormData {
  palType: PalType.ROLEPLAY;
  world: string;
  location: string;
  aiRole: string;
  userRole: string;
  situation: string;
  toneStyle: string;
}

// Video-specific type
export interface VideoPalFormData extends BaseFormData {
  palType: PalType.VIDEO;
  captureInterval: number; // Interval in milliseconds between frame captures
}

// Type for legacy pal data
export type LegacyPalData =
  | AssistantFormData
  | RoleplayFormData
  | VideoPalFormData;

/**
 * Migrates a legacy pal to the new format
 */
export function migrateLegacyPalToNew(legacyPal: LegacyPalData): Pal {
  const basePal: Omit<Pal, 'parameters' | 'parameterSchema'> = {
    type: 'local',
    id: legacyPal.id || uuidv4(),
    name: legacyPal.name,
    systemPrompt: legacyPal.systemPrompt,
    originalSystemPrompt: legacyPal.originalSystemPrompt,
    isSystemPromptChanged: legacyPal.isSystemPromptChanged,
    useAIPrompt: legacyPal.useAIPrompt,
    defaultModel: legacyPal.defaultModel,
    promptGenerationModel: legacyPal.promptGenerationModel,
    generatingPrompt: legacyPal.generatingPrompt,
    color: legacyPal.color,
    capabilities: createCapabilitiesFromLegacyType(legacyPal.palType),
    source: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  switch (legacyPal.palType) {
    case 'roleplay':
      return {
        ...basePal,
        parameters: {
          world: legacyPal.world,
          location: legacyPal.location,
          aiRole: legacyPal.aiRole,
          userRole: legacyPal.userRole,
          situation: legacyPal.situation,
          toneStyle: legacyPal.toneStyle,
        },
        parameterSchema: ROLEPLAY_SCHEMA,
      };

    case 'assistant':
      return {
        ...basePal,
        parameters: {},
        parameterSchema: ASSISTANT_SCHEMA,
      };

    case 'video':
      return {
        ...basePal,
        parameters: {
          captureInterval: legacyPal.captureInterval?.toString() || '3000',
        },
        parameterSchema: VIDEO_SCHEMA,
      };

    default:
      // Fallback for unknown types
      return {
        ...basePal,
        parameters: {},
        parameterSchema: [],
      };
  }
}

/**
 * Detects the legacy pal type from a pal using capabilities and schema
 * Clean detection without parameter inference
 */
export function detectLegacyPalType(pal: Pal): LegacyPalType {
  // First check capabilities (most reliable)
  if (pal.capabilities?.video === true) {
    return 'video';
  }

  // Then check if schema matches known legacy schemas
  if (schemasEqual(pal.parameterSchema, ROLEPLAY_SCHEMA)) {
    return 'roleplay';
  }
  if (schemasEqual(pal.parameterSchema, VIDEO_SCHEMA)) {
    return 'video';
  }
  if (schemasEqual(pal.parameterSchema, ASSISTANT_SCHEMA)) {
    return 'assistant';
  }

  // Check categories if available
  if (pal.categories?.some(cat => cat.toLowerCase().includes('roleplay'))) {
    return 'roleplay';
  }
  if (pal.categories?.some(cat => cat.toLowerCase().includes('video'))) {
    return 'video';
  }

  // Default to assistant
  return 'assistant';
}

/**
 * Get legacy pal type for UI components (backward compatibility)
 * This is only used for determining which UI template to show
 */
export function getLegacyPalTypeForUI(pal: Pal): LegacyPalType {
  return detectLegacyPalType(pal);
}

/**
 * Helper function to compare parameter schemas
 */
function schemasEqual(schema1: any[], schema2: any[]): boolean {
  if (schema1.length !== schema2.length) {
    return false;
  }

  return schema1.every((param1, index) => {
    const param2 = schema2[index];
    return param1.key === param2.key && param1.type === param2.type;
  });
}
