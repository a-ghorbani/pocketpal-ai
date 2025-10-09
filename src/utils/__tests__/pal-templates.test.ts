import {
  createNewAssistantPal,
  createNewRoleplayPal,
  createNewVideoPal,
  preparePalForEditing,
} from '../pal-templates';
import {ASSISTANT_SCHEMA, ROLEPLAY_SCHEMA, VIDEO_SCHEMA} from '../../types/pal';
import type {Pal} from '../../types/pal';

describe('Pal Templates', () => {
  describe('createNewAssistantPal', () => {
    it('should create a new assistant pal with correct defaults', () => {
      const pal = createNewAssistantPal();

      expect(pal).toEqual({
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
    });

    it('should not have an id (for new pal creation)', () => {
      const pal = createNewAssistantPal();
      expect(pal.id).toBeUndefined();
    });
  });

  describe('createNewRoleplayPal', () => {
    it('should create a new roleplay pal with correct defaults', () => {
      const pal = createNewRoleplayPal();

      expect(pal.type).toBe('local');
      expect(pal.name).toBe('');
      expect(pal.parameterSchema).toEqual(ROLEPLAY_SCHEMA);
      expect(pal.parameters).toEqual({
        world: '',
        location: '',
        aiRole: '',
        userRole: '',
        situation: '',
        toneStyle: '',
      });
      expect(pal.systemPrompt).toContain('{{world}}'); // Should contain template
    });
  });

  describe('createNewVideoPal', () => {
    it('should create a new video pal with correct defaults', () => {
      const pal = createNewVideoPal();

      expect(pal.type).toBe('local');
      expect(pal.name).toBe('');
      expect(pal.systemPrompt).toBe(
        'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
      );
      expect(pal.originalSystemPrompt).toBe(
        'You are Lookie, an AI assistant giving real-time, concise descriptions of a video feed. Use few words. If unsure, say so clearly.',
      );
      expect(pal.parameterSchema).toEqual(VIDEO_SCHEMA);
      expect(pal.parameters).toEqual({
        captureInterval: '3000',
      });
      expect(pal.capabilities?.video).toBe(true);
    });
  });

  describe('preparePalForEditing', () => {
    it('should prepare a pal for editing with all required fields', () => {
      const existingPal: Pal = {
        type: 'local',
        id: 'test-id',
        name: 'Test Pal',
        systemPrompt: 'Test prompt',
        isSystemPromptChanged: false,
        useAIPrompt: false,
        parameters: {test: 'value'},
        parameterSchema: [],
        source: 'local',
        capabilities: {},
      };

      const prepared = preparePalForEditing(existingPal);

      expect(prepared.id).toBe('test-id');
      expect(prepared.name).toBe('Test Pal');
      expect(prepared.description).toBe(''); // Should default to empty string
      expect(prepared.originalSystemPrompt).toBe('Test prompt'); // Should default to systemPrompt
    });
  });
});
