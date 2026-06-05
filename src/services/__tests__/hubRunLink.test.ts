/**
 * parseHubRunURL — the single parse/validate site for the hub/run deep link.
 *
 * Covers: valid link, wrong host, wrong path, malformed/missing repo_id,
 * optional filename (absent / non-.gguf are normal successes), source
 * passthrough/absent, whitespace trimming.
 */

import {isHubLink, parseHubRunURL} from '../hubRunLink';

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

  it('returns null when repo_id contains path-traversal segments', () => {
    expect(
      parseHubRunURL('pocketpal://hub/run?repo_id=../x&filename=x.gguf'),
    ).toBeNull();
    expect(
      parseHubRunURL('pocketpal://hub/run?repo_id=a/..&filename=x.gguf'),
    ).toBeNull();
  });

  it('returns null when repo_id has more than two segments', () => {
    expect(
      parseHubRunURL('pocketpal://hub/run?repo_id=a/b/c&filename=x.gguf'),
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

  it('accepts a link with no filename (filename is optional)', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&source=hf',
    );
    expect(result).toEqual({
      repoId: 'author/model',
      filename: undefined,
      source: 'hf',
    });
  });

  it('accepts a non-.gguf filename and keeps it verbatim', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&filename=model.bin',
    );
    expect(result).toEqual({
      repoId: 'author/model',
      filename: 'model.bin',
      source: undefined,
    });
  });

  it('keeps a present filename verbatim', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&filename=model.GGUF',
    );
    expect(result?.filename).toBe('model.GGUF');
  });

  it('treats a blank filename param as absent', () => {
    const result = parseHubRunURL(
      'pocketpal://hub/run?repo_id=author/model&filename=%20%20',
    );
    expect(result?.filename).toBeUndefined();
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

describe('isHubLink', () => {
  it('is true for any host=hub URL regardless of path', () => {
    expect(isHubLink('pocketpal://hub/run?repo_id=a/b')).toBe(true);
    expect(isHubLink('pocketpal://hub/foo')).toBe(true);
    expect(isHubLink('pocketpal://hub')).toBe(true);
  });

  it('is false for non-hub hosts', () => {
    expect(isHubLink('pocketpal://chat?palId=x')).toBe(false);
    expect(isHubLink('pocketpal://memory')).toBe(false);
    expect(isHubLink('pocketpal://e2e/benchmark')).toBe(false);
  });

  it('is false for an unparseable URL', () => {
    expect(isHubLink('not a url at all')).toBe(false);
  });
});
