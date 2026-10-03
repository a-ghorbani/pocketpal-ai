import {
  resolveRequestTimeout,
  StopSequenceMatcher,
  xhrHttpError,
} from '../xhrStream';

describe('xhrStream helpers', () => {
  it('normalizes request timeouts', () => {
    expect(resolveRequestTimeout(undefined, 30)).toBe(30);
    expect(resolveRequestTimeout(0, 30)).toBe(30);
    expect(resolveRequestTimeout(Number.POSITIVE_INFINITY, 30)).toBe(30);
    expect(resolveRequestTimeout(12, 30)).toBe(12);
  });

  it('parses bounded HTTP errors safely', () => {
    expect(xhrHttpError(401, '{"error":"secret"}').message).toBe(
      'Unauthorized: Invalid or missing API key',
    );
    expect(xhrHttpError(429, '{"error":{"message":"slow down"}}').message).toBe(
      'Server error: 429 — slow down',
    );
    expect(xhrHttpError(500, '<html>bad</html>').message).toBe(
      'Server error: 500 — <html>bad</html>',
    );
  });

  it('holds possible stop suffixes and chooses overlapping matches', () => {
    const matcher = new StopSequenceMatcher(['STOP', 'STOP!']);
    expect(matcher.project('hello ST')).toEqual({content: 'hello '});
    expect(matcher.project('hello STOP! trailing')).toEqual({
      content: 'hello ',
      matched: 'STOP!',
    });
  });
});
