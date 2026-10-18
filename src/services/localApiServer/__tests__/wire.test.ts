import type {
  CompletionParams,
  CompletionResult,
} from '../../../utils/completionTypes';
import {
  buildChatParams,
  DEFAULT_MAX_TOKENS,
  errorBody,
  MAX_TOKENS_LIMIT,
  newCompletionIds,
  toChunk,
  toCompletion,
  toFinalChunk,
  validateChatRequest,
} from '../wire';

const base: CompletionParams = {
  temperature: 0.7,
  top_p: 0.95,
  n_predict: -1,
  enable_thinking: true,
  version: 3,
  include_thinking_in_context: false,
};

const user = {messages: [{role: 'user', content: 'hi'}]};

const mapped = (body: object, stopWords?: string[]) => {
  const result = validateChatRequest(body);
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return {
    ...result.request,
    params: buildChatParams(result.request, base, stopWords),
  };
};

const rejected = (body: unknown) => {
  const result = validateChatRequest(body);
  if (result.ok) {
    throw new Error('expected a rejection');
  }
  return result.error;
};

describe('validateChatRequest and buildChatParams', () => {
  it('maps a minimal request over the base settings', () => {
    const {params, stream, includeUsage} = mapped(user);
    expect(params).toEqual({
      temperature: 0.7,
      top_p: 0.95,
      n_predict: DEFAULT_MAX_TOKENS,
      messages: [{role: 'user', content: 'hi'}],
      stop: [],
      reasoning_format: 'auto',
      enable_thinking: true,
      chat_template_kwargs: {enable_thinking: true},
    });
    expect(stream).toBe(false);
    expect(includeUsage).toBe(false);
  });

  it('strips app-only keys', () => {
    const {params} = mapped(user);
    expect(params).not.toHaveProperty('version');
    expect(params).not.toHaveProperty('include_thinking_in_context');
  });

  it('maps sampling fields to llama.rn names', () => {
    const {params} = mapped({
      ...user,
      temperature: 0.1,
      top_p: 0.5,
      top_k: 20,
      min_p: 0.05,
      seed: 42,
      frequency_penalty: 0.3,
      presence_penalty: 0.4,
      repeat_penalty: 1.1,
    });
    expect(params).toMatchObject({
      temperature: 0.1,
      top_p: 0.5,
      top_k: 20,
      min_p: 0.05,
      seed: 42,
      penalty_freq: 0.3,
      penalty_present: 0.4,
      penalty_repeat: 1.1,
    });
  });

  it.each([
    [{}, DEFAULT_MAX_TOKENS],
    [{max_tokens: 0}, DEFAULT_MAX_TOKENS],
    [{max_tokens: -5}, DEFAULT_MAX_TOKENS],
    [{max_tokens: 100}, 100],
    [{max_tokens: 100000}, MAX_TOKENS_LIMIT],
    [{max_tokens: 100, max_completion_tokens: 50}, 50],
    [{max_tokens: 12.7}, 12],
  ])('maps %j to n_predict %d', (fields, expected) => {
    expect(mapped({...user, ...fields}).params.n_predict).toBe(expected);
  });

  it('joins text content parts', () => {
    const {params} = mapped({
      messages: [
        {role: 'system', content: 'be brief'},
        {
          role: 'user',
          content: [
            {type: 'text', text: 'a'},
            {type: 'text', text: 'b'},
          ],
        },
      ],
    });
    expect(params.messages).toEqual([
      {role: 'system', content: 'be brief'},
      {role: 'user', content: 'ab'},
    ]);
  });

  it('unions stop sequences with the model stop words', () => {
    expect(mapped({...user, stop: 'END'}, ['</s>']).params.stop).toEqual([
      '</s>',
      'END',
    ]);
    expect(
      mapped({...user, stop: ['</s>', 'X']}, ['</s>']).params.stop,
    ).toEqual(['</s>', 'X']);
  });

  it('passes response_format through', () => {
    const format = {type: 'json_object'};
    expect(mapped({...user, response_format: format}).params).toMatchObject({
      response_format: format,
    });
  });

  it('writes a requested thinking switch to both fields', () => {
    const {params} = mapped({
      ...user,
      chat_template_kwargs: {enable_thinking: false},
    });
    expect(params.enable_thinking).toBe(false);
    expect(params.chat_template_kwargs).toEqual({enable_thinking: false});
  });

  it('reads the stream flags', () => {
    expect(
      mapped({...user, stream: true, stream_options: {include_usage: true}}),
    ).toMatchObject({stream: true, includeUsage: true});
  });

  it('ignores model, user and unknown fields', () => {
    expect(
      mapped({...user, model: 'gpt-4', user: 'u', whatever: 1}).params,
    ).not.toHaveProperty('model');
  });

  it('accepts an empty tools list and tool_choice none', () => {
    expect(
      validateChatRequest({...user, tools: [], tool_choice: 'none'}).ok,
    ).toBe(true);
  });

  it.each([
    [{tools: [{type: 'function'}]}, 'tools'],
    [{tool_choice: 'auto'}, 'tool_choice'],
    [{n: 2}, 'n'],
    [{logprobs: true}, 'logprobs'],
    [
      {
        messages: [
          {role: 'user', content: [{type: 'image_url', image_url: {}}]},
        ],
      },
      'non-text content parts',
    ],
  ])('rejects %j as unsupported', (fields, name) => {
    expect(rejected({...user, ...fields})).toEqual({
      status: 400,
      message: `${name} is not supported`,
      type: 'invalid_request_error',
      code: 'unsupported_parameter',
    });
  });

  it.each([
    ['a non-object body', []],
    ['missing messages', {}],
    ['empty messages', {messages: []}],
    ['an unknown role', {messages: [{role: 'tool', content: 'x'}]}],
    ['non-string content', {messages: [{role: 'user', content: 3}]}],
    ['a non-numeric temperature', {...user, temperature: 'hot'}],
    ['a non-string stop', {...user, stop: [1]}],
  ])('rejects %s as invalid', (_label, body) => {
    expect(rejected(body)).toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });
});

