import * as http from 'http';
import {AddressInfo} from 'net';

export const DEFAULT_REMOTE_FIXTURE_PORT = 18080;
export const RESPONSES_MODEL_ID = 'fixture-responses-only';
export const CHAT_MODEL_ID = 'fixture-chat-only';
export const UNSUPPORTED_MODEL_ID = 'fixture-unsupported';

export interface FixtureRequest {
  id: number;
  method: string;
  path: string;
  headers: Record<string, string | string[]>;
  authorizationPresent: boolean;
  authorizationScheme?: string;
  body?: unknown;
  scenario?: string;
  completed: boolean;
  aborted: boolean;
}

export interface FixtureState {
  requestCount: number;
  requests: FixtureRequest[];
  toolReplayValidated: boolean;
  scoutToolsValidated: boolean;
  scoutCalculateValidated: boolean;
  scoutHtmlValidated: boolean;
  scoutSearchValidated: boolean;
}

export interface RemoteFixtureServer {
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly url: string;
  readonly state: FixtureState;
  close(): Promise<void>;
}

interface StartOptions {
  port?: number;
  host?: '127.0.0.1';
}

const MODEL_ROWS = [
  {
    id: RESPONSES_MODEL_ID,
    object: 'model',
    owned_by: 'fixture',
    name: 'Responses-only fixture',
    supported_endpoints: ['/responses'],
    capabilities: {
      type: 'chat',
      supports: {
        tool_calls: true,
        structured_outputs: true,
        vision: false,
        reasoning_effort: ['low', 'medium', 'high'],
      },
      limits: {
        max_context_window_tokens: 16384,
        max_output_tokens: 2048,
      },
    },
  },
  {
    id: CHAT_MODEL_ID,
    object: 'model',
    owned_by: 'fixture',
    name: 'Chat-only fixture',
    supported_endpoints: ['/chat/completions'],
    capabilities: {
      type: 'chat',
      supports: {
        tool_calls: false,
        structured_outputs: false,
        vision: false,
      },
      limits: {
        max_context_window_tokens: 8192,
        max_output_tokens: 1024,
      },
    },
  },
  {
    id: UNSUPPORTED_MODEL_ID,
    object: 'model',
    owned_by: 'fixture',
    name: 'Unsupported fixture',
    supported_endpoints: ['/embeddings'],
    capabilities: {
      type: 'embedding',
      supports: {},
      limits: {max_context_window_tokens: 4096},
    },
  },
];

const json = (
  response: http.ServerResponse,
  statusCode: number,
  value: unknown,
): void => {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
};

const safeHeaders = (
  headers: http.IncomingHttpHeaders,
): Record<string, string | string[]> =>
  Object.fromEntries(
    Object.entries(headers)
      .filter(
        ([name, value]) =>
          value !== undefined &&
          name !== 'authorization' &&
          name !== 'proxy-authorization' &&
          name !== 'cookie',
      )
      .map(([name, value]) => [name, value as string | string[]]),
  );

const authorizationMetadata = (
  headers: http.IncomingHttpHeaders,
): Pick<FixtureRequest, 'authorizationPresent' | 'authorizationScheme'> => {
  const value = headers.authorization;
  if (!value) {
    return {authorizationPresent: false};
  }
  return {
    authorizationPresent: true,
    authorizationScheme: value.split(/\s+/, 1)[0],
  };
};

