import {createTriggerMarkerCache} from '../triggerMarkers';
import type {ToolDefinition} from '../../talents/types';
import type {JinjaFormattedChatResult} from 'llama.rn';

const tool = (name: string): ToolDefinition => ({
  type: 'function',
  function: {name, description: name, parameters: {}},
});

function makeFormattedChat(
  triggers: Array<{value?: string}> | undefined,
): () => Promise<JinjaFormattedChatResult> {
  return async () =>
    ({
      grammar_triggers: triggers,
    }) as unknown as JinjaFormattedChatResult;
}

describe('createTriggerMarkerCache', () => {
  it('extracts string-valued markers from grammar_triggers', async () => {
    const cache = createTriggerMarkerCache();
    const result = await cache.getMarkers(
      'ctx',
      [tool('calculate')],
      makeFormattedChat([{value: '<|tool_call|>'}, {value: '<tools>'}]),
    );
    expect(result).toEqual(['<|tool_call|>', '<tools>']);
  });

  it('returns [] when grammar_triggers is undefined', async () => {
    const cache = createTriggerMarkerCache();
    const result = await cache.getMarkers(
      'ctx',
      [tool('calculate')],
      makeFormattedChat(undefined),
    );
    expect(result).toEqual([]);
  });

  it('returns [] when grammar_triggers is empty', async () => {
    const cache = createTriggerMarkerCache();
    const result = await cache.getMarkers(
      'ctx',
      [tool('calculate')],
      makeFormattedChat([]),
    );
    expect(result).toEqual([]);
  });

  it('filters out token-only / non-string entries', async () => {
    const cache = createTriggerMarkerCache();
    const result = await cache.getMarkers(
      'ctx',
      [tool('calculate')],
      makeFormattedChat([
        {value: '<sentinel>'},
        {value: ''},
        // token-only entry (no `value`):
        {} as any,
        {value: undefined as unknown as string},
      ]),
    );
    expect(result).toEqual(['<sentinel>']);
  });

  it('caches results by contextId + sorted tool names', async () => {
    const cache = createTriggerMarkerCache();
    const fc = jest.fn(makeFormattedChat([{value: 'X'}]));
    const r1 = await cache.getMarkers('ctx', [tool('calculate')], fc);
    const r2 = await cache.getMarkers('ctx', [tool('calculate')], fc);
    expect(r1).toEqual(['X']);
    expect(r2).toEqual(['X']);
    // Second call hits the cache — getFormattedChat invoked exactly once.
    expect(fc).toHaveBeenCalledTimes(1);
  });

  it('different tool sets produce different cache entries', async () => {
    const cache = createTriggerMarkerCache();
    const fc1 = jest.fn(makeFormattedChat([{value: 'A'}]));
    const fc2 = jest.fn(makeFormattedChat([{value: 'B'}]));
    const a = await cache.getMarkers('ctx', [tool('calculate')], fc1);
    const b = await cache.getMarkers('ctx', [tool('datetime')], fc2);
    expect(a).toEqual(['A']);
    expect(b).toEqual(['B']);
    expect(fc1).toHaveBeenCalledTimes(1);
    expect(fc2).toHaveBeenCalledTimes(1);
  });

  it('different contextIds produce different cache entries even with same tools', async () => {
    const cache = createTriggerMarkerCache();
    const fc1 = jest.fn(makeFormattedChat([{value: 'A'}]));
    const fc2 = jest.fn(makeFormattedChat([{value: 'B'}]));
    await cache.getMarkers('ctx-1', [tool('calculate')], fc1);
    await cache.getMarkers('ctx-2', [tool('calculate')], fc2);
    expect(fc1).toHaveBeenCalledTimes(1);
    expect(fc2).toHaveBeenCalledTimes(1);
  });

  it('order of tool names does not affect cache key (sorted internally)', async () => {
    const cache = createTriggerMarkerCache();
    const fc = jest.fn(makeFormattedChat([{value: 'M'}]));
    await cache.getMarkers('ctx', [tool('calculate'), tool('datetime')], fc);
    await cache.getMarkers('ctx', [tool('datetime'), tool('calculate')], fc);
    // Same key — second call hits cache.
    expect(fc).toHaveBeenCalledTimes(1);
  });

  it('fails open when getFormattedChat throws', async () => {
    const cache = createTriggerMarkerCache();
    const fc = jest.fn(() => Promise.reject(new Error('boom')));
    const result = await cache.getMarkers('ctx', [tool('calculate')], fc);
    expect(result).toEqual([]);
    // Subsequent calls also return [] from cache (no retry storm).
    const result2 = await cache.getMarkers('ctx', [tool('calculate')], fc);
    expect(result2).toEqual([]);
    expect(fc).toHaveBeenCalledTimes(1);
  });

  it('different cache instances do not share state (factory pattern)', async () => {
    const fc = jest.fn(makeFormattedChat([{value: 'V'}]));
    const c1 = createTriggerMarkerCache();
    const c2 = createTriggerMarkerCache();
    await c1.getMarkers('ctx', [tool('x')], fc);
    await c2.getMarkers('ctx', [tool('x')], fc);
    // Each cache invokes getFormattedChat once on its own first miss.
    expect(fc).toHaveBeenCalledTimes(2);
  });
});
