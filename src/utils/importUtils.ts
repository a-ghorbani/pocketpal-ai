import * as RNFS from '@dr.pogodin/react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import {Platform} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';
import {MessageType} from './types';
import {CompletionParams} from './completionTypes';
import {migrateCompletionSettings} from './completionSettingsVersions';
import {palStore} from '../store';
import type {Pal, ParameterDefinition} from '../types/pal';

/**
 * Interface for imported chat session data
 */
export interface ImportedChatSession {
  id: string;
  title: string;
  date: string;
  messages: ImportedMessage[];
  completionSettings: CompletionParams;
  activePalId?: string;
}

/**
 * Interface for imported message data
 */
export interface ImportedMessage {
  id: string;
  author: string;
  text?: string;
  type: string;
  metadata?: Record<string, any>;
  createdAt?: number;
}

/**
 * Pick a JSON file using document picker
 */
export const pickJsonFile = async (): Promise<string | null> => {
  try {
    const res = await DocumentPicker.pick({
      type:
        Platform.OS === 'ios' ? 'public.json' : [DocumentPicker.types.allFiles],
    });

    if (res && res.length > 0) {
      const file = res[0];

      // Check if it's a JSON file
      if (
        !file.name?.toLowerCase().endsWith('.json') &&
        !file.type?.includes('json')
      ) {
        throw new Error('Selected file is not a JSON file');
      }

      return file.uri;
    }
    return null;
  } catch (err: any) {
    if (DocumentPicker.isCancel(err)) {
      // User cancelled the picker
      return null;
    }
    throw err;
  }
};

/**
 * Read and parse a JSON file
 */
