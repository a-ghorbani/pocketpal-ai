/**
 * Tests for thinking capability detection utilities
 */

import {detectThinkingCapability} from '../thinkingCapabilityDetection';
import {LlamaContext} from 'llama.rn';

const createMockContext = (getFormattedChatResult: any) => {
  return {
    getFormattedChat: jest.fn().mockResolvedValue(getFormattedChatResult),
  } as unknown as LlamaContext;
};

describe('detectThinkingCapability', () => {
  it('should detect thinking support when thinking_start_tag is present', async () => {
    const ctx = createMockContext({
      type: 'jinja',
      prompt: '<|im_start|>user\ntest<|im_end|>\n<|im_start|>assistant\n',
      has_media: false,
      thinking_start_tag: '<think>',
      thinking_end_tag: '</think>',
    });

    const result = await detectThinkingCapability(ctx);

    expect(result).toEqual({
      supported: true,
      thinkingStartTag: '<think>',
      thinkingEndTag: '</think>',
    });
  });

  it('should return false when no thinking tags present', async () => {
    const ctx = createMockContext({
      type: 'jinja',
      prompt: '<|im_start|>user\ntest<|im_end|>\n<|im_start|>assistant\n',
      has_media: false,
    });

    const result = await detectThinkingCapability(ctx);
    expect(result).toEqual({supported: false});
  });

  it('should return false when getFormattedChat throws', async () => {
    const ctx = {
      getFormattedChat: jest
        .fn()
        .mockRejectedValue(new Error('Jinja not supported')),
    } as unknown as LlamaContext;

    const result = await detectThinkingCapability(ctx);
    expect(result).toEqual({supported: false});
  });

  it('should call getFormattedChat with correct parameters', async () => {
    const ctx = createMockContext({
      type: 'jinja',
      prompt: '',
      has_media: false,
    });

    await detectThinkingCapability(ctx);

    expect(ctx.getFormattedChat).toHaveBeenCalledWith(
      [{role: 'user', content: 'test'}],
      null,
      {jinja: true, enable_thinking: true},
    );
  });

  it('should return false when thinking_start_tag is empty string', async () => {
    const ctx = createMockContext({
      type: 'jinja',
      prompt: '<|im_start|>user\ntest<|im_end|>\n<|im_start|>assistant\n',
      has_media: false,
      thinking_start_tag: '',
    });

    const result = await detectThinkingCapability(ctx);
    expect(result).toEqual({supported: false});
  });

  it('should handle various thinking tag formats', async () => {
    // Gemma 4 style
    const ctx = createMockContext({
      type: 'jinja',
      prompt: '...',
      has_media: false,
      thinking_start_tag: '<start_of_thought>',
      thinking_end_tag: '<end_of_thought>',
    });

    const result = await detectThinkingCapability(ctx);
    expect(result).toEqual({
      supported: true,
      thinkingStartTag: '<start_of_thought>',
      thinkingEndTag: '<end_of_thought>',
    });
  });
});
