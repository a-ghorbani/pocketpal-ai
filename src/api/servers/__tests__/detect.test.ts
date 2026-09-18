import {detectServerType} from '../detect';

describe('detectServerType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects llama.cpp from Server header', async () => {
    const result = await detectServerType(
      'http://localhost:8080',
      [{id: 'model-1', object: 'model', owned_by: 'system'}],
      {server: 'llama.cpp'},
    );
    expect(result).toBe('llama.cpp');
  });

  it('detects LM Studio from owned_by field', async () => {
    const result = await detectServerType(
      'http://localhost:1234',
      [{id: 'model-1', object: 'model', owned_by: 'organization_owner'}],
      {},
    );
    expect(result).toBe('LM Studio');
  });

  it('detects Ollama from GET / response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      text: () => Promise.resolve('Ollama is running'),
    });

    const result = await detectServerType(
      'http://localhost:11434',
      [{id: 'model-1', object: 'model', owned_by: 'ollama'}],
      {},
    );
    expect(result).toBe('Ollama');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434',
      expect.objectContaining({method: 'GET'}),
    );
  });

  it('returns undefined for unknown server', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      text: () => Promise.resolve('<html>Not Ollama</html>'),
    });

    const result = await detectServerType(
      'http://localhost:9999',
      [{id: 'model-1', object: 'model', owned_by: 'custom'}],
      {},
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined when Ollama probe fails', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

    const result = await detectServerType(
      'http://localhost:9999',
      [{id: 'model-1', object: 'model', owned_by: 'custom'}],
      {},
    );
    expect(result).toBeUndefined();
  });

  it('prefers llama.cpp header over LM Studio owned_by', async () => {
    const result = await detectServerType(
      'http://localhost:8080',
      [{id: 'model-1', object: 'model', owned_by: 'organization_owner'}],
      {server: 'llama.cpp'},
    );
    expect(result).toBe('llama.cpp');
  });
});
