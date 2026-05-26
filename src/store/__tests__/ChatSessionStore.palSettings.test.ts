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
    chatSessionStore.newChatThinkingOverride = undefined;
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

  describe('newChatThinkingOverride', () => {
    const makeThinkingPal = (
      id: string,
      enableThinking: boolean,
      extra: Partial<CompletionParams> = {},
    ): Pal => ({
      type: 'local',
      id,
      name: `Pal ${id}`,
      description: '',
      systemPrompt: '',
      isSystemPromptChanged: false,
      useAIPrompt: false,
      parameters: {},
      parameterSchema: [],
      completionSettings: {
        ...defaultCompletionSettings,
        enable_thinking: enableThinking,
        ...extra,
      } as CompletionParams,
      source: 'local',
    });

    it('override wins over pal in no-session resolve (default pal flips OFF)', async () => {
      palStore.pals.push(makeThinkingPal('palX', true, {temperature: 0.5}));
      chatSessionStore.newChatPalId = 'palX';
      chatSessionStore.newChatThinkingOverride = false;

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'palX',
      );

      // Override wins for enable_thinking.
      expect(result.enable_thinking).toBe(false);
      // Pal's other completion settings survive — override is single-key.
      expect(result.temperature).toBe(0.5);
    });

    it('override wins over pal in no-session resolve (authored pal flips ON)', async () => {
      // Pal has enable_thinking: false; user flips to true via override.
      palStore.pals.push(makeThinkingPal('palX', false));
      chatSessionStore.newChatPalId = 'palX';
      chatSessionStore.newChatThinkingOverride = true;

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'palX',
      );

      expect(result.enable_thinking).toBe(true);
    });

    it('override is ignored on session-branch resolution (settingsSource pal)', async () => {
      palStore.pals.push(makeThinkingPal('palX', true));
      // Active session with settingsSource='pal' — resolver should
      // return pal's enable_thinking, NOT the no-session override.
      chatSessionStore.sessions = [
        {
          id: 'session-1',
          title: 'Session 1',
          date: '2024-01-01',
          messages: [],
          completionSettings: {
            ...defaultCompletionSettings,
            enable_thinking: true,
          },
          activePalId: 'palX',
          settingsSource: 'pal',
        },
      ];
      chatSessionStore.newChatThinkingOverride = false;

      const result = await chatSessionStore.resolveCompletionSettings(
        'session-1',
        'palX',
      );

      // Pal's value wins; override is not applied on the session branch.
      expect(result.enable_thinking).toBe(true);
    });

    it('override does NOT strip PACT-derived tools', async () => {
      // Pal advertises a registered talent — resolver should inject
      // tools AND still let the override flip enable_thinking last.
      const palWithTalent: Pal = {
        ...makeThinkingPal('palToolful', true),
        pact: {
          talents: [{name: 'calculate', necessity: 'required'}],
        },
      };
      palStore.pals.push(palWithTalent);
      chatSessionStore.newChatPalId = 'palToolful';
      chatSessionStore.newChatThinkingOverride = false;

      const result = await chatSessionStore.resolveCompletionSettings(
        undefined,
        'palToolful',
      );

      expect(result.enable_thinking).toBe(false);
      const tools = (result.tools ?? []) as any[];
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      // Tools came from the requested talent.
      const toolNames = tools.map((t: any) => t?.function?.name ?? t?.name);
      expect(toolNames).toContain('calculate');
    });
  });
});