export const readJsonFile = async (fileUri: string): Promise<any> => {
  try {
    const fileContent = await RNFS.readFile(fileUri, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error reading or parsing JSON file:', error);
    throw new Error('Failed to read or parse the selected file');
  }
};

/**
 * Validate imported chat session data
 */
export const validateImportedData = (
  data: any,
): ImportedChatSession | ImportedChatSession[] => {
  // Check if it's an array or a single object
  if (Array.isArray(data)) {
    // Validate each session in the array
    return data.map(session => validateSingleSession(session));
  } else {
    // Validate a single session
    return validateSingleSession(data);
  }
};

/**
 * Validate a single chat session
 */
const validateSingleSession = (session: any): ImportedChatSession => {
  // Check required fields
  if (!session.title || typeof session.title !== 'string') {
    throw new Error('Invalid session: missing or invalid title');
  }

  if (!session.date || typeof session.date !== 'string') {
    // If date is missing, create a new one
    session.date = new Date().toISOString();
  }

  if (!session.messages || !Array.isArray(session.messages)) {
    session.messages = [];
  }

  // Validate messages
  session.messages = session.messages.map((msg: any) => {
    if (!msg.id) {
      msg.id = uuidv4();
    }

    if (!msg.author) {
      throw new Error('Invalid message: missing author');
    }

    if (!msg.type) {
      msg.type = 'text';
    }

    if (!msg.createdAt) {
      msg.createdAt = Date.now();
    }

    return msg;
  });

  // Ensure completionSettings exists
  if (!session.completionSettings) {
    session.completionSettings = {};
  }

  // Migrate completion settings to latest version
  session.completionSettings = migrateCompletionSettings(
    session.completionSettings,
  );

  // Generate a new ID if not present or to avoid conflicts
  if (!session.id) {
    session.id = uuidv4();
  }

  return session as ImportedChatSession;
};

/**
 * Import chat sessions from a JSON file
 */
export const importChatSessions = async (): Promise<number> => {
  try {
    // Pick a JSON file
    const fileUri = await pickJsonFile();
    if (!fileUri) {
      return 0; // User cancelled
    }

    // Read and parse the file
    const data = await readJsonFile(fileUri);

    // Validate the data
    const validatedData = validateImportedData(data);

    // Import the sessions
    if (Array.isArray(validatedData)) {
      // Import multiple sessions
      let importedCount = 0;
      for (const session of validatedData) {
        await importSingleSession(session);
        importedCount++;
      }
      return importedCount;
    } else {
      // Import a single session
      await importSingleSession(validatedData);
      return 1;
    }
  } catch (error) {
    console.error('Error importing chat sessions:', error);
    throw error;
  }
};

/**
 * Import a single chat session
 */
const importSingleSession = async (
  session: ImportedChatSession,
): Promise<void> => {
  try {
    // Map messages to the correct format
    const messages = session.messages.map(
      msg =>
        ({
          id: msg.id,
          author: {id: msg.author},
          text: msg.text || '',
          type: msg.type as any,
          metadata: msg.metadata || {},
          createdAt: msg.createdAt || Date.now(),
        } as MessageType.Any),
    );

    // Create a new session in the database
    await chatSessionRepository.createSession(
      session.title,
      messages,
      session.completionSettings,
      session.activePalId,
    );
  } catch (error) {
    console.error('Error importing single session:', error);
    throw error;
  }
};

/**
 * Interface (Data Transfer Object (DTO)) for imported pal data (format v2.0)
 */
export interface ImportedPal {
  version: string;
  id: string;
  name: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_data?: string; // Base64 embedded image data
  systemPrompt: string;
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  useAIPrompt: boolean;
  defaultModel?: any;
  promptGenerationModel?: any;
  generatingPrompt?: string;
  color?: [string, string];
  capabilities?: any;
  parameters: Record<string, any>;
  parameterSchema: ParameterDefinition[];
  source: 'local' | 'palshub';
  palshub_id?: string;
  creator_info?: any;
  categories?: string[];
  tags?: string[];
  rating?: number;
  review_count?: number;
  protection_level?: string;
  price_cents?: number;
  is_owned?: boolean;
  generation_settings?: any;
  created_at?: string;
  updated_at?: string;
}

/**
 * Import pals from a JSON file (single or multiple)
 */
export const importPals = async (): Promise<number> => {
  try {
    // Pick a JSON file
    const fileUri = await pickJsonFile();
    if (!fileUri) {
      return 0;
    }

    const data = await readJsonFile(fileUri);
    const validatedData = validateImportedPalData(data);

    if (Array.isArray(validatedData)) {
      let importedCount = 0;
      for (const pal of validatedData) {
        await importSinglePal(pal);
        importedCount++;
      }
      return importedCount;
    } else {
      await importSinglePal(validatedData);
      return 1;
    }
  } catch (error) {
    console.error('Error importing pals:', error);
    throw error;
  }
};

/**
 * Validate imported pal data (handles both legacy and modern formats)
 */
export const validateImportedPalData = (
  data: any,
): ImportedPal | ImportedPal[] => {
  // Check if it's an array or a single object
  if (Array.isArray(data)) {
    // Validate each pal in the array
    return data.map(pal => validateSinglePal(pal));
  } else {
    // Validate a single pal
    return validateSinglePal(data);
  }
};

/**
 * Validate a single pal (modern format v2.0+ only)
 */
const validateSinglePal = (pal: any): ImportedPal => {
  // Check required fields
  if (!pal.name || typeof pal.name !== 'string') {
    throw new Error('Import failed: Invalid pal data');
  }

  if (!pal.systemPrompt || typeof pal.systemPrompt !== 'string') {
    throw new Error('Import failed: Invalid pal data');
  }

  if (!pal.version || !pal.version.startsWith('2.')) {
    throw new Error('Import failed: Unsupported format');
  }

  if (typeof pal.useAIPrompt !== 'boolean') {
    pal.useAIPrompt = false;
  }

  if (typeof pal.isSystemPromptChanged !== 'boolean') {
    pal.isSystemPromptChanged = false;
  }

  if (!pal.parameters || typeof pal.parameters !== 'object') {
    pal.parameters = {};
  }

  if (!pal.parameterSchema || !Array.isArray(pal.parameterSchema)) {
    pal.parameterSchema = [];
  }

  if (!pal.source) {
    pal.source = 'local';
  }

  if (!pal.id) {
    pal.id = uuidv4();
  }

  return pal as ImportedPal;
};

/**
 * Save base64 image data as a local file
 */
const saveBase64Image = async (
  base64Data: string,
  palId: string,
): Promise<string> => {
  // Extract extension and base64 content from data URL
  const extensionMatch = base64Data.match(/^data:image\/([a-z]+);base64,/);
  const fileExtension = extensionMatch ? extensionMatch[1] : 'jpg'; // Fallback to jpg
  const base64Content = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

  // Use same directory and naming convention as imageUtils.ts
  const PAL_IMAGES_DIR = `${RNFS.DocumentDirectoryPath}/pal-images`;
  const fileName = `${palId}_thumbnail.${fileExtension}`;
  const filePath = `${PAL_IMAGES_DIR}/${fileName}`;

  // Ensure directory exists (same as imageUtils.ts)
  const exists = await RNFS.exists(PAL_IMAGES_DIR);
  if (!exists) {
    await RNFS.mkdir(PAL_IMAGES_DIR);
  }

  // Write base64 data to file
  await RNFS.writeFile(filePath, base64Content, 'base64');

  // Return filename for storage
  return fileName;
};

/**
 * Transform imported pal to the format expected by palStore.createPal
 */
const transformImportPal = async (
  pal: ImportedPal,
): Promise<Omit<Pal, 'id' | 'created_at' | 'updated_at'>> => {
  // Handle thumbnail image - save base64 data as local file if present
  let thumbnailUrl = pal.thumbnail_url;

  if (pal.thumbnail_data) {
    try {
      // Generate new ID for this imported pal to avoid conflicts
      const newPalId = uuidv4();
      thumbnailUrl = await saveBase64Image(pal.thumbnail_data, newPalId);
    } catch (error) {
      console.warn('Failed to save imported thumbnail:', error);
      thumbnailUrl = undefined; // Fall back to no thumbnail
    }
  }

  return {
    type: 'local',
    name: pal.name,
    description: pal.description,
    thumbnail_url: thumbnailUrl,
    systemPrompt: pal.systemPrompt,
    originalSystemPrompt: pal.originalSystemPrompt,
    isSystemPromptChanged: pal.isSystemPromptChanged,
    useAIPrompt: pal.useAIPrompt,
    defaultModel: pal.defaultModel,
    promptGenerationModel: pal.promptGenerationModel,
    generatingPrompt: pal.generatingPrompt,
    color: pal.color,
    capabilities: pal.capabilities || {},
    parameters: pal.parameters,
    parameterSchema: pal.parameterSchema,
    source: pal.source,
    palshub_id: pal.palshub_id,
    creator_info: pal.creator_info,
    categories: pal.categories,
    tags: pal.tags,
    rating: pal.rating,
    review_count: pal.review_count,
    protection_level: pal.protection_level as
      | 'public'
      | 'reveal_on_purchase'
      | 'private'
      | undefined,
    price_cents: pal.price_cents,
    is_owned: pal.is_owned,
    completionSettings: pal.generation_settings,
  };
};

/**
 * Import a single pal
 */
const importSinglePal = async (pal: ImportedPal): Promise<void> => {
  try {
    const palData = await transformImportPal(pal);

    await palStore.createPal(palData);
  } catch (error) {
    console.error('Error importing single pal:', error);
    throw error;
  }
};
