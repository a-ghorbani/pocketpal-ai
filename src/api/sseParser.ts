/**
 * Parses a single SSE line: "data: {json}" -> object, "data: [DONE]" -> 'done', other -> null
 */
export function parseSSELine(line: string): object | null | 'done' {
  if (!line.startsWith('data: ')) {
    return null;
  }
  const data = line.slice(6).trim();
  if (data === '[DONE]') {
    return 'done';
  }
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Stateful SSE parser that handles incomplete lines split across chunks.
 * Usage: create once per stream, call feed() for each chunk.
 */
export class SSEParser {
  private buffer = '';

  /**
   * Feed a chunk of SSE data. Yields parsed events.
   * Buffers incomplete lines across calls (handles chunks split mid-line).
   */
  *feed(chunk: string): Generator<object | 'done'> {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    // Last element may be incomplete (no trailing newline) - keep it in buffer
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue; // Skip empty lines between events
      }
      const result = parseSSELine(trimmed);
      if (result !== null) {
        yield result;
      }
    }
  }

  /** Flush any remaining data in the buffer (call at end of stream). */
  *flush(): Generator<object | 'done'> {
    if (this.buffer.trim()) {
      const result = parseSSELine(this.buffer.trim());
      if (result !== null) {
        yield result;
      }
    }
    this.buffer = '';
  }
}

export interface FramedSSEEvent<T = unknown> {
  event?: string;
  data: T;
}

export class SSEProtocolError extends Error {
  readonly event?: string;
  readonly data!: string;

  constructor(message: string, data: string, event?: string) {
    super(message);
    this.name = 'SSEProtocolError';
    this.event = event;
    Object.defineProperty(this, 'data', {
      value: data,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

/**
 * Parses framed SSE events whose data payload is required to be JSON.
 * Unlike SSEParser, malformed data is a protocol failure rather than ignored.
 */
export class FramedSSEParser<T = unknown> {
  private buffer = '';
  private event?: string;
  private dataLines: string[] = [];

  *feed(chunk: string): Generator<FramedSSEEvent<T>> {
    this.buffer += chunk;

    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      let line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }
      yield* this.processLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
  }

  *flush(): Generator<FramedSSEEvent<T>> {
    if (this.buffer.length > 0) {
      const line = this.buffer.endsWith('\r')
        ? this.buffer.slice(0, -1)
        : this.buffer;
      this.buffer = '';
      yield* this.processLine(line);
    }
    yield* this.dispatch();
  }

  private *processLine(line: string): Generator<FramedSSEEvent<T>> {
    if (line === '') {
      yield* this.dispatch();
      return;
    }
    if (line.startsWith(':')) {
      return;
    }

    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    if (field === 'event') {
      this.event = value;
    } else if (field === 'data') {
      this.dataLines.push(value);
    }
  }

  private *dispatch(): Generator<FramedSSEEvent<T>> {
    if (this.dataLines.length === 0) {
      this.event = undefined;
      return;
    }

    const event = this.event;
    const data = this.dataLines.join('\n');
    this.event = undefined;
    this.dataLines = [];

    try {
      yield {event, data: JSON.parse(data) as T};
    } catch {
      throw new SSEProtocolError(
        `Malformed JSON in SSE${event ? ` event "${event}"` : ' event'}`,
        data,
        event,
      );
    }
  }
}
