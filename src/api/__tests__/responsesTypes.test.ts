import {isResponsesReplayState} from '../responsesTypes';

const validState = {
  version: 1,
  binding: {
    wireApi: 'responses',
    serverUrl: 'https://example.test',
    modelId: 'model-test',
    credentialRevision: 2,
  },
  terminalStatus: 'completed',
  output: [
    {
      type: 'reasoning',
      id: 'reasoning-1',
      encrypted_content: 'opaque-test-value',
      summary: [{type: 'summary_text', text: 'Synthetic summary'}],
    },
    {
      type: 'function_call',
      id: 'item-1',
      call_id: 'call-1',
      name: 'calculate',
      arguments: '{"expression":"2+2"}',
      status: 'completed',
    },
  ],
};

describe('Responses replay state contract', () => {
  it('accepts validated completed replay state', () => {
    expect(isResponsesReplayState(validState)).toBe(true);
  });

  it.each([
    [{...validState, version: 2}],
    [{...validState, terminalStatus: 'incomplete'}],
    [
      {
        ...validState,
        binding: {...validState.binding, wireApi: 'chat-completions'},
      },
    ],
    [{...validState, output: [{type: 'function_call', id: 'item-1'}]}],
    [{...validState, output: [{type: 'hosted_tool_call', id: 'item-1'}]}],
  ])('rejects non-replayable state %#', value => {
    expect(isResponsesReplayState(value)).toBe(false);
  });

  it('keeps output item id and function call id distinct', () => {
    const call = validState.output[1];
    expect(call.id).toBe('item-1');
    expect(call.call_id).toBe('call-1');
  });
});
