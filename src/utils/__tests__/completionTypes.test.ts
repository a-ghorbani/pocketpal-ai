import {toApiCompletionParams} from '../completionTypes';

describe('toApiCompletionParams', () => {
  it('removes app-only fields', () => {
    const result = toApiCompletionParams({
      version: 3,
      include_thinking_in_context: true,
      temperature: 0.7,
      prompt: '',
    } as any);

    expect((result as any).version).toBeUndefined();
    expect((result as any).include_thinking_in_context).toBeUndefined();
    expect((result as any).temperature).toBe(0.7);
  });

  it('removes prompt when messages are present', () => {
    const result = toApiCompletionParams({
      prompt: '',
      messages: [{role: 'user', content: 'test'}],
      temperature: 0.7,
    } as any);

    expect((result as any).messages).toEqual([{role: 'user', content: 'test'}]);
    expect('prompt' in (result as any)).toBe(false);
  });
});
