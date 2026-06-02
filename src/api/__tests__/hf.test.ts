import axios from 'axios';
import {fetchGGUFSpecs, fetchModelFilesDetails, fetchModels} from '../hf';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('fetchModels', () => {
  it('should fetch models with basic parameters', async () => {
    const mockResponse = {
      data: [{id: 'model1'}],
      headers: {link: '<next-page-link>'},
    };
    mockedAxios.get.mockResolvedValueOnce(mockResponse);

    const result = await fetchModels({search: 'test'});

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({search: 'test'}),
      }),
    );
    expect(result).toEqual({
      models: [
        expect.objectContaining({
          id: 'model1',
          source: 'huggingface',
        }),
      ],
      nextLink: 'next-page-link',
    });
  });

  it('should handle missing pagination link', async () => {
    const mockResponse = {
      data: [{id: 'model1'}],
      headers: {},
    };
    mockedAxios.get.mockResolvedValueOnce(mockResponse);

    const result = await fetchModels({});
    expect(result.nextLink).toBeNull();
  });
});

describe('API error handling', () => {
  it('should handle network errors in fetchModels', async () => {
    const error = new Error('Network error');
    mockedAxios.get.mockRejectedValueOnce(error);

    await expect(fetchModels({})).rejects.toThrow('Network error');
  });

  it('should handle non-ok responses in fetchModelFilesDetails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    });

    await expect(fetchModelFilesDetails('model1')).rejects.toThrow(
      'Error fetching model files: Not Found',
    );
  });
});

describe('fetchGGUFSpecs', () => {
  it('should parse GGUF specs correctly', async () => {
    const mockSpecs = {
      gguf: {
        params: 7,
        type: 'f16',
      },
    };
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSpecs),
    });

    const result = await fetchGGUFSpecs('model1');
    expect(result).toEqual(mockSpecs);
  });
});
