/**
 * A ring buffer of voice-mode events for device runs, one compact line per
 * event: `<ms since session start> <event> key=value ...`. It records only in
 * dev and E2E builds; in production every call returns at once.
 */
type TraceValue = string | number | boolean | null | undefined;

const CAPACITY = 300;
const LIBRARY_STREAM_LOG = '[EngineStream][Engine] ';

const lines: string[] = [];
let next = 0;
let t0 = Date.now();

const ENABLED = __DEV__ || __E2E__;

export function vtrace(event: string, data?: Record<string, TraceValue>): void {
  if (!ENABLED) {
    return;
  }
  let line = `${Date.now() - t0} ${event}`;
  if (data) {
    for (const key in data) {
      line += ` ${key}=${data[key]}`;
    }
  }
  if (lines.length < CAPACITY) {
    lines.push(line);
  } else {
    lines[next] = line;
  }
  next = (next + 1) % CAPACITY;
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    console.log(`[voiceTrace] ${line}`);
  }
}

/** Times later events from now. */
export function startVoiceTrace(): void {
  t0 = Date.now();
}

export function dumpVoiceTrace(): string {
  const ordered =
    lines.length < CAPACITY
      ? lines
      : [...lines.slice(next), ...lines.slice(0, next)];
  return ordered.join('\n');
}

export function clearVoiceTrace(): void {
  lines.length = 0;
  next = 0;
  t0 = Date.now();
}

// A Release E2E build has no console to read, so the speech library's
// per-chunk stream lines (chunk start, played, session end) go to the trace.
if (__E2E__ && !__DEV__) {
  const log = console.log;
  console.log = (...args: unknown[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.startsWith(LIBRARY_STREAM_LOG)) {
      vtrace('lib', {
        m: message.slice(
          LIBRARY_STREAM_LOG.length,
          LIBRARY_STREAM_LOG.length + 100,
        ),
      });
    }
    log(...args);
  };
}
