import * as fs from 'fs';
import * as path from 'path';

/**
 * Unedited response bodies and event streams captured from a live llama.cpp
 * b9976 (`e3546c794`) `llama-server` in router mode.
 *
 * Nothing here is hand-authored or transcribed from llama.cpp's server README:
 * that README states the SSE event name, the `download_progress` nesting, what
 * `POST /models` returns for a bad reference and what the two terminal download
 * events mean, and each of those is contradicted by the files below. A fixture
 * written from the documentation therefore encodes the documentation's error
 * and passes.
 *
 * The files are served raw so a test projects the fields it needs in its own
 * body, where a reader can see the projection. Trimming one here would turn a
 * capture back into a hand-authored fixture.
 */
const DIR = path.join(__dirname, 'router-wire');

export type RouterWireFixture =
  | 'router-v1-models.json'
  | 'direct-v1-models.json'
  | 'direct-models-endpoint.json'
  | 'unload-not-running-400.json'
  | 'unload-not-found-400.json'
  | 'sse-load-sequence.txt'
  | 'sse-download-sequence.txt'
  | 'sse-unregistered-404.txt'
  | 'post-models-unregistered-404.txt'
  | 'sse-shifted-control-200.txt'
  | 'sse-unauthorized-401.txt'
  | 'sse-authorized-control-200.txt';

export function routerWireText(name: RouterWireFixture): string {
  return fs.readFileSync(path.join(DIR, name), 'utf8');
}

export function routerWireJson<T = any>(name: RouterWireFixture): T {
  return JSON.parse(routerWireText(name));
}

/**
 * The `data:` payloads of a captured stream, in arrival order, parsed but
 * otherwise untouched.
 */
export function routerWireEvents(name: RouterWireFixture): any[] {
  return routerWireText(name)
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)));
}

/**
 * The status line and body of a captured `curl -i` response.
 */
export function routerWireResponse(name: RouterWireFixture): {
  status: number;
  headers: Record<string, string>;
  body: string;
} {
  const raw = routerWireText(name);
  const separator = raw.indexOf('\n\n');
  const head = separator === -1 ? raw : raw.slice(0, separator);
  const body = separator === -1 ? '' : raw.slice(separator + 2);
  const [statusLine, ...headerLines] = head.split('\n').filter(Boolean);
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      headers[line.slice(0, colon).trim().toLowerCase()] = line
        .slice(colon + 1)
        .trim();
    }
  }
  return {
    status: parseInt(statusLine.split(' ')[1], 10),
    headers,
    body,
  };
}
