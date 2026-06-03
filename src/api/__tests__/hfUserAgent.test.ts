/**
 * Attribution User-Agent on outbound HF requests.
 *
 * Asserts the versioned UA header is present on all four hf.ts request sites:
 *   fetchModels (axios), fetchModelInfo (axios),
 *   fetchModelFilesDetails (fetch), fetchGGUFSpecs (fetch).
 *
 * DeviceInfo.getVersion() is mocked to '1.0.0' via the device-info fixture, so
 * the expected UA is `PocketPal/1.0.0 (ai.pocketpal)`.
 */

import axios from 'axios';

import {
  fetchModels,
  fetchModelInfo,
  fetchModelFilesDetails,
  fetchGGUFSpecs,
} from '../hf';
import {hfUserAgent} from '../../utils/hfUserAgent';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const EXPECTED_UA = 'PocketPal/1.0.0 (ai.pocketpal)';

describe('hf.ts attribution User-Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hfUserAgent builds PocketPal/<version> (ai.pocketpal)', () => {
    expect(hfUserAgent()).toBe(EXPECTED_UA);
  });

  it('fetchModels (axios) sends the UA header', async () => {
    mockedAxios.get.mockResolvedValueOnce({data: [], headers: {}});

    await fetchModels({search: 'x'});

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({'User-Agent': EXPECTED_UA}),
      }),
    );
  });

  it('fetchModelInfo (axios) sends the UA header', async () => {
    mockedAxios.get.mockResolvedValueOnce({data: {id: 'author/model'}});

    await fetchModelInfo({repoId: 'author/model'});

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({'User-Agent': EXPECTED_UA}),
      }),
    );
  });

  it('fetchModelFilesDetails (fetch) sends the UA header', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    global.fetch = fetchSpy as any;

    await fetchModelFilesDetails('author/model');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({'User-Agent': EXPECTED_UA}),
      }),
    );
  });

  it('fetchGGUFSpecs (fetch) sends the UA header', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({gguf: {}}),
    });
    global.fetch = fetchSpy as any;

    await fetchGGUFSpecs('author/model');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({'User-Agent': EXPECTED_UA}),
      }),
    );
  });

  it('keeps Authorization alongside the UA when a token is supplied', async () => {
    mockedAxios.get.mockResolvedValueOnce({data: [], headers: {}});

    await fetchModels({search: 'x', authToken: 'hf_abc'});

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': EXPECTED_UA,
          Authorization: 'Bearer hf_abc',
        }),
      }),
    );
  });
});
