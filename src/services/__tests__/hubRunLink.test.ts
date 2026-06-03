/**
 * parseHubRunURL — the single parse/validate site for the hub/run deep link.
 *
 * Covers: valid link, wrong host, wrong path, malformed repo_id, non-.gguf
 * filename, missing filename, missing repo_id, source passthrough/absent.
 */

import {parseHubRunURL} from '../hubRunLink';

describe('parseHubRunURL', () => {
  it('parses a valid hub/run link with all params', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&filename=model.Q4_K_M.gguf&source=hf',
    );
    expect(result).toEqual({
      repoId: 'author/model',
      filename: 'model.Q4_K_M.gguf',
      source: 'hf',
    });
  });

  it('returns null for the wrong host', () => {
    expect(
      parseHubRunURL(
        'pocketpal://chat/run?repo_id=author/model&filename=x.gguf',
      ),
    ).toBeNull();
  });

  it('returns null for the wrong path', () => {
    expect(
      parseHubRunURL(
        'pocketpal://hub/download?repo_id=author/model&filename=x.gguf',
      ),
    ).toBeNull();
  });

  it('returns null when repo_id has no slash (malformed)', () => {
    expect(
      parseHubRunURL('pocketpal://hub/run?repo_id=authormodel&filename=x.gguf'),
    ).toBeNull();
  });

  it('returns null when repo_id has an empty half', () => {
    expect(
      parseHubRunURL('pocketpal://hub/run?repo_id=author/&filename=x.gguf'),
    ).toBeNull();
  });

  it('returns null when the filename is not a .gguf', () => {
    expect(
      parseHubRunURL(
        'pocketpal://hub/run?repo_id=author/model&filename=model.bin',
      ),
    ).toBeNull();
  });

  it('returns null when filename is missing', () => {
    expect(
      parseHubRunURL('pocketpal://hub/run?repo_id=author/model'),
    ).toBeNull();
  });

  it('returns null when repo_id is missing', () => {
    expect(
      parseHubRunURL('pocketpal://hub/run?filename=model.gguf'),
    ).toBeNull();
  });

  it('returns null for an unparseable URL string', () => {
    expect(parseHubRunURL('not a url at all')).toBeNull();
  });

  it('accepts a .GGUF filename case-insensitively', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&filename=model.GGUF',
    );
    expect(result).not.toBeNull();
    expect(result?.filename).toBe('model.GGUF');
  });

  it('leaves source undefined when the source param is absent', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&filename=model.gguf',
    );
    expect(result).toEqual({
      repoId: 'author/model',
      filename: 'model.gguf',
      source: undefined,
    });
  });

  it('passes an arbitrary source value through unvalidated', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&filename=model.gguf&source=anything-goes',
    );
    expect(result?.source).toBe('anything-goes');
  });

  it('trims whitespace around repo_id and filename', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=%20author/model%20&filename=%20model.gguf%20',
    );
    expect(result).toEqual({
      repoId: 'author/model',
      filename: 'model.gguf',
      source: undefined,
    });
  });
});
