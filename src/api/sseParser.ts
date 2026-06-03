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
