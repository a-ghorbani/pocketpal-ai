import {Model} from '../../utils/types';

// Form data structure for the pal sheet
export interface PalFormData {
  name: string;
  description?: string;
  defaultModel?: Model;
  useAIPrompt: boolean;
  systemPrompt: string;
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  color?: [string, string];
  promptGenerationModel?: Model;
  generatingPrompt?: string;
  completionSettings?: Record<string, any>;
  // Dynamic parameters will be added based on schema
  [key: string]: any;
}