describe('response shapes', () => {
  const ids = {id: 'chatcmpl-x', created: 1700000000, model: 'm'};
  const result: CompletionResult = {
    text: 'raw',
    content: 'hello',
    reasoning_content: 'thought',
    tokens_evaluated: 5,
    tokens_predicted: 3,
    stopped_eos: true,
  };

  it('builds a chat.completion', () => {
    expect(toCompletion(result, ids)).toEqual({
      id: 'chatcmpl-x',
      object: 'chat.completion',
      created: 1700000000,
      model: 'm',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'hello',
            reasoning_content: 'thought',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {prompt_tokens: 5, completion_tokens: 3, total_tokens: 8},
    });
  });

  it.each([
    [{stopped_limit: 1}, 'length'],
    [{context_full: true}, 'length'],
    [{stopped_word: '</s>'}, 'stop'],
  ])('reports finish_reason for %j', (fields, reason) => {
    expect(
      toCompletion({text: '', content: '', ...fields}, ids).choices[0]
        .finish_reason,
    ).toBe(reason);
  });

  it('builds chunks and a final chunk with optional usage', () => {
    expect(toChunk({role: 'assistant', content: 'a'}, ids)).toEqual({
      id: 'chatcmpl-x',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'm',
      choices: [
        {
          index: 0,
          delta: {role: 'assistant', content: 'a'},
          finish_reason: null,
        },
      ],
    });
    expect(toFinalChunk(result, ids, false)).not.toHaveProperty('usage');
    expect(toFinalChunk(result, ids, true)).toMatchObject({
      choices: [{delta: {}, finish_reason: 'stop'}],
      usage: {total_tokens: 8},
    });
  });

  it('builds ids from the request start', () => {
    const made = newCompletionIds('m', 1700000000999);
    expect(made.created).toBe(1700000000);
    expect(made.id).toMatch(/^chatcmpl-[a-z0-9]+$/);
  });

  it('builds an OpenAI error body', () => {
    expect(errorBody({message: 'm', type: 't', code: 'c'})).toEqual({
      error: {message: 'm', type: 't', code: 'c'},
    });
  });
});
