import * as RNFS from '@dr.pogodin/react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import {Platform} from 'react-native';
import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';

import {chatSessionRepository} from '../repositories/ChatSessionRepository';
import {MessageType} from './types';
import {CompletionParams} from './completionTypes';
import {migrateCompletionSettings} from './completionSettingsVersions';
import {
  PalType,
  AssistantFormData,
  RoleplayFormData,
  VideoPalFormData,
} from '../components/PalsSheets/types';
import {palStore} from '../store';

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
 * Interface for imported pal data
 */
export interface ImportedPal {
  id: string;
  name: string;
  palType: PalType;
  defaultModel?: any;
  useAIPrompt: boolean;
  systemPrompt: string;
  originalSystemPrompt?: string;
  isSystemPromptChanged: boolean;
  color?: [string, string];
  promptGenerationModel?: any;
  generatingPrompt?: string;

  // Roleplay fields
  world?: string;
  location?: string;
  aiRole?: string;
  userRole?: string;
  situation?: string;
  toneStyle?: string;

  // Video fields
  captureInterval?: number;
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
 * Validate imported pal data
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
 * Validate a single pal
 */
const validateSinglePal = (pal: any): ImportedPal => {
  // Check required fields
  if (!pal.name || typeof pal.name !== 'string') {
    throw new Error('Invalid pal: missing or invalid name');
  }

  if (!pal.palType || !Object.values(PalType).includes(pal.palType)) {
    throw new Error('Invalid pal: missing or invalid palType');
  }

  if (!pal.systemPrompt || typeof pal.systemPrompt !== 'string') {
    throw new Error('Invalid pal: missing or invalid systemPrompt');
  }

  if (typeof pal.useAIPrompt !== 'boolean') {
    pal.useAIPrompt = false;
  }

  if (typeof pal.isSystemPromptChanged !== 'boolean') {
    pal.isSystemPromptChanged = false;
  }

  // Validate roleplay required fields
  if (pal.palType === PalType.ROLEPLAY) {
    const requiredRoleplayFields = [
      'world',
      'location',
      'aiRole',
      'userRole',
      'situation',
      'toneStyle',
    ];

    for (const field of requiredRoleplayFields) {
      if (!pal[field] || typeof pal[field] !== 'string') {
        throw new Error(`Invalid roleplay pal: missing or invalid ${field}`);
      }
    }
  }

  // Validate video required fields
  if (pal.palType === PalType.VIDEO) {
    if (
      pal.captureInterval === undefined ||
      typeof pal.captureInterval !== 'number'
    ) {
      pal.captureInterval = 3000;
    }
  }

  if (!pal.id) {
    pal.id = uuidv4();
  }

  return pal as ImportedPal;
};

const transformImportPal = (
  pal: ImportedPal,
): AssistantFormData | RoleplayFormData | VideoPalFormData => {
  const baseData = {
    name: pal.name,
    defaultModel: pal.defaultModel,
    useAIPrompt: pal.useAIPrompt,
    systemPrompt: pal.systemPrompt,
    originalSystemPrompt: pal.originalSystemPrompt,
    isSystemPromptChanged: pal.isSystemPromptChanged,
    color: pal.color,
    promptGenerationModel: pal.promptGenerationModel,
    generatingPrompt: pal.generatingPrompt,
  };
  switch (pal.palType) {
    case PalType.ROLEPLAY:
      return {
        ...baseData,
        palType: PalType.ROLEPLAY,
        world: pal.world!,
        location: pal.location!,
        aiRole: pal.aiRole!,
        userRole: pal.userRole!,
        situation: pal.situation!,
        toneStyle: pal.toneStyle!,
      } as RoleplayFormData;

    case PalType.VIDEO:
      return {
        ...baseData,
        palType: PalType.VIDEO,
        captureInterval: pal.captureInterval!,
      } as VideoPalFormData;

    case PalType.ASSISTANT:
    default:
      return {
        ...baseData,
        palType: PalType.ASSISTANT,
      } as AssistantFormData;
  }
};

/**
 * Import a single pal
 */
const importSinglePal = async (pal: ImportedPal): Promise<void> => {
  try {
    const palData = transformImportPal(pal);
    await palStore.addPal(palData);
  } catch (error) {
    console.error('Error importing single pal:', error);
    throw error;
  }
};
