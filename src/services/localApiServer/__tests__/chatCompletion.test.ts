import {LlamaContext} from 'llama.rn';

import {
  LocalCompletionEngine,
  OpenAICompletionEngine,
} from '../../../api/completionEngines';
import {chatSessionStore, modelStore} from '../../../store';
import type {GenerationLease} from '../../../store/generationLease';
import type {
  CompletionResult,
  CompletionStreamData,
} from '../../../utils/completionTypes';
import {
  ResponseChannel,
  serveChatCompletion,
  serverBaseParams,
} from '../chatCompletion';

const mockStore = modelStore as unknown as typeof modelStore & {
  acquireGeneration: jest.Mock;
  resetGenerationSlot(): void;
  engine: unknown;
  activeModelId: string | undefined;
};

/** A llama context whose completion the test settles; stop interrupts it. */
const fakeContext = () => {
  let settle!: (result: Partial<CompletionResult>) => void;
  let fail!: (error: Error) => void;
  let onData: ((data: CompletionStreamData) => void) | undefined;
  const context = {
    completion: jest.fn(
      (_params: unknown, callback?: (data: CompletionStreamData) => void) => {
        onData = callback;
        return new Promise((resolve, reject) => {
          settle = result => resolve({text: '', content: '', ...result});
          fail = reject;
        });
      },
    ),
    stopCompletion: jest.fn(async () => settle({interrupted: true})),
  };
  return {
    context,
    emit: (data: CompletionStreamData) => onData?.(data),
    settle: (result: Partial<CompletionResult>) => settle(result),
    fail: (error: Error) => fail(error),
  };
};

const makeChannel = () => {
  const writes: string[] = [];
  const listeners = new Set<() => void>();
  let closed = false;
  const channel: ResponseChannel & {close(): void} = {
    write: data => {
      if (!closed) {
        writes.push(data);
      }
    },
    end: jest.fn(),
    get closed() {
      return closed;
    },
    onClose: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      closed = true;
      listeners.forEach(listener => listener());
    },
  };
  return {channel, text: () => writes.join('')};
};

const statusOf = (text: string) => Number(text.split(' ')[1]);
const jsonOf = (text: string) => JSON.parse(text.slice(text.indexOf('{')));
const framesOf = (text: string) =>
  text
    .slice(text.indexOf('\r\n\r\n') + 4)
    .split('\n\n')
    .filter(frame => frame.startsWith('data: '))
    .map(frame => frame.slice('data: '.length))
    .map(data => (data === '[DONE]' ? data : JSON.parse(data)));

const flush = () => new Promise(resolve => setImmediate(resolve));

const body = (extra: object = {}) => ({
  messages: [{role: 'user', content: 'hi'}],
  ...extra,
});

let leases: GenerationLease[];
let realAcquire: () => Promise<GenerationLease | null>;

beforeAll(() => {
  realAcquire = mockStore.acquireGeneration.getMockImplementation()!;
});

beforeEach(() => {
  mockStore.resetGenerationSlot();
  mockStore.activeModelId = 'model-1';
  leases = [];
  mockStore.acquireGeneration.mockClear();
  mockStore.acquireGeneration.mockImplementation(async () => {
    const lease = await realAcquire();
    if (lease) {
      jest.spyOn(lease, 'end');
      jest.spyOn(lease, 'abort');
      leases.push(lease);
    }
    return lease;
  });
});

afterEach(() => {
  mockStore.acquireGeneration.mockImplementation(realAcquire);
  mockStore.engine = undefined;
  mockStore.activeModelId = undefined;
});

const withLocalModel = () => {
  const fake = fakeContext();
  mockStore.engine = new LocalCompletionEngine(
    fake.context as unknown as LlamaContext,
  );
  return fake;
};