const readBody = async (request: http.IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const inputText = (body: any): string => {
  const input = Array.isArray(body?.input) ? body.input : [];
  const userInputs = input
    .filter((item: any) => item?.role === 'user')
    .map((item: any) =>
      typeof item.content === 'string'
        ? item.content
        : Array.isArray(item.content)
          ? item.content.map((part: any) => part?.text || '').join(' ')
          : '',
    );
  return userInputs.at(-1) || '';
};

const scenarioFor = (body: any): string => {
  const prompt = inputText(body).toLowerCase();
  for (const scenario of [
    'reasoning',
    'final-only',
    'scout-calculate',
    'scout-html',
    'scout-search',
    'tool',
    'structured-json',
    'refusal',
    'incomplete',
    'failure',
    'slow',
  ]) {
    if (prompt.includes(`fixture:${scenario}`)) {
      return scenario;
    }
  }
  return 'incremental';
};

const event = (type: string, fields: Record<string, unknown>): string =>
  `event: ${type}\ndata: ${JSON.stringify({type, ...fields})}\n\n`;

const message = (text: string, id = 'msg-fixture') => ({
  type: 'message',
  id,
  role: 'assistant',
  status: 'completed',
  phase: 'final_answer',
  content: [{type: 'output_text', text}],
});

function beginSse(response: http.ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  response.flushHeaders();
}

function complete(
  response: http.ServerResponse,
  output: unknown[],
  usage = {input_tokens: 11, output_tokens: 7, total_tokens: 18},
): void {
  response.write(
    event('response.completed', {
      response: {id: 'resp-fixture', status: 'completed', output, usage},
    }),
  );
  response.end();
}

function streamText(
  response: http.ServerResponse,
  text: string,
  chunks: string[],
  delayMs = 0,
): void {
  response.write(
    event('response.output_item.added', {
      output_index: 0,
      item: {
        type: 'message',
        id: 'msg-fixture',
        role: 'assistant',
        status: 'in_progress',
        content: [{type: 'output_text', text: ''}],
      },
    }),
  );
  const writeDelta = (delta: string) => {
    response.write(
      event('response.output_text.delta', {
        item_id: 'msg-fixture',
        output_index: 0,
        content_index: 0,
        delta,
      }),
    );
  };
  if (delayMs === 0) {
    chunks.forEach(writeDelta);
    complete(response, [message(text)]);
    return;
  }
  let index = 0;
  const timer = setInterval(() => {
    if (response.destroyed) {
      clearInterval(timer);
      return;
    }
    writeDelta(chunks[index]);
    index += 1;
    if (index === chunks.length) {
      clearInterval(timer);
      setTimeout(() => {
        if (!response.destroyed) {
          complete(response, [message(text)]);
        }
      }, delayMs);
    }
  }, delayMs);
}

function validateToolReplay(body: any): {ok: boolean; detail: string} {
  const input = Array.isArray(body?.input) ? body.input : [];
  const call = input.find((item: any) => item?.type === 'function_call');
  const output = input.find(
    (item: any) => item?.type === 'function_call_output',
  );
  const expectedArguments = '{"expression":"6*7"}';
  if (
    call?.call_id !== 'call-calculate-42' ||
    call?.name !== 'calculate' ||
    call?.arguments !== expectedArguments
  ) {
    return {ok: false, detail: 'function_call replay did not match'};
  }
  if (
    output?.call_id !== 'call-calculate-42' ||
    output?.output !== 'Talent "calculate" is not enabled for this Pal'
  ) {
    return {ok: false, detail: 'function_call_output did not match'};
  }
  return {ok: true, detail: 'ok'};
}

const SCOUT_TOOL_NAMES = [
  'web_search',
  'read_url',
  'calculate',
  'datetime',
  'render_html',
].sort();

function validateScoutTools(body: any): boolean {
  const names = Array.isArray(body?.tools)
    ? body.tools
        .map((tool: any) => tool?.name)
        .filter((name: unknown): name is string => typeof name === 'string')
        .sort()
    : [];
  return JSON.stringify(names) === JSON.stringify(SCOUT_TOOL_NAMES);
}

function findToolReplay(
  body: any,
  callId: string,
  name: string,
): {call: any; output: any} {
  const input = Array.isArray(body?.input) ? body.input : [];
  return {
    call: input.find(
      (item: any) =>
        item?.type === 'function_call' &&
        item?.call_id === callId &&
        item?.name === name,
    ),
    output: input.find(
      (item: any) =>
        item?.type === 'function_call_output' && item?.call_id === callId,
    ),
  };
}

function streamResponsesScenario(
  response: http.ServerResponse,
  body: any,
  requestRecord: FixtureRequest,
  state: FixtureState,
): void {
  const scenario = scenarioFor(body);
  requestRecord.scenario = scenario;
  beginSse(response);

  if (scenario === 'incremental') {
    streamText(
      response,
      'Streaming fixture complete.',
      ['Streaming ', 'fixture ', 'complete.'],
      1500,
    );
    return;
  }
  if (scenario === 'reasoning') {
    response.write(
      event('response.output_item.added', {
        output_index: 0,
        item: {
          type: 'reasoning',
          id: 'reasoning-fixture',
          status: 'in_progress',
          summary: [{type: 'summary_text', text: ''}],
        },
      }),
    );
    response.write(
      event('response.reasoning_summary_text.delta', {
        item_id: 'reasoning-fixture',
        output_index: 0,
        summary_index: 0,
        delta: 'Deterministic reasoning summary.',
      }),
    );
    complete(response, [
      {
        type: 'reasoning',
        id: 'reasoning-fixture',
        status: 'completed',
        summary: [
          {type: 'summary_text', text: 'Deterministic reasoning summary.'},
        ],
      },
      message('Reasoning fixture answer.', 'msg-reasoning'),
    ]);
    return;
  }
  if (scenario === 'final-only') {
    complete(response, [message('Final-only fixture output.')]);
    return;
  }
  if (scenario === 'structured-json') {
    streamText(response, '{"answer":42,"source":"fixture"}', [
      '{"answer":42,',
      '"source":"fixture"}',
    ]);
    return;
  }
  if (scenario === 'refusal') {
    complete(response, [
      {
        type: 'message',
        id: 'msg-refusal',
        role: 'assistant',
        status: 'completed',
        content: [{type: 'refusal', refusal: 'Synthetic fixture refusal.'}],
      },
    ]);
    return;
  }
  if (scenario === 'incomplete') {
    response.write(
      event('response.incomplete', {
        response: {
          id: 'resp-incomplete',
          status: 'incomplete',
          output: [message('Partial fixture output.')],
          incomplete_details: {reason: 'max_output_tokens'},
        },
      }),
    );
    response.end();
    return;
  }
  if (scenario === 'failure') {
    response.write(
      event('response.failed', {
        response: {
          id: 'resp-failed',
          status: 'failed',
          output: [],
          error: {
            code: 'fixture_failure',
            message: 'Synthetic fixture failure',
          },
        },
      }),
    );
    response.end();
    return;
  }
  if (scenario === 'scout-calculate') {
    state.scoutToolsValidated =
      state.scoutToolsValidated || validateScoutTools(body);
    const {call, output} = findToolReplay(
      body,
      'call-scout-calculate',
      'calculate',
    );
    if (output) {
      state.scoutCalculateValidated =
        call?.arguments === '{"expression":"6*7"}' &&
        output.output === '6*7 = 42';
      complete(response, [message('Scout calculated 42.')]);
      return;
    }
    complete(response, [
      {
        type: 'function_call',
        id: 'fc-scout-calculate',
        call_id: 'call-scout-calculate',
        name: 'calculate',
        arguments: '{"expression":"6*7"}',
        status: 'completed',
      },
    ]);
    return;
  }
  if (scenario === 'scout-html') {
    state.scoutToolsValidated =
      state.scoutToolsValidated || validateScoutTools(body);
    const {call, output} = findToolReplay(
      body,
      'call-scout-html',
      'render_html',
    );
    if (output) {
      const args = JSON.parse(call?.arguments || '{}');
      state.scoutHtmlValidated =
        args.title === 'Scout fixture' &&
        args.html === '<h1>Scout works</h1>' &&
        typeof output.output === 'string' &&
        output.output.includes('[render_html SUCCESS]');
      complete(response, [message('Scout rendered HTML.')]);
      return;
    }
    complete(response, [
      {
        type: 'function_call',
        id: 'fc-scout-html',
        call_id: 'call-scout-html',
        name: 'render_html',
        arguments: JSON.stringify({
          title: 'Scout fixture',
          html: '<h1>Scout works</h1>',
        }),
        status: 'completed',
      },
    ]);
    return;
  }
  if (scenario === 'scout-search') {
    state.scoutToolsValidated =
      state.scoutToolsValidated || validateScoutTools(body);
    const {call, output} = findToolReplay(
      body,
      'call-scout-search',
      'web_search',
    );
    if (output) {
      state.scoutSearchValidated =
        call?.arguments === '{"query":"PocketPal latest news"}' &&
        /^web_search: .+ not enabled$/.test(output.output);
      complete(response, [message('Scout search failure replayed.')]);
      return;
    }
    complete(response, [
      {
        type: 'function_call',
        id: 'fc-scout-search',
        call_id: 'call-scout-search',
        name: 'web_search',
        arguments: '{"query":"PocketPal latest news"}',
        status: 'completed',
      },
    ]);
    return;
  }
  if (scenario === 'tool') {
    const hasOutput = Array.isArray(body?.input)
      ? body.input.some((item: any) => item?.type === 'function_call_output')
      : false;
    if (hasOutput) {
      const validation = validateToolReplay(body);
      state.toolReplayValidated = validation.ok;
      if (!validation.ok) {
        response.write(
          event('error', {
            error: {code: 'tool_replay_mismatch', message: validation.detail},
          }),
        );
        response.end();
        return;
      }
      complete(response, [
        message('Rejected tool outcome replayed exactly once.'),
      ]);
      return;
    }
    complete(response, [
      {
        type: 'function_call',
        id: 'fc-fixture',
        call_id: 'call-calculate-42',
        name: 'calculate',
        arguments: '{"expression":"6*7"}',
        status: 'completed',
      },
    ]);
    return;
  }

  response.write(
    event('response.output_item.added', {
      output_index: 0,
      item: {
        type: 'message',
        id: 'msg-slow',
        role: 'assistant',
        status: 'in_progress',
        content: [{type: 'output_text', text: ''}],
      },
    }),
  );
  response.write(
    event('response.output_text.delta', {
      item_id: 'msg-slow',
      output_index: 0,
      content_index: 0,
      delta: 'Slow fixture started. ',
    }),
  );
  let count = 0;
  const timer = setInterval(() => {
    if (response.destroyed) {
      clearInterval(timer);
      return;
    }
    count += 1;
    response.write(
      event('response.output_text.delta', {
        item_id: 'msg-slow',
        output_index: 0,
        content_index: 0,
        delta: `tick-${count} `,
      }),
    );
    if (count === 120) {
      clearInterval(timer);
      complete(response, [
        message(`Slow fixture started. tick-${count}`, 'msg-slow'),
      ]);
    }
  }, 1000);
}

function streamChatCompletion(
  response: http.ServerResponse,
  body: any,
  requestRecord: FixtureRequest,
): void {
  requestRecord.scenario = 'chat-completions';
  beginSse(response);
  const chunks = ['Chat ', 'completions ', 'route confirmed.'];
  chunks.forEach(delta => {
    response.write(
      `data: ${JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion.chunk',
        model: body?.model || CHAT_MODEL_ID,
        choices: [{index: 0, delta: {content: delta}, finish_reason: null}],
      })}\n\n`,
    );
  });
  response.write(
    `data: ${JSON.stringify({
      id: 'chatcmpl-fixture',
      object: 'chat.completion.chunk',
      model: body?.model || CHAT_MODEL_ID,
      choices: [{index: 0, delta: {}, finish_reason: 'stop'}],
      usage: {prompt_tokens: 8, completion_tokens: 5, total_tokens: 13},
    })}\n\n`,
  );
  response.write('data: [DONE]\n\n');
  response.end();
}

export async function startRemoteFixtureServer(
  options: StartOptions = {},
): Promise<RemoteFixtureServer> {
  const host = options.host ?? '127.0.0.1';
  const state: FixtureState = {
    requestCount: 0,
    requests: [],
    toolReplayValidated: false,
    scoutToolsValidated: false,
    scoutCalculateValidated: false,
    scoutHtmlValidated: false,
    scoutSearchValidated: false,
  };

  const server = http.createServer(async (request, response) => {
    const path = new URL(request.url || '/', `http://${host}`).pathname;
    if (path === '/__fixture/status' && request.method === 'GET') {
      json(response, 200, state);
      return;
    }
    if (path === '/__fixture/reset' && request.method === 'POST') {
      state.requestCount = 0;
      state.requests.splice(0);
      state.toolReplayValidated = false;
      state.scoutToolsValidated = false;
      state.scoutCalculateValidated = false;
      state.scoutHtmlValidated = false;
      state.scoutSearchValidated = false;
      json(response, 200, {ok: true});
      return;
    }

    const record: FixtureRequest = {
      id: ++state.requestCount,
      method: request.method || 'GET',
      path,
      headers: safeHeaders(request.headers),
      ...authorizationMetadata(request.headers),
      completed: false,
      aborted: false,
    };
    state.requests.push(record);
    response.on('finish', () => {
      record.completed = true;
    });
    response.on('close', () => {
      if (!response.writableFinished) {
        record.aborted = true;
      }
    });

    try {
      record.body = await readBody(request);
    } catch {
      json(response, 400, {error: {message: 'Invalid JSON'}});
      return;
    }

    if (
      request.method === 'GET' &&
      (path === '/models' || path === '/v1/models')
    ) {
      json(response, 200, {object: 'list', data: MODEL_ROWS});
      return;
    }
    if (
      request.method === 'POST' &&
      (path === '/responses' || path === '/v1/responses')
    ) {
      streamResponsesScenario(response, record.body, record, state);
      return;
    }
    if (
      request.method === 'POST' &&
      (path === '/chat/completions' || path === '/v1/chat/completions')
    ) {
      streamChatCompletion(response, record.body, record);
      return;
    }
    json(response, 404, {error: {message: `Unknown fixture path: ${path}`}});
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? DEFAULT_REMOTE_FIXTURE_PORT, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    host,
    port,
    url: `http://${host}:${port}`,
    state,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function main(): Promise<void> {
  const port =
    Number(process.env.E2E_REMOTE_FIXTURE_PORT) || DEFAULT_REMOTE_FIXTURE_PORT;
  const fixture = await startRemoteFixtureServer({port});
  console.log(`remote responses fixture listening on ${fixture.url}`);
  const stop = async () => {
    await fixture.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
