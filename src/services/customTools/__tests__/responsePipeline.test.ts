import {evaluateJsonPath} from '../jsonPath';
import {redact} from '../redact';
import {runResponsePipeline} from '../responsePipeline';

const UNTRUSTED_MARKER = 'BEGIN UNTRUSTED WEB CONTENT';

const okSummary = (result: ReturnType<typeof runResponsePipeline>): string => {
  expect(result.ok).toBe(true);
  return result.ok ? result.summary : '';
};

describe('evaluateJsonPath', () => {
  it('resolves the root, nested keys and indexes', () => {
    expect(evaluateJsonPath(42, '$')).toEqual({found: true, value: 42});
    expect(evaluateJsonPath({a: {b: 2}}, '$.a.b')).toEqual({
      found: true,
      value: 2,
    });
    expect(evaluateJsonPath({a: [7, 8]}, '$.a[1]')).toEqual({
      found: true,
      value: 8,
    });
  });

  it('flattens [*] into an array', () => {
    expect(evaluateJsonPath({a: [1, 2, 3]}, '$.a[*]')).toEqual({
      found: true,
      value: [1, 2, 3],
    });
  });

  it('treats a missing key, an out-of-range index and a bad path as misses', () => {
    expect(evaluateJsonPath({a: 1}, '$.b')).toEqual({found: false});
    expect(evaluateJsonPath({a: [1]}, '$.a[5]')).toEqual({found: false});
    expect(evaluateJsonPath({a: 1}, 'a')).toEqual({found: false});
    expect(evaluateJsonPath({a: 1}, '$.a[*]')).toEqual({found: false});
  });
});

describe('redact', () => {
  it('replaces the raw and the percent-encoded form of every secret', () => {
    const text = 'key k-12345 and k-12345%21 plus k%2D12345';
    const out = redact(text, ['k-12345', 'k-12345!']);
    expect(out).not.toContain('k-12345');
    expect(out).toContain('[redacted]');
  });

  it('is a no-op when there are no secrets', () => {
    expect(redact('plain', [])).toBe('plain');
  });
});

describe('runResponsePipeline', () => {
  const nineResults = Array.from({length: 9}, (_unused, index) => ({
    title: `T${index + 1}`,
    url: `u${index + 1}`,
    x: index,
  }));

  it('runs extract, fields, maxItems and template in order, then wraps', () => {
    const body = JSON.stringify({data: {results: nineResults}});
    const summary = okSummary(
      runResponsePipeline(body, {
        extract: '$.data.results[*]',
        fields: ['title', 'url'],
        maxItems: 5,
        template: '{{title}} — {{url}}',
      }),
    );

    expect(summary).toContain(UNTRUSTED_MARKER);
    expect(summary).toContain('T1 — u1');
    expect(summary).toContain('T5 — u5');
    expect(summary).not.toContain('T6');
    expect(summary).not.toContain('"x"');
  });

  it('passes the raw body through when no JSON step is configured', () => {
    const summary = okSummary(runResponsePipeline('plain text', undefined));
    expect(summary).toContain('plain text');
    expect(summary).toContain(UNTRUSTED_MARKER);
  });

  it('reports an empty body as such when no JSON step is configured', () => {
    expect(okSummary(runResponsePipeline('', undefined))).toContain(
      '(empty response)',
    );
  });

  it('fails with invalid_json when a JSON step meets a bad or empty body', () => {
    expect(runResponsePipeline('not json', {extract: '$.a'})).toEqual({
      ok: false,
      reason: 'invalid_json',
    });
    expect(runResponsePipeline('', {extract: '$.a'})).toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });

  it('fails with extract_miss when the path matches nothing', () => {
    expect(
      runResponsePipeline(JSON.stringify({a: 1}), {extract: '$.missing'}),
    ).toEqual({ok: false, reason: 'extract_miss'});
  });

  it('redacts an echoed secret in both raw and URL-encoded form', () => {
    const body = JSON.stringify({echo: 'k-12345', q: 'k-12345%21'});
    const summary = okSummary(
      runResponsePipeline(body, undefined, ['k-12345', 'k-12345!']),
    );
    expect(summary).not.toContain('k-12345');
    expect(summary).toContain('[redacted]');
  });

  it('defaults to ten items and stringifies each one without a template', () => {
    const body = JSON.stringify(nineResults.concat(nineResults));
    const summary = okSummary(runResponsePipeline(body, {extract: '$[*]'}));
    expect(
      summary.split('\n').filter(line => line.includes('"title"')),
    ).toHaveLength(10);
  });

  it('reports an empty item list distinctly', () => {
    const summary = okSummary(
      runResponsePipeline(JSON.stringify({a: []}), {extract: '$.a[*]'}),
    );
    expect(summary).toContain('(no items)');
  });

  it('truncates at maxChars with a marker, after redaction', () => {
    const body = 'x'.repeat(500);
    const summary = okSummary(
      runResponsePipeline(body, {maxChars: 100, wrapUntrusted: false}),
    );
    expect(summary).toHaveLength(100 + '\n…(truncated)'.length);
    expect(summary).toContain('…(truncated)');
  });

  it('honours wrapUntrusted:false but wraps on every other success path', () => {
    expect(
      okSummary(runResponsePipeline('body', {wrapUntrusted: false})),
    ).not.toContain(UNTRUSTED_MARKER);
    expect(okSummary(runResponsePipeline('body', {}))).toContain(
      UNTRUSTED_MARKER,
    );
  });

  it('leaves a non-object item untouched when picking fields', () => {
    const summary = okSummary(
      runResponsePipeline(JSON.stringify(['raw', {title: 'T'}]), {
        extract: '$[*]',
        fields: ['title'],
      }),
    );
    expect(summary).toContain('"raw"');
  });
});
