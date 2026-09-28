import fs from 'fs';
import path from 'path';

import {
  FramedSSEParser,
  parseSSELine,
  SSEParser,
  SSEProtocolError,
} from '../sseParser';

describe('parseSSELine', () => {
  it('parses a valid data line with JSON', () => {
    const result = parseSSELine(
      'data: {"choices":[{"delta":{"content":"hello"}}]}',
    );
    expect(result).toEqual({choices: [{delta: {content: 'hello'}}]});
  });

  it('returns "done" for [DONE] signal', () => {
    const result = parseSSELine('data: [DONE]');
    expect(result).toBe('done');
  });

  it('returns null for malformed JSON', () => {
    const result = parseSSELine('data: {not-valid-json}');
    expect(result).toBeNull();
  });

  it('returns null for non-data lines', () => {
    expect(parseSSELine('event: message')).toBeNull();
    expect(parseSSELine(': comment')).toBeNull();
    expect(parseSSELine('id: 123')).toBeNull();
    expect(parseSSELine('')).toBeNull();
  });

  it('handles data line with extra whitespace', () => {
    const result = parseSSELine('data: [DONE]  ');
    expect(result).toBe('done');
  });

  it('handles data line with empty JSON object', () => {
    const result = parseSSELine('data: {}');
    expect(result).toEqual({});
  });
});

