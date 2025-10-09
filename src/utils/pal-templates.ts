import type {Pal} from '../types/pal';
import {
  ASSISTANT_SCHEMA,
  ROLEPLAY_SCHEMA,
  VIDEO_SCHEMA,
  ROLEPLAY_DEFAULT_TEMPLATE,
} from '../types/pal';

/**
 * Factory functions for creating new pal objects with appropriate defaults.
 * These functions provide pre-configured pal objects that can be passed to PalSheet
 * for both creation and editing scenarios.
 */

/**
 * Creates a new assistant pal object with default values.
 * Assistant pals have no custom parameters and use a simple system prompt.
 */
export const createNewAssistantPal = (): Partial<Pal> => ({
  type: 'local',
  name: '',
  description: '',
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {},
  parameterSchema: ASSISTANT_SCHEMA,
  source: 'local',
  capabilities: {},
});

/**
 * Creates a new roleplay pal object with default values.
 * Roleplay pals use a parameterized template system with predefined parameters.
 */
export const createNewRoleplayPal = (): Partial<Pal> => ({
  type: 'local',
  name: '',
  description: '',
  systemPrompt: ROLEPLAY_DEFAULT_TEMPLATE,
  originalSystemPrompt: ROLEPLAY_DEFAULT_TEMPLATE,
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    world: '',
    location: '',
    aiRole: '',
    userRole: '',
    situation: '',
    toneStyle: '',
  },
  parameterSchema: ROLEPLAY_SCHEMA,
  source: 'local',
  capabilities: {},
});

/**
 * Creates a new video pal object with default values.
 * Video pals have video capabilities and a configurable capture interval.
 */
export const createNewVideoPal = (): Partial<Pal> => ({
  type: 'local',
  name: '',
  description: '',
  systemPrompt:
    'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
  originalSystemPrompt:
    'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
  isSystemPromptChanged: false,
  useAIPrompt: false,
  parameters: {
    captureInterval: '3000', // Default 3 second interval
  },
  parameterSchema: VIDEO_SCHEMA,
  source: 'local',
  capabilities: {
    video: true,
  },
});

/**
 * Helper function to create a pal object for editing.
 * This ensures the pal object has all required fields for the form.
 */
export const preparePalForEditing = (pal: Pal): Partial<Pal> => {
  return {
    ...pal,
    // Ensure all required form fields are present
    description: pal.description || '',
    originalSystemPrompt: pal.originalSystemPrompt || pal.systemPrompt,
    parameters: pal.parameters || {},
    parameterSchema: pal.parameterSchema || [],
    capabilities: pal.capabilities || {},
  };
};
