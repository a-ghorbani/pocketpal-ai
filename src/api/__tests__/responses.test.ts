import * as RNFS from '@dr.pogodin/react-native-fs';

import {streamResponses} from '../responses';
import {
  type ResponsesDiagnosticObserver,
  ResponsesDiagnosticRecorder,
} from '../responsesDiagnostics';
import type {ResponsesRequestParams} from '../responsesRequest';
import {ResponsesStreamProtocolError} from '../responsesStream';

type Handler = (() => void) | null;

class MockXHR {
  static instances: MockXHR[] = [];
  static HEADERS_RECEIVED = 2;
  static DONE = 4;

  method = '';
  url = '';
  requestHeaders: Record<string, string> = {};
  requestBody = '';
  responseText = '';
  readyState = 0;
  status = 0;
  abortCalls = 0;
  onreadystatechange: Handler = null;
  onprogress: Handler = null;
  onload: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;

  constructor() {
    MockXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value;
  }

  send(body?: string) {
    this.requestBody = body ?? '';
  }

  abort() {
    this.abortCalls++;
    this.onabort?.();
  }

  headers(status = 200) {
    this.readyState = MockXHR.HEADERS_RECEIVED;
    this.status = status;
    this.onreadystatechange?.();
  }

  progress(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }

  load() {
    this.readyState = MockXHR.DONE;
    this.onload?.();
  }

  httpError(status: number, body: unknown) {
    this.headers(status);
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.readyState = MockXHR.DONE;
    this.onreadystatechange?.();
  }
}

const binding = {
  wireApi: 'responses' as const,
  serverUrl: 'https://example.test/base',
  serverType: 'OpenAI',
  modelId: 'model-test',
};

const params = () => ({
  model: 'model-test',
  messages: [{role: 'user', content: 'Hello'}],
});

const frame = (event: Record<string, unknown>) =>
  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

const startResponses = (
  request: ResponsesRequestParams = params(),
  options: {
    url?: string;
    apiKey?: string;
    signal?: AbortSignal;
    callback?: jest.Mock;
    timeoutMs?: number;
    serverType?: string;
    binding?: typeof binding;
    diagnosticObserver?: ResponsesDiagnosticObserver;
  } = {},
) =>
  streamResponses(
    request,
    options.url ?? 'https://example.test',
    options.apiKey,
    options.signal,
    options.callback,
    options.timeoutMs,
    options.serverType,
    options.binding ?? binding,
    {},
    options.diagnosticObserver,
  );

const message = (text: string) => ({
  type: 'message',
  id: 'message-1',
  role: 'assistant',
  status: 'completed',
  phase: 'final_answer',
  content: [{type: 'output_text', text}],
});

