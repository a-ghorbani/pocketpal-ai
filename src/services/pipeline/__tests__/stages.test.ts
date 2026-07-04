/**
 * FilterStage, AnalysisStage, TTSStage tests.
 *
 * Each stage is tested in isolation with mock engines.
 */

import {FilterStage} from '../stages/FilterStage';
import {AnalysisStage} from '../stages/AnalysisStage';
import {TTSStage} from '../stages/TTSStage';
import type {CompletionEngine, CompletionResult} from '../../../utils/completionTypes';
import type {Engine as TTSEngine, Voice} from '../../tts/types';
import type {PipelineContext} from '../types';

/** Build a mock CompletionEngine that returns a fixed result. */
function mockCompletionEngine(result: Partial<CompletionResult>): CompletionEngine {
  return {
    completion: jest.fn().mockResolvedValue({
      text: result.text || '',
      content: result.content || '',
      reasoning_content: result.reasoning_content,
      tokens_predicted: result.tokens_predicted,
      tokens_evaluated: result.tokens_evaluated,
    } as CompletionResult),
    stopCompletion: jest.fn().mockResolvedValue(undefined),
  };
}

/** Build a mock TTS engine. */
function mockTTSEngine(voices: Voice[] = []): TTSEngine {
  return {
    id: 'system',
    isInstalled: jest.fn().mockResolvedValue(true),
    getVoices: jest.fn().mockResolvedValue(voices),
    loadInto: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    playStreaming: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
  };
}

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    userMessage: 'test message',
    shouldAnalyze: true,
    metadata: {stages: [], totalDurationMs: 0},
    ...overrides,
  };
}

describe('FilterStage', () => {
  it('sets shouldAnalyze=true when result contains the keyword', async () => {
    const engine = mockCompletionEngine({text: 'analyze'});
    const stage = new FilterStage(engine, 'analyze');

    const result = await stage.execute(makeCtx({userMessage: 'explain RAG'}));

    expect(result.filterResult).toBe('analyze');
    expect(result.shouldAnalyze).toBe(true);
  });

  it('sets shouldAnalyze=false when result does NOT contain the keyword', async () => {
    const engine = mockCompletionEngine({text: 'trivial'});
    const stage = new FilterStage(engine, 'analyze');

    const result = await stage.execute(makeCtx());

    expect(result.filterResult).toBe('trivial');
    expect(result.shouldAnalyze).toBe(false);
  });

  it('is case-insensitive', async () => {
    const engine = mockCompletionEngine({text: 'ANALYZE'});
    const stage = new FilterStage(engine, 'analyze');
    const result = await stage.execute(makeCtx());
    expect(result.shouldAnalyze).toBe(true);
  });

  it('handles empty filter result', async () => {
    const engine = mockCompletionEngine({text: ''});
    const stage = new FilterStage(engine, 'analyze');
    const result = await stage.execute(makeCtx());
    expect(result.shouldAnalyze).toBe(false);
    expect(result.filterResult).toBe('');
  });

  it('uses a custom keyword', async () => {
    const engine = mockCompletionEngine({text: 'deep_think'});
    const stage = new FilterStage(engine, 'deep_think');
    const result = await stage.execute(makeCtx());
    expect(result.shouldAnalyze).toBe(true);
  });

  it('preserves the original userMessage', async () => {
    const engine = mockCompletionEngine({text: 'analyze'});
    const stage = new FilterStage(engine);
    const result = await stage.execute(makeCtx({userMessage: 'keep me'}));
    expect(result.userMessage).toBe('keep me');
  });

  it('calls the engine with low n_predict (one word)', async () => {
    const engine = mockCompletionEngine({text: 'analyze'});
    const stage = new FilterStage(engine);
    await stage.execute(makeCtx());

    const call = (engine.completion as jest.Mock).mock.calls[0][0];
    expect(call.n_predict).toBeLessThanOrEqual(8);
    expect(call.temperature).toBe(0);
  });

  it('passes the user message to the engine', async () => {
    const engine = mockCompletionEngine({text: 'analyze'});
    const stage = new FilterStage(engine);
    await stage.execute(makeCtx({userMessage: 'what is python?'}));

    const call = (engine.completion as jest.Mock).mock.calls[0][0];
    const userMsg = call.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content).toBe('what is python?');
  });
});

