import {chatSessionStore} from '../ChatSessionStore';
import {palStore} from '../PalStore';
import {defaultCompletionSettings} from '../ChatSessionStore';
import {CompletionParams} from '../../utils/completionTypes';
import type {Pal} from '../PalStore';

describe('ChatSessionStore - Pal Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    chatSessionStore.sessions = [];
    chatSessionStore.activeSessionId = null;
    chatSessionStore.newChatPalId = undefined;
    chatSessionStore.newChatCompletionSettings = {...defaultCompletionSettings};
    // Reset palStore
    palStore.pals = [];
  });

  describe('resolveCompletionSettings', () => {
    it('should return system defaults when no other settings are available', async () => {
      const result = await chatSessionStore.resolveCompletionSettings();

      expect(result).toEqual(defaultCompletionSettings);
    });

    it('should apply global settings over system defaults', async () => {
      const globalSettings: Partial<CompletionParams> = {
        temperature: 0.8,
        top_p: 0.9,
      };

      chatSessionStore.newChatCompletionSettings = {
        ...defaultCompletionSettings,
        ...globalSettings,
      };

      const result = await chatSessionStore.resolveCompletionSettings();

      expect(result.temperature).toBe(0.8);
      expect(result.top_p).toBe(0.9);
    });

    it('should apply pal settings over global settings', async () => {
      const globalSettings: Partial<CompletionParams> = {
        temperature: 0.8,
        top_p: 0.9,
      };

      const palSettings: Partial<CompletionParams> = {
        temperature: 0.5,
        top_k: 30,
      };

      chatSessionStore.newChatCompletionSettings = {
        ...defaultCompletionSettings,
        ...globalSettings,
      };

      // Set up a pal in the palStore with completion settings
      const testPal: Pal = {
        type: 'local',
        id: 'test-pal-id',
        name: 'Test Pal',
        description: 'Test pal for settings',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {},
        parameterSchema: [],
        completionSettings: palSettings as CompletionParams,
        source: 'local',
      };
      palStore.pals.push(testPal);

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'test-pal-id',
      );

      expect(result.temperature).toBe(0.5); // From pal settings
      expect(result.top_p).toBe(0.9); // From global settings
      expect(result.top_k).toBe(30); // From pal settings
    });

    it('should apply session settings over all other settings', async () => {
      const globalSettings: Partial<CompletionParams> = {
        temperature: 0.8,
        top_p: 0.9,
      };

      const palSettings: Partial<CompletionParams> = {
        temperature: 0.5,
        top_k: 30,
      };

      const sessionSettings: CompletionParams = {
        ...defaultCompletionSettings,
        temperature: 0.3,
        n_predict: 200,
      };

      chatSessionStore.newChatCompletionSettings = {
        ...defaultCompletionSettings,
        ...globalSettings,
      };

      chatSessionStore.sessions = [
        {
          id: 'test-session',
          title: 'Test Session',
          date: '2024-01-01',
          messages: [],
          completionSettings: sessionSettings,
          activePalId: 'test-pal-id',
          settingsSource: 'custom',
        },
      ];

      // Set up a pal in the palStore with completion settings
      const testPal: Pal = {
        type: 'local',
        id: 'test-pal-id',
        name: 'Test Pal',
        description: 'Test pal for settings',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {},
        parameterSchema: [],
        completionSettings: palSettings as CompletionParams,
        source: 'local',
      };
      palStore.pals.push(testPal);

      const result = await chatSessionStore.resolveCompletionSettings(
        'test-session',
        'test-pal-id',
      );

      expect(result.temperature).toBe(0.3); // From session settings
      expect(result.top_p).toBe(0.95); // From session settings (default value)
      expect(result.top_k).toBe(40); // From session settings (default value)
      expect(result.n_predict).toBe(200); // From session settings
    });
  });

  describe('getCurrentCompletionSettings', () => {
    it('should resolve settings for new chat with pal', async () => {
      const palSettings: Partial<CompletionParams> = {
        temperature: 0.7,
      };

      chatSessionStore.newChatPalId = 'test-pal-id';

      // Set up a pal in the palStore with completion settings
      const testPal: Pal = {
        type: 'local',
        id: 'test-pal-id',
        name: 'Test Pal',
        description: 'Test pal for settings',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {},
        parameterSchema: [],
        completionSettings: palSettings as CompletionParams,
        source: 'local',
      };
      palStore.pals.push(testPal);

      const result = await chatSessionStore.getCurrentCompletionSettings();

      expect(result.temperature).toBe(0.7);
    });

    it('should resolve settings for active session', async () => {
      const sessionSettings: CompletionParams = {
        ...defaultCompletionSettings,
        temperature: 0.9,
      };

      chatSessionStore.activeSessionId = 'test-session';
      chatSessionStore.sessions = [
        {
          id: 'test-session',
          title: 'Test Session',
          date: '2024-01-01',
          messages: [],
          completionSettings: sessionSettings,
          activePalId: 'test-pal-id',
          settingsSource: 'custom',
        },
      ];

      const result = await chatSessionStore.getCurrentCompletionSettings();

      expect(result.temperature).toBe(0.9);
    });
  });
});
