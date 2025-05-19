import {z} from 'zod';
import {Model} from '../../utils/types';

export enum PalType {
  ROLEPLAY = 'roleplay',
  ASSISTANT = 'assistant',
  CAMERA = 'camera',
  VIDEO = 'video',
}

// We'll use this factory function to create schemas with the current localization
export function createSchemaWithL10n(l10n: any) {
  // Base schema with common fields
  const baseFormSchema = {
    name: z.string().min(1, l10n.validation.nameRequired),
    defaultModel: z.any().optional(),
    useAIPrompt: z.boolean(),
    systemPrompt: z.string().min(1, l10n.validation.systemPromptRequired),
    originalSystemPrompt: z.string().optional(),
    isSystemPromptChanged: z.boolean().default(false),
    color: z.tuple([z.string(), z.string()]).optional(),
    promptGenerationModel: z.any().optional(),
    generatingPrompt: z.string().optional(),
  };

  // Assistant-specific schema
  const assistantSchema = z.object({
    ...baseFormSchema,
    palType: z.literal(PalType.ASSISTANT),
  });

  // Roleplay-specific schema
  const roleplaySchema = z.object({
    ...baseFormSchema,
    palType: z.literal(PalType.ROLEPLAY),
    world: z.string().min(1, l10n.validation.worldRequired),
    location: z.string().min(1, l10n.validation.locationRequired),
    aiRole: z.string().min(1, l10n.validation.aiRoleRequired),
    userRole: z.string().min(1, l10n.validation.userRoleRequired),
    situation: z.string().min(1, l10n.validation.situationRequired),
    toneStyle: z.string().min(1, l10n.validation.toneStyleRequired),
  });

  // Camera-specific schema
  const cameraSchema = z.object({
    ...baseFormSchema,
    palType: z.literal(PalType.CAMERA),
    projectionModel: z.any().optional(),
  });

  // Video-specific schema
  const videoSchema = z.object({
    ...baseFormSchema,
    palType: z.literal(PalType.VIDEO),
    projectionModel: z.any().optional(),
    captureInterval: z.number().min(500).default(1000),
  });

  return {
    assistantSchema,
    roleplaySchema,
    cameraSchema,
    videoSchema,
  };
}

// Default schemas with fallback English messages
export const assistantFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  defaultModel: z.any().optional(),
  useAIPrompt: z.boolean(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  originalSystemPrompt: z.string().optional(),
  isSystemPromptChanged: z.boolean().default(false),
  color: z.tuple([z.string(), z.string()]).optional(),
  promptGenerationModel: z.any().optional(),
  generatingPrompt: z.string().optional(),
  palType: z.literal(PalType.ASSISTANT),
});

export const roleplayFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  defaultModel: z.any().optional(),
  useAIPrompt: z.boolean(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  originalSystemPrompt: z.string().optional(),
  isSystemPromptChanged: z.boolean().default(false),
  color: z.tuple([z.string(), z.string()]).optional(),
  promptGenerationModel: z.any().optional(),
  generatingPrompt: z.string().optional(),
  palType: z.literal(PalType.ROLEPLAY),
  world: z.string().min(1, 'World is required'),
  location: z.string().min(1, 'Location is required'),
  aiRole: z.string().min(1, "AI's role is required"),
  userRole: z.string().min(1, 'User role is required'),
  situation: z.string().min(1, 'Situation is required'),
  toneStyle: z.string().min(1, 'Tone/Style is required'),
});

export const cameraPalFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  defaultModel: z.any().optional(),
  useAIPrompt: z.boolean(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  originalSystemPrompt: z.string().optional(),
  isSystemPromptChanged: z.boolean().default(false),
  color: z.tuple([z.string(), z.string()]).optional(),
  promptGenerationModel: z.any().optional(),
  generatingPrompt: z.string().optional(),
  palType: z.literal(PalType.CAMERA),
  projectionModel: z.any().optional(),
});

export const videoPalFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  defaultModel: z.any().optional(),
  useAIPrompt: z.boolean(),
  systemPrompt: z.string().min(1, 'System prompt is required'),
  originalSystemPrompt: z.string().optional(),
  isSystemPromptChanged: z.boolean().default(false),
  color: z.tuple([z.string(), z.string()]).optional(),
  promptGenerationModel: z.any().optional(),
  generatingPrompt: z.string().optional(),
  palType: z.literal(PalType.VIDEO),
  projectionModel: z.any().optional(),
  captureInterval: z.number().min(500).default(1000),
});

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

// Camera-specific type
export interface CameraPalFormData extends BaseFormData {
  palType: PalType.CAMERA;
  projectionModel?: Model; // For vision models that require a projection model
}

// Video-specific type
export interface VideoPalFormData extends BaseFormData {
  palType: PalType.VIDEO;
  projectionModel?: Model; // For vision models that require a projection model
  captureInterval: number; // Interval in milliseconds between frame captures
}

// Union type for form data
export type PalFormData =
  | AssistantFormData
  | RoleplayFormData
  | CameraPalFormData
  | VideoPalFormData;