describe('serveChatCompletion', () => {
  it('answers a non-stream completion and ends its one lease', async () => {
    const fake = withLocalModel();
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body(), channel);
    await flush();
    fake.settle({
      content: 'hello',
      text: 'hello',
      tokens_evaluated: 4,
      tokens_predicted: 2,
      stopped_eos: true,
    });
    await served;

    expect(statusOf(text())).toBe(200);
    expect(jsonOf(text())).toMatchObject({
      object: 'chat.completion',
      model: 'model-1',
      choices: [
        {message: {role: 'assistant', content: 'hello'}, finish_reason: 'stop'},
      ],
      usage: {prompt_tokens: 4, completion_tokens: 2, total_tokens: 6},
    });
    expect(leases).toHaveLength(1);
    expect(leases[0].end).toHaveBeenCalledTimes(1);
    expect(mockStore.isGenerationBusy).toBe(false);
  });

  it('sends the mapped params with the base settings and stop words', async () => {
    const fake = withLocalModel();
    const {channel} = makeChannel();
    const served = serveChatCompletion(body({max_tokens: 100000}), channel);
    await flush();
    fake.settle({});
    await served;

    const params = fake.context.completion.mock.calls[0][0] as {
      stop?: string[];
    };
    expect(params).toMatchObject({
      n_predict: 2048,
      reasoning_format: 'auto',
      messages: [{role: 'user', content: 'hi'}],
      temperature: chatSessionStore.newChatCompletionSettings.temperature,
    });
    expect(params.stop).toEqual(
      expect.arrayContaining(mockStore.activeModel?.stopWords ?? []),
    );
    expect(params).not.toHaveProperty('tools');
  });

  it('streams role, deltas, a final chunk with usage and [DONE]', async () => {
    const fake = withLocalModel();
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(
      body({stream: true, stream_options: {include_usage: true}}),
      channel,
    );
    await flush();
    fake.emit({reasoning_content: 'think'});
    fake.emit({token: 'x', reasoning_content: 'think'});
    fake.emit({content: 'He', reasoning_content: 'think'});
    fake.emit({content: 'Hello', reasoning_content: 'think'});
    fake.settle({
      content: 'Hello!',
      reasoning_content: 'think',
      tokens_evaluated: 3,
      tokens_predicted: 2,
      stopped_limit: 1,
    });
    await served;

    expect(text()).toContain('Content-Type: text/event-stream');
    const frames = framesOf(text());
    expect(frames.map(f => (f === '[DONE]' ? f : f.choices[0]))).toEqual([
      {
        index: 0,
        delta: {role: 'assistant', reasoning_content: 'think'},
        finish_reason: null,
      },
      {index: 0, delta: {content: 'He'}, finish_reason: null},
      {index: 0, delta: {content: 'llo'}, finish_reason: null},
      {index: 0, delta: {content: '!'}, finish_reason: null},
      {index: 0, delta: {}, finish_reason: 'length'},
      '[DONE]',
    ]);
    expect(frames[4].usage).toEqual({
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
    });
    expect(leases[0].end).toHaveBeenCalledTimes(1);
  });

  it('skips a snapshot that rewrote text already sent', async () => {
    const fake = withLocalModel();
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body({stream: true}), channel);
    await flush();
    fake.emit({content: 'ab'});
    fake.emit({content: 'xb'});
    fake.emit({content: 'abc'});
    fake.settle({content: 'abc'});
    await served;

    const contents = framesOf(text())
      .filter(f => f !== '[DONE]' && f.choices[0].delta.content)
      .map(f => f.choices[0].delta.content);
    expect(contents).toEqual(['ab', 'c']);
  });

  it('answers 400 before taking a lease for an invalid body', async () => {
    withLocalModel();
    const {channel, text} = makeChannel();
    await serveChatCompletion(body({tools: [{type: 'function'}]}), channel);
    expect(statusOf(text())).toBe(400);
    expect(mockStore.acquireGeneration).not.toHaveBeenCalled();
  });

  it('answers 503 no_model when no model is loaded', async () => {
    const {channel, text} = makeChannel();
    await serveChatCompletion(body(), channel);
    expect(statusOf(text())).toBe(503);
    expect(jsonOf(text()).error.code).toBe('no_model');
  });

  it('ends a remote model lease unused and answers 503', async () => {
    const remote = new OpenAICompletionEngine({
      url: 'http://example',
    } as never);
    const completion = jest.spyOn(remote, 'completion');
    mockStore.engine = remote;
    const {channel, text} = makeChannel();
    await serveChatCompletion(body(), channel);
    expect(statusOf(text())).toBe(503);
    expect(jsonOf(text()).error.code).toBe('no_model');
    expect(completion).not.toHaveBeenCalled();
    expect(leases[0].end).toHaveBeenCalledTimes(1);
  });

  it('waits behind a chat lease and is served after it ends', async () => {
    const fake = withLocalModel();
    const chatLease = (await realAcquire())!;
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body(), channel);
    await flush();
    expect(text()).toBe('');
    expect(fake.context.completion).not.toHaveBeenCalled();

    chatLease.end();
    await flush();
    fake.settle({content: 'ok'});
    await served;
    expect(statusOf(text())).toBe(200);
  });

  it('ends a lease granted after the client left, without a completion', async () => {
    const fake = withLocalModel();
    const chatLease = (await realAcquire())!;
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body(), channel);
    const next = serveChatCompletion(body(), makeChannel().channel);
    await flush();
    channel.close();
    chatLease.end();
    await served;

    expect(leases[0].end).toHaveBeenCalledTimes(1);
    expect(text()).toBe('');
    await flush();
    expect(fake.context.completion).toHaveBeenCalledTimes(1);
    fake.settle({});
    await next;
  });

  it('stops once and ends the lease when the client disconnects mid-stream', async () => {
    const fake = withLocalModel();
    const {channel} = makeChannel();
    const served = serveChatCompletion(body({stream: true}), channel);
    await flush();
    fake.emit({content: 'a'});
    channel.close();
    channel.close();
    await served;

    expect(leases[0].abort).toHaveBeenCalled();
    expect(fake.context.stopCompletion).toHaveBeenCalledTimes(1);
    expect(leases[0].end).toHaveBeenCalledTimes(1);
    expect(mockStore.isGenerationBusy).toBe(false);
  });

  it('closes the stream with one error frame when the lease is aborted', async () => {
    const fake = withLocalModel();
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body({stream: true}), channel);
    await flush();
    fake.emit({content: 'a'});
    mockStore.abortActiveGeneration();
    fake.emit({content: 'late'});
    await served;

    const frames = framesOf(text());
    expect(frames).toHaveLength(2);
    expect(frames[1].error.code).toBe('generation_aborted');
    expect(text()).not.toContain('[DONE]');
    expect(text()).not.toContain('late');
    expect(fake.context.stopCompletion).toHaveBeenCalledTimes(1);
    expect(leases[0].end).toHaveBeenCalledTimes(1);
  });

  it('answers a JSON error when the stream fails before any byte', async () => {
    const fake = withLocalModel();
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body({stream: true}), channel);
    await flush();
    fake.fail(new Error('boom'));
    await served;

    expect(statusOf(text())).toBe(500);
    expect(jsonOf(text()).error).toMatchObject({
      message: 'boom',
      code: 'internal_error',
    });
    expect(leases[0].end).toHaveBeenCalledTimes(1);
  });

  it('writes one error frame when the engine throws mid-stream', async () => {
    const fake = withLocalModel();
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body({stream: true}), channel);
    await flush();
    fake.emit({content: 'a'});
    fake.fail(new Error('boom'));
    await served;

    const frames = framesOf(text());
    expect(frames[frames.length - 1].error.code).toBe('internal_error');
    expect(text()).not.toContain('[DONE]');
    expect(leases[0].end).toHaveBeenCalledTimes(1);
  });

  it('answers 503 for a non-stream request aborted by a release', async () => {
    const fake = withLocalModel();
    const {channel, text} = makeChannel();
    const served = serveChatCompletion(body(), channel);
    await flush();
    mockStore.abortActiveGeneration();
    await served;

    expect(fake.context.stopCompletion).toHaveBeenCalledTimes(1);
    expect(statusOf(text())).toBe(503);
    expect(jsonOf(text()).error.code).toBe('generation_aborted');
    expect(leases[0].end).toHaveBeenCalledTimes(1);
  });

  it('lets chat in only after both server leases end, ahead of a later server request', async () => {
    const fake = withLocalModel();
    const first = serveChatCompletion(
      body({stream: true}),
      makeChannel().channel,
    );
    const second = serveChatCompletion(body(), makeChannel().channel);
    await flush();
    const chat = realAcquire();
    let chatGranted = false;
    chat.then(() => {
      chatGranted = true;
    });
    const third = serveChatCompletion(body(), makeChannel().channel);

    fake.settle({});
    await first;
    await flush();
    expect(chatGranted).toBe(false);
    fake.settle({});
    await second;
    await flush();
    expect(chatGranted).toBe(true);
    expect(fake.context.completion).toHaveBeenCalledTimes(2);

    (await chat)!.end();
    await flush();
    fake.settle({});
    await third;
    expect(fake.context.completion).toHaveBeenCalledTimes(3);
  });

  it('keeps the Pal sheet and VideoPal busy while a server lease is held', async () => {
    const fake = withLocalModel();
    const served = serveChatCompletion(body(), makeChannel().channel);
    await flush();
    expect(mockStore.tryAcquireGeneration()).toBeNull();
    fake.settle({});
    await served;
  });
});

describe('serverBaseParams', () => {
  it('drops tools from the global settings', () => {
    const settings = chatSessionStore.newChatCompletionSettings;
    chatSessionStore.newChatCompletionSettings = {
      ...settings,
      tools: [{type: 'function'}] as never,
      tool_choice: 'auto',
    };
    try {
      const base = serverBaseParams();
      expect(base).not.toHaveProperty('tools');
      expect(base).not.toHaveProperty('tool_choice');
    } finally {
      chatSessionStore.newChatCompletionSettings = settings;
    }
  });
});