describe('streamResponses', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    MockXHR.instances = [];
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
    jest.useRealTimers();
  });

  it.each([
    [
      'GitHub Copilot',
      'https://example.test/custom///',
      'https://example.test/custom/responses',
      true,
    ],
    [
      'OpenAI',
      'https://example.test/custom/',
      'https://example.test/custom/v1/responses',
      false,
    ],
  ])(
    'uses the exact %s route and header profile',
    async (serverType, url, expectedUrl, copilot) => {
      const promise = streamResponses(
        params(),
        url,
        'key',
        undefined,
        undefined,
        undefined,
        serverType,
        binding,
      );
      const xhr = MockXHR.instances[0];
      expect(xhr.url).toBe(expectedUrl);
      expect(xhr.requestHeaders).toEqual({
        'Content-Type': 'application/json',
        Authorization: ['Bearer', 'key'].join(' '),
        ...(copilot
          ? {
              'Copilot-Integration-Id': 'copilot-developer-cli-test',
              'User-Agent': 'copilot/1.0.83 (linux v24.20.0) term/unknown-test',
              'Editor-Version': 'copilot/1.0.83-test',
            }
          : {}),
      });
      expect(JSON.parse(xhr.requestBody)).toEqual({
        model: 'model-test',
        input: [{role: 'user', content: 'Hello'}],
        stream: true,
        store: false,
      });

      xhr.headers();
      xhr.progress(
        frame({
          type: 'response.completed',
          response: {status: 'completed', output: [message('ok')]},
        }),
      );
      xhr.load();
      await promise;
    },
  );

  it('applies Copilot output-item done identity compatibility from the binding', async () => {
    const promise = startResponses(params(), {
      serverType: 'GitHub Copilot',
      binding: {...binding, serverType: 'GitHub Copilot'},
    });
    const xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(
      [
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: {type: 'reasoning', id: 'reasoning-added', summary: []},
        },
        {
          type: 'response.reasoning_summary_text.delta',
          output_index: 0,
          item_id: 'reasoning-added',
          summary_index: 0,
          delta: 'captured reasoning',
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: {type: 'reasoning', id: 'reasoning-done', summary: []},
        },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [{type: 'reasoning', id: 'reasoning-done', summary: []}],
          },
        },
      ]
        .map(frame)
        .join(''),
    );
    xhr.load();

    await expect(promise).resolves.toMatchObject({
      reasoning_content: 'captured reasoning',
      provider_state: {
        responses: {
          output: [
            {
              type: 'reasoning',
              id: 'reasoning-done',
              summary: [{type: 'summary_text', text: 'captured reasoning'}],
            },
          ],
        },
      },
    });
  });

  it('applies Copilot item-scoped identity rotation from the binding', async () => {
    const promise = startResponses(params(), {
      serverType: 'GitHub Copilot',
      binding: {...binding, serverType: 'GitHub Copilot'},
    });
    const xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(
      [
        {
          type: 'response.output_item.added',
          output_index: 0,
          item: {...message(''), id: 'message-added', status: 'in_progress'},
        },
        {
          type: 'response.content_part.added',
          output_index: 0,
          item_id: 'message-content',
          content_index: 0,
          part: {type: 'output_text', text: ''},
        },
        {
          type: 'response.output_text.delta',
          output_index: 0,
          item_id: 'message-delta',
          content_index: 0,
          delta: 'live content',
        },
        {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            ...message('live content'),
            id: 'message-done',
          },
        },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [{...message('live content'), id: 'message-terminal'}],
          },
        },
      ]
        .map(frame)
        .join(''),
    );
    xhr.load();

    await expect(promise).resolves.toMatchObject({
      content: 'live content',
      provider_state: {
        responses: {
          output: [
            {
              type: 'message',
              id: 'message-terminal',
              content: [{type: 'output_text', text: 'live content'}],
            },
          ],
        },
      },
    });
  });

  it('rejects insecure non-local URLs before constructing XHR', async () => {
    await expect(
      startResponses(params(), {url: 'http://example.test'}),
    ).rejects.toThrow('Remote AI servers must use HTTPS');
    expect(MockXHR.instances).toHaveLength(0);
  });

  it('forwards the caller request policy and options to the encoder', async () => {
    const promise = streamResponses(
      {
        ...params(),
        reasoning: {enabled: true, effort: 'high'},
      },
      'https://example.test',
      undefined,
      undefined,
      undefined,
      undefined,
      'OpenAI',
      binding,
      {
        parameterPolicy: {
          reasoning: {
            supportsEffort: true,
            supportsEncryptedContent: true,
          },
        },
        includeReasoningEncryptedContent: true,
      },
    );
    const xhr = MockXHR.instances[0];
    expect(JSON.parse(xhr.requestBody)).toMatchObject({
      reasoning: {effort: 'high'},
      include: ['reasoning.encrypted_content'],
    });
    xhr.headers();
    xhr.progress(
      frame({
        type: 'response.completed',
        response: {status: 'completed', output: [message('ok')]},
      }),
    );
    xhr.load();
    await promise;
  });

  it('streams text/reasoning/tools and accepts the terminal final snapshot and usage', async () => {
    const callback = jest.fn();
    const promise = startResponses(params(), {callback});
    const xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(
      frame({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'reasoning',
          id: 'reasoning-1',
          summary: [{type: 'summary_text', text: 'think'}],
        },
      }),
    );
    xhr.progress(
      frame({
        type: 'response.output_item.added',
        output_index: 1,
        item: {
          type: 'function_call',
          id: 'function-1',
          call_id: 'call-1',
          name: 'clock',
          arguments: '{}',
          status: 'completed',
        },
      }),
    );
    xhr.progress(
      frame({
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [
            {
              type: 'reasoning',
              id: 'reasoning-1',
              summary: [{type: 'summary_text', text: 'think final'}],
            },
            {
              type: 'function_call',
              id: 'function-1',
              call_id: 'call-1',
              name: 'clock',
              arguments: '{"zone":"UTC"}',
              status: 'completed',
            },
            message('snapshot answer'),
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 4,
            total_tokens: 14,
          },
        },
      }),
    );
    xhr.load();

    const result = await promise;
    expect(result).toMatchObject({
      content: 'snapshot answer',
      reasoning_content: 'think final',
      tool_calls: [
        {
          id: 'call-1',
          function: {name: 'clock', arguments: '{"zone":"UTC"}'},
        },
      ],
      tokens_evaluated: 10,
      tokens_predicted: 4,
      terminal_status: 'completed',
    });
    expect(result.provider_state?.responses?.binding).toEqual(binding);
    expect(callback.mock.calls.at(-1)?.[0]).toMatchObject({
      accumulated_text: 'snapshot answer',
      reasoning_content: 'think final',
    });
  });

  it('completes identically without a callback and flushes a final unframed event', async () => {
    const promise = startResponses();
    const xhr = MockXHR.instances[0];
    xhr.headers();
    const terminal = frame({
      type: 'response.completed',
      response: {status: 'completed', output: [message('flushed')]},
    }).trimEnd();
    xhr.progress(terminal);
    xhr.load();
    await expect(promise).resolves.toMatchObject({content: 'flushed'});
  });

  it.each([
    [
      'incomplete',
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          output: [message('partial')],
          incomplete_details: {reason: 'max_output_tokens'},
        },
      },
      {
        content: 'partial',
        interrupted: true,
        incomplete_reason: 'max_output_tokens',
      },
    ],
    [
      'refusal',
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'refusal-1',
              role: 'assistant',
              status: 'completed',
              content: [{type: 'refusal', refusal: 'No'}],
            },
          ],
        },
      },
      {content: 'No', refusal: 'No', interrupted: true},
    ],
  ])('returns typed %s results', async (_label, event, expected) => {
    const promise = startResponses();
    const xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(frame(event));
    xhr.load();
    await expect(promise).resolves.toMatchObject(expected);
  });

  it.each([
    [
      'SSE error',
      {type: 'error', error: {message: 'synthetic'}},
      'response-error',
    ],
    [
      'failed terminal',
      {
        type: 'response.failed',
        response: {status: 'failed', output: []},
      },
      'response-failed',
    ],
  ])('rejects a typed %s without fallback', async (_label, event, code) => {
    const promise = startResponses();
    const xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(frame(event));
    xhr.load();
    await expect(promise).rejects.toMatchObject({
      name: 'ResponsesStreamProtocolError',
      code,
    });
    if (code === 'response-error') {
      expect(xhr.abortCalls).toBe(1);
    }
  });

  it('rejects malformed SSE JSON and EOF without a terminal event', async () => {
    const malformed = startResponses();
    let xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress('event: response.created\ndata: nope\n\n');
    await expect(malformed).rejects.toThrow('Malformed JSON');

    const eof = startResponses();
    xhr = MockXHR.instances[1];
    xhr.headers();
    xhr.load();
    await expect(eof).rejects.toMatchObject({
      code: 'premature-eof',
    } satisfies Partial<ResponsesStreamProtocolError>);
  });

  it('parses HTTP errors safely', async () => {
    const promise = startResponses();
    MockXHR.instances[0].httpError(429, {
      error: {message: 'rate limited'},
    });
    await expect(promise).rejects.toThrow('Server error: 429 — rate limited');
  });

  it('does not retry a rejected Responses request', async () => {
    const promise = startResponses({
      ...params(),
      temperature: 0.7,
      top_p: 0.9,
    });
    MockXHR.instances[0].httpError(400, {
      error: {message: 'temperature is not supported'},
    });

    await expect(promise).rejects.toThrow('temperature is not supported');
    expect(MockXHR.instances).toHaveLength(1);
  });

  it('diagnoses success and HTTP errors without recording response secrets', async () => {
    const successRecorder = new ResponsesDiagnosticRecorder();
    const success = startResponses(params(), {
      diagnosticObserver: successRecorder.observer,
    });
    let xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(
      frame({
        type: 'response.completed',
        response: {
          id: 'response-SECRET_RESPONSE_ID',
          status: 'completed',
          output: [message('SECRET_RESPONSE_TEXT')],
        },
      }),
    );
    xhr.load();
    await success;

    expect(successRecorder.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'http', httpStatus: 200}),
        expect.objectContaining({
          kind: 'event',
          eventType: 'response.completed',
          responseAlias: 'response-1',
          status: 'completed',
        }),
        expect.objectContaining({kind: 'outcome', outcome: 'completed'}),
      ]),
    );
    expect(JSON.stringify(successRecorder.records)).not.toContain('SECRET_');

    const errorRecorder = new ResponsesDiagnosticRecorder();
    const failure = startResponses(params(), {
      diagnosticObserver: errorRecorder.observer,
    });
    xhr = MockXHR.instances[1];
    xhr.httpError(429, {error: {message: 'SECRET_HTTP_BODY'}});
    await expect(failure).rejects.toThrow('Server error: 429');
    expect(errorRecorder.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'http', httpStatus: 429}),
        expect.objectContaining({kind: 'error', errorClass: 'http'}),
        expect.objectContaining({kind: 'outcome', outcome: 'error'}),
      ]),
    );
    expect(JSON.stringify(errorRecorder.records)).not.toContain('SECRET_');
  });

  it('enforces connection and idle timeouts and resets idle on data', async () => {
    jest.useFakeTimers();
    let promise = startResponses(params(), {timeoutMs: 100});
    jest.advanceTimersByTime(100);
    await expect(promise).rejects.toThrow('Connection timed out');

    promise = startResponses(params(), {timeoutMs: 100});
    const xhr = MockXHR.instances[1];
    xhr.headers();
    jest.advanceTimersByTime(90);
    xhr.progress(': keepalive\n\n');
    jest.advanceTimersByTime(90);
    xhr.progress(
      frame({
        type: 'response.completed',
        response: {status: 'completed', output: [message('ok')]},
      }),
    );
    xhr.load();
    await expect(promise).resolves.toMatchObject({content: 'ok'});
  });

  it('handles pre-abort without timers or XHR and abort during image encoding before send', async () => {
    const pre = new AbortController();
    pre.abort();
    const timerSpy = jest.spyOn(global, 'setTimeout');
    await expect(
      streamResponses(
        params(),
        'https://example.test',
        undefined,
        pre.signal,
        undefined,
        undefined,
        undefined,
        binding,
      ),
    ).rejects.toThrow('Completion aborted');
    expect(timerSpy).not.toHaveBeenCalled();
    expect(MockXHR.instances).toHaveLength(0);
    timerSpy.mockRestore();

    let finishRead!: (value: string) => void;
    (RNFS.readFile as jest.Mock).mockReturnValueOnce(
      new Promise<string>(resolve => {
        finishRead = resolve;
      }),
    );
    const mid = new AbortController();
    const promise = startResponses(
      {
        model: 'model-test',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {url: 'file:///image.png'},
              },
            ],
          },
        ],
      },
      {signal: mid.signal},
    );
    await Promise.resolve();
    mid.abort();
    finishRead('AA==');
    await expect(promise).rejects.toThrow('Completion aborted');
    expect(MockXHR.instances).toHaveLength(0);
  });

  it('resolves partial content on external abort, ignores post-abort bytes, and removes the listener once', async () => {
    const controller = new AbortController();
    const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');
    const callback = jest.fn();
    const promise = startResponses(params(), {
      signal: controller.signal,
      callback,
    });
    const xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(
      frame({
        type: 'response.output_item.added',
        output_index: 0,
        item: message('partial'),
      }),
    );
    const callsBeforeAbort = callback.mock.calls.length;
    controller.abort();
    xhr.progress(
      frame({
        type: 'response.output_text.delta',
        output_index: 0,
        item_id: 'message-1',
        content_index: 0,
        delta: ' ignored',
      }),
    );
    xhr.load();

    await expect(promise).resolves.toMatchObject({
      content: 'partial',
      interrupted: true,
    });
    expect(callback).toHaveBeenCalledTimes(callsBeforeAbort);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(xhr.abortCalls).toBe(1);
  });

  it('diagnoses external abort without changing transport cleanup', async () => {
    const controller = new AbortController();
    const recorder = new ResponsesDiagnosticRecorder();
    const promise = startResponses(params(), {
      signal: controller.signal,
      diagnosticObserver: recorder.observer,
    });
    const xhr = MockXHR.instances[0];
    xhr.headers();
    controller.abort();

    await expect(promise).resolves.toMatchObject({interrupted: true});
    expect(xhr.abortCalls).toBe(1);
    expect(recorder.records.at(-1)).toEqual(
      expect.objectContaining({kind: 'outcome', outcome: 'aborted'}),
    );
  });

  it('matches visible stop words across chunks, holds suffixes, and leaves reasoning/tool data intact', async () => {
    const callback = jest.fn();
    const promise = startResponses(
      {...params(), stop: ['STOP', 'STOP!']},
      {callback},
    );
    const xhr = MockXHR.instances[0];
    xhr.headers();
    xhr.progress(
      frame({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'reasoning',
          id: 'reason-1',
          summary: [{type: 'summary_text', text: 'private'}],
        },
      }) +
        frame({
          type: 'response.output_item.added',
          output_index: 1,
          item: {
            type: 'function_call',
            id: 'fn-1',
            call_id: 'call-1',
            name: 'tool',
            arguments: '{"STOP":"kept"}',
            status: 'completed',
          },
        }) +
        frame({
          type: 'response.output_item.added',
          output_index: 2,
          item: {
            type: 'message',
            id: 'message-1',
            role: 'assistant',
            status: 'in_progress',
            content: [{type: 'output_text', text: 'answer ST'}],
          },
        }),
    );
    expect(callback.mock.calls.at(-1)?.[0].content).toBe('answer ');
    xhr.progress(
      frame({
        type: 'response.output_text.delta',
        output_index: 2,
        item_id: 'message-1',
        content_index: 0,
        delta: 'OP! hidden',
      }),
    );

    await expect(promise).resolves.toMatchObject({
      content: 'answer ',
      stopped_word: 'STOP!',
      interrupted: true,
      reasoning_content: 'private',
      tool_calls: [
        {
          id: 'call-1',
          function: {arguments: '{"STOP":"kept"}'},
        },
      ],
    });
    expect(xhr.abortCalls).toBe(1);
  });
});
