import {
  hasVideoCapability,
  hasMultimodalCapability,
  hasRealtimeCapability,
  hasAudioCapability,
  hasWebCapability,
  hasCodeCapability,
  hasMemoryCapability,
  hasToolsCapability,
  getActiveCapabilities,
  hasAnyCapabilities,
  createCapabilitiesFromLegacyType,
} from '../pal-capabilities';
import type {Pal} from '../../types/pal';

describe('pal-capabilities', () => {
  const createMockPal = (capabilities = {}): Pal => ({
    type: 'local',
    id: 'test-pal',
    name: 'Test Pal',
    systemPrompt: 'Test prompt',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    capabilities,
    source: 'local',
  });

  describe('capability check functions', () => {
    it('should detect video capability', () => {
      const palWithVideo = createMockPal({video: true});
      const palWithoutVideo = createMockPal({video: false});
      const palNoCapabilities = createMockPal();

      expect(hasVideoCapability(palWithVideo)).toBe(true);
      expect(hasVideoCapability(palWithoutVideo)).toBe(false);
      expect(hasVideoCapability(palNoCapabilities)).toBe(false);
    });

    it('should detect multimodal capability', () => {
      const palWithMultimodal = createMockPal({multimodal: true});
      const palWithoutMultimodal = createMockPal({multimodal: false});

      expect(hasMultimodalCapability(palWithMultimodal)).toBe(true);
      expect(hasMultimodalCapability(palWithoutMultimodal)).toBe(false);
    });

    it('should detect realtime capability', () => {
      const palWithRealtime = createMockPal({realtime: true});
      const palWithoutRealtime = createMockPal({realtime: false});

      expect(hasRealtimeCapability(palWithRealtime)).toBe(true);
      expect(hasRealtimeCapability(palWithoutRealtime)).toBe(false);
    });

    it('should detect audio capability', () => {
      const palWithAudio = createMockPal({audio: true});
      const palWithoutAudio = createMockPal({audio: false});

      expect(hasAudioCapability(palWithAudio)).toBe(true);
      expect(hasAudioCapability(palWithoutAudio)).toBe(false);
    });

    it('should detect web capability', () => {
      const palWithWeb = createMockPal({web: true});
      const palWithoutWeb = createMockPal({web: false});

      expect(hasWebCapability(palWithWeb)).toBe(true);
      expect(hasWebCapability(palWithoutWeb)).toBe(false);
    });

    it('should detect code capability', () => {
      const palWithCode = createMockPal({code: true});
      const palWithoutCode = createMockPal({code: false});

      expect(hasCodeCapability(palWithCode)).toBe(true);
      expect(hasCodeCapability(palWithoutCode)).toBe(false);
    });

    it('should detect memory capability', () => {
      const palWithMemory = createMockPal({memory: true});
      const palWithoutMemory = createMockPal({memory: false});

      expect(hasMemoryCapability(palWithMemory)).toBe(true);
      expect(hasMemoryCapability(palWithoutMemory)).toBe(false);
    });

    it('should detect tools capability', () => {
      const palWithTools = createMockPal({tools: true});
      const palWithoutTools = createMockPal({tools: false});

      expect(hasToolsCapability(palWithTools)).toBe(true);
      expect(hasToolsCapability(palWithoutTools)).toBe(false);
    });
  });

  describe('getActiveCapabilities', () => {
    it('should return all active capabilities', () => {
      const pal = createMockPal({
        video: true,
        multimodal: true,
        code: true,
        web: false,
      });

      const active = getActiveCapabilities(pal);

      expect(active).toContain('video');
      expect(active).toContain('multimodal');
      expect(active).toContain('code');
      expect(active).not.toContain('web');
      expect(active.length).toBe(3);
    });

    it('should return empty array when no capabilities', () => {
      const pal = createMockPal();

      expect(getActiveCapabilities(pal)).toEqual([]);
    });

    it('should return empty array when all capabilities are false', () => {
      const pal = createMockPal({
        video: false,
        multimodal: false,
        code: false,
      });

      expect(getActiveCapabilities(pal)).toEqual([]);
    });
  });

  describe('hasAnyCapabilities', () => {
    it('should return true when pal has at least one capability', () => {
      const pal = createMockPal({video: true});

      expect(hasAnyCapabilities(pal)).toBe(true);
    });

    it('should return false when pal has no capabilities', () => {
      const pal = createMockPal();

      expect(hasAnyCapabilities(pal)).toBe(false);
    });

    it('should return false when all capabilities are false', () => {
      const pal = createMockPal({
        video: false,
        multimodal: false,
      });

      expect(hasAnyCapabilities(pal)).toBe(false);
    });
  });

  describe('createCapabilitiesFromLegacyType', () => {
    it('should create video capabilities for video type', () => {
      const capabilities = createCapabilitiesFromLegacyType('video');

      expect(capabilities).toEqual({
        video: true,
        multimodal: true,
      });
    });

    it('should create empty capabilities for assistant type', () => {
      const capabilities = createCapabilitiesFromLegacyType('assistant');

      expect(capabilities).toEqual({});
    });

    it('should create empty capabilities for roleplay type', () => {
      const capabilities = createCapabilitiesFromLegacyType('roleplay');

      expect(capabilities).toEqual({});
    });
  });
});