describe('AnalysisStage', () => {
  it('produces a response from the engine', async () => {
    const engine = mockCompletionEngine({text: 'RAG is retrieval-augmented generation.'});
    const stage = new AnalysisStage(engine);

    const result = await stage.execute(makeCtx({userMessage: 'what is RAG?'}));

    expect(result.response).toBe('RAG is retrieval-augmented generation.');
  });

  it('condition() returns ctx.shouldAnalyze', () => {
    const engine = mockCompletionEngine({text: 'ok'});
    const stage = new AnalysisStage(engine);

    expect(stage.condition?.(makeCtx({shouldAnalyze: true}))).toBe(true);
    expect(stage.condition?.(makeCtx({shouldAnalyze: false}))).toBe(false);
  });

  it('includes conversation history in the messages', async () => {
    const engine = mockCompletionEngine({text: 'response'});
    const stage = new AnalysisStage(engine);

    await stage.execute(
      makeCtx({
        userMessage: 'tell me more',
        history: [
          {role: 'user', content: 'what is python?'},
          {role: 'assistant', content: 'a programming language'},
        ],
      }),
    );

    const call = (engine.completion as jest.Mock).mock.calls[0][0];
    // system + 2 history + current = 4 messages
    expect(call.messages).toHaveLength(4);
    expect(call.messages[1].content).toBe('what is python?');
  });

  it('uses a custom system prompt', async () => {
    const engine = mockCompletionEngine({text: 'ok'});
    const stage = new AnalysisStage(engine, 'You are a Python expert.');

    await stage.execute(makeCtx());

    const call = (engine.completion as jest.Mock).mock.calls[0][0];
    expect(call.messages[0].content).toBe('You are a Python expert.');
  });

  it('records token counts in metadata', async () => {
    const engine = mockCompletionEngine({
      text: 'answer',
      tokens_predicted: 42,
      tokens_evaluated: 100,
    });
    const stage = new AnalysisStage(engine);

    const result = await stage.execute(makeCtx());

    const stageMeta = result.metadata.stages.find(s => s.name === 'analysis');
    expect(stageMeta?.tokensPredicted).toBe(42);
    expect(stageMeta?.tokensEvaluated).toBe(100);
  });

  it('captures reasoning_content from thinking models', async () => {
    const engine = mockCompletionEngine({
      text: 'final answer',
      reasoning_content: 'thinking step by step...',
    });
    const stage = new AnalysisStage(engine);

    const result = await stage.execute(makeCtx());

    expect(result.reasoning).toBe('thinking step by step...');
  });

  it('falls back to content field if text is empty', async () => {
    const engine = mockCompletionEngine({text: '', content: 'from content field'});
    const stage = new AnalysisStage(engine);

    const result = await stage.execute(makeCtx());

    expect(result.response).toBe('from content field');
  });
});

describe('TTSStage', () => {
  it('condition() returns true when response exists', () => {
    const engine = mockTTSEngine();
    const stage = new TTSStage(engine);
    expect(stage.condition?.(makeCtx({response: 'speak this'}))).toBe(true);
  });

  it('condition() returns false when response is empty', () => {
    const engine = mockTTSEngine();
    const stage = new TTSStage(engine);
    expect(stage.condition?.(makeCtx({response: ''}))).toBe(false);
    expect(stage.condition?.(makeCtx({}))).toBe(false);
  });

  it('plays the response with the provided voice', async () => {
    const engine = mockTTSEngine();
    const voice: Voice = {id: 'v1', name: 'Sarah', engine: 'system'};
    const stage = new TTSStage(engine, voice);

    const result = await stage.execute(
      makeCtx({response: 'hello world'}),
    );

    expect(engine.play).toHaveBeenCalledWith('hello world', voice);
    expect(result.audioUri).toBe('tts://played');
  });

  it('picks the first available voice when none provided', async () => {
    const voices: Voice[] = [
      {id: 'v1', name: 'Alice', engine: 'system'},
      {id: 'v2', name: 'Bob', engine: 'system'},
    ];
    const engine = mockTTSEngine(voices);
    const stage = new TTSStage(engine);

    await stage.execute(makeCtx({response: 'test'}));

    expect(engine.play).toHaveBeenCalledWith('test', voices[0]);
  });

  it('throws when no voices are available', async () => {
    const engine = mockTTSEngine([]);
    const stage = new TTSStage(engine);

    await expect(
      stage.execute(makeCtx({response: 'test'})),
    ).rejects.toThrow('No TTS voices');
  });

  it('sets audioUri on the context', async () => {
    const engine = mockTTSEngine([{id: 'v1', name: 'A', engine: 'system'}]);
    const stage = new TTSStage(engine);

    const result = await stage.execute(makeCtx({response: 'hi'}));

    expect(result.audioUri).toBe('tts://played');
  });

  it('does not modify the response', async () => {
    const engine = mockTTSEngine([{id: 'v1', name: 'A', engine: 'system'}]);
    const stage = new TTSStage(engine);

    const result = await stage.execute(makeCtx({response: 'keep me'}));

    expect(result.response).toBe('keep me');
  });
});
