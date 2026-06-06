/**
 * HF repo resolvers.
 *
 * resolveHFRepo — strict, repo-level core: assembles the full HuggingFaceModel
 * with populated /resolve/ sibling URLs; throws on any fetch failure.
 *
 * resolveHFModelForDownload — repo + single-filename resolver built on the core.
 * Strict mode (no fallback): throws when a fetch fails or no sibling matches.
 * Tolerant mode (fallback provided): used by the PalsHub flow — fills gaps and
 * never throws, keeping per-fetch independence on partial responses.
 *
 * Both guard the silent-no-op regression: resolved URLs must be non-empty
 * /resolve/ URLs (the whole point of routing through
 * createSiblingsFromFileDetails rather than a hand-built ModelFile).
 */

import {resolveHFModelForDownload, resolveHFRepo} from '../hfResolve';
import {fetchModelInfo, fetchModelFilesDetails} from '../../api/hf';

jest.mock('../../api/hf', () => ({
  fetchModelInfo: jest.fn(),
  fetchModelFilesDetails: jest.fn(),
}));

const mockFetchModelInfo = fetchModelInfo as jest.Mock;
const mockFetchModelFilesDetails = fetchModelFilesDetails as jest.Mock;

const REPO = 'author/model';
const FILE = 'model.Q4_K_M.gguf';

const modelInfoResponse = {
  _id: 'abc',
  id: REPO,
  author: 'author',
};

const fileDetails = [
  {path: FILE, size: 4096, oid: 'oid1', lfs: {oid: 'lfs1'}},
  {path: 'other.Q8_0.gguf', size: 8192, oid: 'oid2'},
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveHFRepo — strict repo-level core', () => {
  it('assembles the full model with populated /resolve/ sibling urls', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    const hfModel = await resolveHFRepo(REPO);

    expect(hfModel.id).toBe(REPO);
    expect(hfModel.author).toBe('author');
    expect(hfModel.siblings.length).toBe(fileDetails.length);
    // Every sibling must carry a real download URL, else a tap no-ops.
    expect(hfModel.siblings.every(s => !!s.url)).toBe(true);
    expect(hfModel.siblings.every(s => s.url!.includes('/resolve/'))).toBe(
      true,
    );
  });

  it('throws when fetchModelInfo fails', async () => {
    mockFetchModelInfo.mockRejectedValue(new Error('network 404'));
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    await expect(resolveHFRepo(REPO)).rejects.toThrow();
  });

  it('throws when fetchModelFilesDetails fails', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockRejectedValue(new Error('network 500'));

    await expect(resolveHFRepo(REPO)).rejects.toThrow();
  });

  it('passes the auth token through to both HF calls', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    await resolveHFRepo(REPO, 'hf_token_123');

    expect(mockFetchModelInfo).toHaveBeenCalledWith(
      expect.objectContaining({repoId: REPO, authToken: 'hf_token_123'}),
    );
    expect(mockFetchModelFilesDetails).toHaveBeenCalledWith(
      REPO,
      'hf_token_123',
    );
  });
});

describe('resolveHFModelForDownload — strict mode (no fallback)', () => {
  it('resolves the matching sibling with a non-empty /resolve/ url', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    const {hfModel, modelFile} = await resolveHFModelForDownload(REPO, FILE);

    expect(modelFile.rfilename).toBe(FILE);
    // A real download URL must be present, else the space-check no-ops.
    expect(modelFile.url).toBeTruthy();
    expect(modelFile.url).toContain('/resolve/');
    expect(modelFile.url).toContain(REPO);
    expect(modelFile.size).toBe(4096);
    // hfModel siblings must also carry populated urls.
    expect(hfModel.siblings.length).toBeGreaterThan(0);
    expect(hfModel.siblings.every(s => !!s.url)).toBe(true);
    expect(hfModel.id).toBe(REPO);
    expect(hfModel.author).toBe('author');
  });

  it('throws when no sibling matches the filename', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue([
      {path: 'something-else.gguf', size: 100},
    ]);

    await expect(resolveHFModelForDownload(REPO, FILE)).rejects.toThrow(
      /not found/i,
    );
  });

  it('rethrows when fetchModelInfo fails', async () => {
    mockFetchModelInfo.mockRejectedValue(new Error('network 404'));
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    await expect(resolveHFModelForDownload(REPO, FILE)).rejects.toThrow();
  });

  it('rethrows when fetchModelFilesDetails fails', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockRejectedValue(new Error('network 500'));

    await expect(resolveHFModelForDownload(REPO, FILE)).rejects.toThrow();
  });

  it('passes the auth token through to both HF calls', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    await resolveHFModelForDownload(REPO, FILE, 'hf_token_123');

    expect(mockFetchModelInfo).toHaveBeenCalledWith(
      expect.objectContaining({repoId: REPO, authToken: 'hf_token_123'}),
    );
    expect(mockFetchModelFilesDetails).toHaveBeenCalledWith(
      REPO,
      'hf_token_123',
    );
  });
});

describe('resolveHFModelForDownload — tolerant mode (fallback)', () => {
  const fallback = {
    author: 'fallback-author',
    size: 1234,
    downloadUrl: 'https://fallback.example/resolve/main/model.gguf',
  };

  it('tolerates a fetch failure and uses fallback values', async () => {
    mockFetchModelInfo.mockRejectedValue(new Error('network'));
    mockFetchModelFilesDetails.mockRejectedValue(new Error('network'));

    const {hfModel, modelFile} = await resolveHFModelForDownload(
      REPO,
      FILE,
      undefined,
      fallback,
    );

    expect(modelFile.url).toBe(fallback.downloadUrl);
    expect(modelFile.size).toBe(fallback.size);
    expect(hfModel.author).toBe('fallback-author');
  });

  it('tolerates an unmatched filename without throwing', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue([
      {path: 'unrelated.gguf', size: 9},
    ]);

    const {modelFile} = await resolveHFModelForDownload(
      REPO,
      FILE,
      undefined,
      fallback,
    );

    // No matching sibling -> falls back, but still yields the requested file.
    expect(modelFile.rfilename).toBe(FILE);
    expect(modelFile.url).toBe(fallback.downloadUrl);
  });

  it('still prefers the real sibling url when a match exists', async () => {
    mockFetchModelInfo.mockResolvedValue(modelInfoResponse);
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    const {modelFile} = await resolveHFModelForDownload(
      REPO,
      FILE,
      undefined,
      fallback,
    );

    expect(modelFile.url).toContain('/resolve/');
    expect(modelFile.url).not.toBe(fallback.downloadUrl);
  });

  it('keeps the real sibling url when only model info fails (partial)', async () => {
    // PalsHub tolerance: a partial response (file details succeed, model info
    // fails) must still yield the real /resolve/ URL, not collapse to fallback.
    mockFetchModelInfo.mockRejectedValue(new Error('network'));
    mockFetchModelFilesDetails.mockResolvedValue(fileDetails);

    const {hfModel, modelFile} = await resolveHFModelForDownload(
      REPO,
      FILE,
      undefined,
      fallback,
    );

    expect(modelFile.url).toContain('/resolve/');
    expect(modelFile.url).not.toBe(fallback.downloadUrl);
    // model info missing -> author falls back.
    expect(hfModel.author).toBe('fallback-author');
  });
});