describe('SSEParser', () => {
  let parser: SSEParser;

  beforeEach(() => {
    parser = new SSEParser();
  });

  describe('feed()', () => {
    it('yields parsed events from a single chunk with multiple events', () => {
      const chunk =
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n';
      const events = [...parser.feed(chunk)];
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({choices: [{delta: {content: 'Hello'}}]});
      expect(events[1]).toEqual({choices: [{delta: {content: ' world'}}]});
    });

    it('skips empty lines between events', () => {
      const chunk = 'data: {"a":1}\n\n\n\ndata: {"b":2}\n\n';
      const events = [...parser.feed(chunk)];
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({a: 1});
      expect(events[1]).toEqual({b: 2});
    });

    it('handles [DONE] in feed', () => {
      const chunk = 'data: {"a":1}\n\ndata: [DONE]\n\n';
      const events = [...parser.feed(chunk)];
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({a: 1});
      expect(events[1]).toBe('done');
    });

    it('skips malformed JSON lines', () => {
      const chunk = 'data: {bad-json}\n\ndata: {"good":true}\n\n';
      const events = [...parser.feed(chunk)];
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({good: true});
    });

    it('skips non-data lines like comments and event lines', () => {
      const chunk =
        ': this is a comment\nevent: message\ndata: {"value":42}\n\n';
      const events = [...parser.feed(chunk)];
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({value: 42});
    });
  });

  describe('FramedSSEParser', () => {
    const fixture = fs.readFileSync(
      path.join(__dirname, 'fixtures/responses/representative.sse'),
      'utf8',
    );
    const expected = [
      {
        event: 'response.output_text.delta',
        data: {type: 'response.output_text.delta', delta: 'Hi 👋'},
      },
      {
        event: 'response.completed',
        data: {
          type: 'response.completed',
          response: {id: 'resp_sanitized'},
        },
      },
    ];

    function parseChunks(chunks: string[]) {
      const framedParser = new FramedSSEParser();
      return [
        ...chunks.flatMap(chunk => [...framedParser.feed(chunk)]),
        ...framedParser.flush(),
      ];
    }

    it('parses event/data fields, comments, optional spaces and multiline data', () => {
      expect(parseChunks([fixture])).toEqual(expected);
    });

    it('supports CRLF framing', () => {
      expect(parseChunks([fixture.replace(/\n/g, '\r\n')])).toEqual(expected);
    });

    it('parses the fixture at every two-chunk character boundary', () => {
      for (let split = 0; split <= fixture.length; split++) {
        expect(
          parseChunks([fixture.slice(0, split), fixture.slice(split)]),
        ).toEqual(expected);
      }
    });

    it('parses one JS character per chunk, including a split surrogate pair', () => {
      const chunks = Array.from({length: fixture.length}, (_, index) =>
        fixture.slice(index, index + 1),
      );
      expect(parseChunks(chunks)).toEqual(expected);
    });

    it('flushes an unterminated final event', () => {
      expect(parseChunks(['event: response.test\ndata: {"ok":true}'])).toEqual([
        {event: 'response.test', data: {ok: true}},
      ]);
    });

    it('ignores comment-only keepalive frames', () => {
      expect(parseChunks([': ping\n\n: another\n\n'])).toEqual([]);
    });

    it('surfaces malformed required JSON as a protocol error', () => {
      const framedParser = new FramedSSEParser();
      expect(() => [
        ...framedParser.feed('event: response.test\ndata: {bad}\n\n'),
      ]).toThrow(SSEProtocolError);

      try {
        [
          ...new FramedSSEParser().feed(
            'event: response.test\ndata: {bad}\n\n',
          ),
        ];
      } catch (error) {
        const enumerableError = {...(error as SSEProtocolError)};
        expect(error).toMatchObject({
          name: 'SSEProtocolError',
          event: 'response.test',
          data: '{bad}',
        });
        expect(Object.keys(error as SSEProtocolError)).not.toContain('data');
        expect(enumerableError).not.toHaveProperty('data');
        expect(JSON.stringify(error)).not.toContain('{bad}');
      }
    });
  });

  describe('cross-chunk buffering', () => {
    it('buffers incomplete lines across two feed() calls', () => {
      // First chunk ends mid-line
      const events1 = [...parser.feed('data: {"choices":[{"del')];
      expect(events1).toHaveLength(0);

      // Second chunk completes the line
      const events2 = [...parser.feed('ta":{"content":"hello"}}]}\n\n')];
      expect(events2).toHaveLength(1);
      expect(events2[0]).toEqual({
        choices: [{delta: {content: 'hello'}}],
      });
    });

    it('handles chunk split at newline boundary', () => {
      const events1 = [...parser.feed('data: {"a":1}\n')];
      expect(events1).toHaveLength(1);
      expect(events1[0]).toEqual({a: 1});

      const events2 = [...parser.feed('data: {"b":2}\n\n')];
      expect(events2).toHaveLength(1);
      expect(events2[0]).toEqual({b: 2});
    });

    it('handles three-way split across chunks', () => {
      const events1 = [...parser.feed('data: {"ch')];
      expect(events1).toHaveLength(0);

      const events2 = [...parser.feed('oices":[{"de')];
      expect(events2).toHaveLength(0);

      const events3 = [...parser.feed('lta":{"content":"x"}}]}\n\n')];
      expect(events3).toHaveLength(1);
      expect(events3[0]).toEqual({choices: [{delta: {content: 'x'}}]});
    });
  });

  describe('flush()', () => {
    it('processes remaining data in the buffer', () => {
      // Feed a chunk without trailing newline
      const feedEvents = [...parser.feed('data: {"remaining":true}')];
      expect(feedEvents).toHaveLength(0);

      // Flush should process the remaining buffer
      const flushEvents = [...parser.flush()];
      expect(flushEvents).toHaveLength(1);
      expect(flushEvents[0]).toEqual({remaining: true});
    });

    it('returns empty when buffer is empty', () => {
      const events = [...parser.flush()];
      expect(events).toHaveLength(0);
    });

    it('returns empty when buffer contains only whitespace', () => {
      parser.feed('  \n\n  ');
      const events = [...parser.flush()];
      expect(events).toHaveLength(0);
    });

    it('clears the buffer after flush', () => {
      // Must consume the generator from feed() so the buffer is populated
      const feedEvents = [...parser.feed('data: {"a":1}')];
      expect(feedEvents).toHaveLength(0); // No newline, so nothing yielded

      const events1 = [...parser.flush()];
      expect(events1).toHaveLength(1);

      // Second flush should yield nothing since buffer was cleared
      const events2 = [...parser.flush()];
      expect(events2).toHaveLength(0);
    });
  });
});
