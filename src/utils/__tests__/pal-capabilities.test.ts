import {
  createCapabilitiesFromLegacyType,
  getActiveCapabilities,
  hasAnyCapabilities,
  hasAudioCapability,
  hasCodeCapability,
  hasMemoryCapability,
  hasMultimodalCapability,
  hasRealtimeCapability,
  hasToolsCapability,
  hasVideoCapability,
  hasWebCapability,
} from '../pal-capabilities';

describe('pal-capabilities', () => {
  const palWithCapabilities = {
    capabilities: {
      audio: true,
      code: true,
      memory: true,
      multimodal: true,
      realtime: true,
      tools: true,
      video: true,
      web: true,
    },
  };

  it('checks each explicit capability flag', () => {
    expect(hasVideoCapability(palWithCapabilities as never)).toBe(true);
    expect(hasMultimodalCapability(palWithCapabilities as never)).toBe(true);
    expect(hasRealtimeCapability(palWithCapabilities as never)).toBe(true);
    expect(hasAudioCapability(palWithCapabilities as never)).toBe(true);
    expect(hasWebCapability(palWithCapabilities as never)).toBe(true);
    expect(hasCodeCapability(palWithCapabilities as never)).toBe(true);
    expect(hasMemoryCapability(palWithCapabilities as never)).toBe(true);
    expect(hasToolsCapability(palWithCapabilities as never)).toBe(true);
  });

  it('treats missing or false capabilities as disabled', () => {
    const palWithoutCapabilities = {capabilities: {audio: false}};

    expect(hasAudioCapability(palWithoutCapabilities as never)).toBe(false);
    expect(hasVideoCapability({} as never)).toBe(false);
    expect(hasToolsCapability({capabilities: undefined} as never)).toBe(false);
  });

  it('lists active capabilities and detects whether any are enabled', () => {
    expect(getActiveCapabilities(palWithCapabilities as never)).toEqual([
      'audio',
      'code',
      'memory',
      'multimodal',
      'realtime',
      'tools',
      'video',
      'web',
    ]);
    expect(getActiveCapabilities({} as never)).toEqual([]);
    expect(hasAnyCapabilities(palWithCapabilities as never)).toBe(true);
    expect(hasAnyCapabilities({capabilities: {audio: false}} as never)).toBe(
      false,
    );
  });

  it('maps legacy pal types to explicit capabilities', () => {
    expect(createCapabilitiesFromLegacyType('video')).toEqual({
      video: true,
      multimodal: true,
    });
    expect(createCapabilitiesFromLegacyType('assistant')).toEqual({});
    expect(createCapabilitiesFromLegacyType('roleplay')).toEqual({});
  });
});
