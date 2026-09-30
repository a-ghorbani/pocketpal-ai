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
    expect(result.nextLink).toBe(
      'https://hf-mirror.com/api/models?cursor=next',
    );
  });

  it('does not resend search params when following an hf cursor link', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [],
      headers: {},
    });

    await fetchModelsFromSource({
      source: 'hf_mirror',
      search: 'repo',
      nextPageUrl: 'https://hf-mirror.com/api/models?cursor=next',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://hf-mirror.com/api/models?cursor=next',
      expect.objectContaining({params: undefined}),
    );
  });

  it('queries ModelScope OpenAPI without mutating the user query', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        request_id: 'req-1',
        data: {
          models: [
            {
              id: 'qwen/Qwen2.5-GGUF',
              display_name: 'Qwen2.5-GGUF',
              description: 'Qwen GGUF model',
              downloads: 10,
              likes: 2,
              license: 'apache-2.0',
              tasks: ['text-generation'],
              created_at: '2024-09-18T03:17:31Z',
              last_modified: '2025-02-26T17:40:28Z',
              file_size: 2048,
              params: 1500000000,
              tags: ['license:apache-2.0', 'library:gguf'],
              private: false,
              gated: false,
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
          search: 'qwen',
          'filter.library': 'gguf',
          page_number: 1,
          page_size: 50,
        }),
      }),
    );
    // The user query must be passed through untouched: no hardcoded " gguf".
    const sentParams = mockedAxios.get.mock.calls[0][1]?.params;
    expect(sentParams.search).not.toContain('gguf');
    expect(result.nextLink).toContain('page_number=2');
    expect(result.nextLink).toContain('filter.library=gguf');
    expect(result.models[0]).toEqual(
      expect.objectContaining({
        id: 'qwen/Qwen2.5-GGUF',
        author: 'qwen',
        source: 'modelscope',
        description: 'Qwen GGUF model',
        modelSize: 2048,
        library_name: 'gguf',
        url: 'https://modelscope.cn/models/qwen/Qwen2.5-GGUF',
        specs: expect.objectContaining({
          gguf: expect.objectContaining({total: 1500000000}),
        }),
      }),
    );
    expect(result.models[0].avatarUrl).toBeUndefined();
    expect(result.models[0].siblings).toHaveLength(0);
  });

  it('loads additional ModelScope pages from a standard pagination URL', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        request_id: 'req-2',
        data: {
          models: [
            {
              id: 'qwen/Qwen3-GGUF',
              display_name: 'Qwen3-GGUF',
              description: '',
              downloads: 5,
              likes: 1,
              license: 'apache-2.0',
              tasks: ['text-generation'],
              created_at: '2024-09-18T03:17:31Z',
              last_modified: '2025-02-26T17:40:28Z',
              file_size: 1024,
              params: 1000,
              tags: ['library:gguf'],
              private: false,
              gated: false,
            },
          ],
          total_count: 51,
          page_number: 2,
          page_size: 50,
        },
      },
      headers: {},
    });

    const nextPageUrl =
      'https://modelscope.cn/openapi/v1/models?search=qwen&filter.library=gguf&page_number=2&page_size=50';
    const result = await fetchModelsFromSource({
      source: 'modelscope',
      nextPageUrl,
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://modelscope.cn/openapi/v1/models',
      expect.objectContaining({
        params: expect.objectContaining({
          search: 'qwen',
          page_number: 2,
        }),
      }),
    );
    expect(result.models[0].id).toBe('qwen/Qwen3-GGUF');
    expect(result.nextLink).toBeNull();
  });

  it('maps HF-style sort values to ModelScope OpenAPI sorts', async () => {
    const listPayload = {
      success: true,
      request_id: 'req-sort',
      data: {
        models: [],
        total_count: 0,
        page_number: 1,
        page_size: 50,
      },
    };
    mockedAxios.get.mockResolvedValue({data: listPayload, headers: {}});

    await fetchModelsFromSource({source: 'modelscope', sort: 'lastModified'});
    expect(mockedAxios.get.mock.calls[0][1]?.params).toEqual(
      expect.objectContaining({sort: 'last_modified'}),
    );

    mockedAxios.get.mockClear();
    mockedAxios.get.mockResolvedValue({data: listPayload, headers: {}});
    await fetchModelsFromSource({source: 'modelscope', sort: 'relevance'});
    expect(mockedAxios.get.mock.calls[0][1]?.params).not.toHaveProperty('sort');
  });

  it('throws on an unexpected ModelScope list shape instead of returning empty', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {Data: {Models: []}},
      headers: {},
    });

    await expect(
      fetchModelsFromSource({source: 'modelscope', search: 'qwen'}),
    ).rejects.toThrow('Unexpected ModelScope response shape');
  });

  it('loads a ModelScope repository directly when search is owner/repo', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          success: true,
          request_id: 'req-detail',
          data: {
            id: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
            display_name: 'Qwen2.5-0.5B-Instruct-GGUF',
            description: '',
            downloads: 69964,
            likes: 26,
            license: 'apache-2.0',
            tasks: ['text-generation'],
            created_at: '2024-09-18T03:17:31Z',
            last_modified: '2025-02-26T17:40:28Z',
            file_size: 5372550151,
            params: 630167424,
            tags: ['license:apache-2.0', 'library:gguf'],
            private: false,
            gated: false,
            owner: 'Qwen',
            repo_name: 'Qwen2.5-0.5B-Instruct-GGUF',
          },
        },
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
        },
      });

    const result = await fetchModelsFromSource({
      source: 'modelscope',
      search: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      authToken: 'ms-token',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://modelscope.cn/openapi/v1/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      expect.objectContaining({
        headers: {Authorization: 'Bearer ms-token'},
      }),
    );
    expect(result.models[0]).toEqual(
      expect.objectContaining({
        id: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
        source: 'modelscope',
        modelSize: 5372550151,
      }),
    );
  });

  it('returns ModelScope file details from the single pinned repo files endpoint', async () => {
    mockedAxios.get.mockResolvedValueOnce({
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
      },
    });

    const details = await fetchModelFilesDetailsFromSource({
      source: 'modelscope',
      modelId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
      authToken: 'ms-token',
    });

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://modelscope.cn/api/v1/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/repo/files',
      expect.objectContaining({
        params: expect.objectContaining({Revision: 'master'}),
      }),
    );
    expect(details).toEqual([
      expect.objectContaining({
        path: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
        size: 491400032,
        oid: 'sha-1',
      }),
    ]);
  });

  it('throws a clear ModelScope error when no GGUF files are found', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        Code: 200,
        Data: {Files: [{Path: 'README.md', Size: 1000}]},
      },
    });

    await expect(
      fetchModelFilesDetailsFromSource({
        source: 'modelscope',
        modelId: 'Qwen/No-GGUF',
      }),
    ).rejects.toThrow('No GGUF files found for ModelScope model: Qwen/No-GGUF');
  });

  it('extracts GGUF specs from ModelScope OpenAPI detail metadata', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        request_id: 'req-specs',
        data: {
          id: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
          display_name: 'Qwen2.5-0.5B-Instruct-GGUF',
          description: '',
          downloads: 10,
          likes: 2,
          license: 'apache-2.0',
          tasks: ['text-generation'],
          created_at: '2024-09-18T03:17:31Z',
          last_modified: '2025-02-26T17:40:28Z',
          file_size: 630167424,
          params: 630167424,
          tags: ['library:gguf'],
          private: false,
          gated: false,
        },
      },
    });

    const specs = await fetchGGUFSpecsFromSource({
      source: 'modelscope',
      modelId: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    });

    expect(specs.gguf).toEqual(
      expect.objectContaining({
        total: 630167424,
      }),
    );
  });
});
