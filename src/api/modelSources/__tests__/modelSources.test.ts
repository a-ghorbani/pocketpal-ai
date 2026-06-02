import axios from 'axios';

import {
  fetchGGUFSpecsFromSource,
  fetchModelFilesDetailsFromSource,
  fetchModelsFromSource,
} from '..';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('model source adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses hf-mirror as a Hugging Face compatible endpoint', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        {
          id: 'owner/repo-GGUF',
          author: 'owner',
          siblings: [{rfilename: 'model.Q4_K_M.gguf'}],
        },
      ],
      headers: {link: '<https://huggingface.co/api/models?cursor=next>'},
    });

    const result = await fetchModelsFromSource({
      source: 'hf_mirror',
      search: 'repo',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://hf-mirror.com/api/models',
      expect.objectContaining({
        params: expect.objectContaining({search: 'repo'}),
      }),
    );
    expect(result.models[0].source).toBe('hf_mirror');
    expect(result.models[0].url).toBe('https://hf-mirror.com/owner/repo-GGUF');
    expect(result.models[0].siblings[0].url).toBe(
      'https://hf-mirror.com/owner/repo-GGUF/resolve/main/model.Q4_K_M.gguf',
    );
    expect(result.nextLink).toBe('https://hf-mirror.com/api/models?cursor=next');
  });

  it('normalizes ModelScope search results into GGUF-compatible models', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        Data: {
          Models: [
            {
              ModelId: 'qwen/Qwen2.5-GGUF',
              Owner: 'qwen',
              Organization: {
                Avatar: 'https://modelscope.cn/avatar/qwen.png',
              },
              Description: 'Qwen GGUF model',
              Downloads: 10,
              params: 1500000000,
              file_size: 2048,
              Stars: 2,
              tags: ['library:gguf'],
              Files: [
                {Path: 'qwen.Q4_K_M.gguf', Size: 1024, Oid: 'abc'},
                {Path: 'README.md', Size: 64},
              ],
            },
          ],
          total_count: 120,
          page_number: 1,
          page_size: 50,
        },
      },
      headers: {},
    });

    const result = await fetchModelsFromSource({
      source: 'modelscope',
      search: 'qwen',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://modelscope.cn/openapi/v1/models',
      expect.objectContaining({
        params: expect.objectContaining({
          search: 'qwen gguf',
          page: 1,
          page_size: 50,
        }),
      }),
    );
    expect(result.nextLink).toBe(
      'https://modelscope.cn/openapi/v1/models?search=qwen%20gguf&page=2&page_size=50',
    );
    expect(result.models[0]).toEqual(
      expect.objectContaining({
        id: 'qwen/Qwen2.5-GGUF',
        author: 'qwen',
        source: 'modelscope',
        description: 'Qwen GGUF model',
        avatarUrl: 'https://modelscope.cn/avatar/qwen.png',
        modelSize: 2048,
        library_name: 'gguf',
        url: 'https://modelscope.cn/models/qwen/Qwen2.5-GGUF',
        specs: expect.objectContaining({
          gguf: expect.objectContaining({total: 1500000000}),
        }),
      }),
    );
    expect(result.models[0].siblings).toHaveLength(1);
    expect(result.models[0].siblings[0]).toEqual(
      expect.objectContaining({
        rfilename: 'qwen.Q4_K_M.gguf',
        size: 1024,
        oid: 'abc',
      }),
    );
  });

  it('loads additional ModelScope pages from the next page URL', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          models: [
            {
              id: 'qwen/Qwen3-GGUF',
              author: 'qwen',
              tags: ['library:gguf'],
              files: [{path: 'qwen3.Q4_K_M.gguf', size: 1024}],
            },
          ],
          total_count: 51,
          page_number: 2,
          page_size: 50,
        },
      },
      headers: {},
    });

    const result = await fetchModelsFromSource({
      source: 'modelscope',
      nextPageUrl:
        'https://modelscope.cn/openapi/v1/models?search=qwen%20gguf&page=2&page_size=50',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://modelscope.cn/openapi/v1/models?search=qwen%20gguf&page=2&page_size=50',
      expect.objectContaining({
        params: undefined,
      }),
    );
    expect(result.models[0].id).toBe('qwen/Qwen3-GGUF');
    expect(result.nextLink).toBeNull();
  });

  it('keeps ModelScope GGUF repositories even when search results omit file lists', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        Data: {
          Models: [
            {
              ModelId: 'deepseek/DeepSeek-R1-GGUF',
              Owner: 'deepseek',
              Description: 'Quantized GGUF models',
              Downloads: 20,
              Stars: 5,
              tags: ['nlp'],
            },
            {
              ModelId: 'deepseek/DeepSeek-R1',
              Owner: 'deepseek',
              Description: 'Original weights',
              tags: ['nlp'],
            },
          ],
          total_count: 2,
          page_number: 1,
          page_size: 50,
        },
      },
      headers: {},
    });

    const result = await fetchModelsFromSource({
      source: 'modelscope',
      search: 'deepseek',
    });

    expect(result.models.map(model => model.id)).toEqual([
      'deepseek/DeepSeek-R1-GGUF',
    ]);
  });

  it('loads a ModelScope repository directly when search is owner/repo', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        Code: 200,
        Data: {
          ModelId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
          Path: 'Qwen',
          Name: 'Qwen2.5-0.5B-Instruct-GGUF',
          Avatar: 'https://example.com/avatar.png',
          Downloads: 10,
          Stars: 2,
          ModelInfos: {
            gguf: {
              model_size: 630167424,
              architecture: 'qwen2',
              gguf_file_list: [
                {
                  file_info: [
                    {
                      name: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
                      size: 491400032,
                      sha256: 'sha-1',
                    },
                  ],
                },
              ],
            },
          },
        },
        Success: true,
      },
    });

    const result = await fetchModelsFromSource({
      source: 'modelscope',
      search: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      authToken: 'ms-token',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://modelscope.cn/api/v1/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      expect.objectContaining({
        headers: {Authorization: 'Bearer ms-token'},
      }),
    );
    expect(result.models[0]).toEqual(
      expect.objectContaining({
        id: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
        source: 'modelscope',
        modelSize: 630167424,
      }),
    );
    expect(result.models[0].siblings[0]).toEqual(
      expect.objectContaining({
        rfilename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
        size: 491400032,
        oid: 'sha-1',
      }),
    );
  });

  it('returns ModelScope file details from the repo files endpoint', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {Code: 200, Data: {}, Success: true},
      })
      .mockResolvedValueOnce({
        data: {
          Code: 200,
          Data: {
            Files: [
              {
                Path: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
                Size: 491400032,
                Sha256: 'sha-1',
              },
              {Path: 'README.md', Size: 1000},
            ],
          },
          Success: true,
        },
      });

    const details = await fetchModelFilesDetailsFromSource({
      source: 'modelscope',
      modelId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      authToken: 'ms-token',
    });

    expect(details).toEqual([
      expect.objectContaining({
        path: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
        size: 491400032,
        oid: 'sha-1',
      }),
    ]);
  });

  it('throws a clear ModelScope error when no GGUF files are found', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {Code: 200, Data: {}, Success: true},
      })
      .mockResolvedValueOnce({
        data: {
          Code: 200,
          Data: {Files: [{Path: 'README.md', Size: 1000}]},
          Success: true,
        },
      });

    await expect(
      fetchModelFilesDetailsFromSource({
        source: 'modelscope',
        modelId: 'Qwen/No-GGUF',
      }),
    ).rejects.toThrow('No GGUF files found for ModelScope model: Qwen/No-GGUF');
  });

  it('extracts GGUF specs from ModelScope detail metadata', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        Code: 200,
        Data: {
          ModelId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
          ModelInfos: {
            gguf: {
              model_size: 630167424,
              architecture: 'qwen2',
              context_length: 32768,
            },
          },
        },
        Success: true,
      },
    });

    const specs = await fetchGGUFSpecsFromSource({
      source: 'modelscope',
      modelId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    });

    expect(specs.gguf).toEqual(
      expect.objectContaining({
        total: 630167424,
        architecture: 'qwen2',
        context_length: 32768,
      }),
    );
  });
});
