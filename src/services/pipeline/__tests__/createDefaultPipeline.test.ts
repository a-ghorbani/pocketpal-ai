/**
 * createDefaultPipeline factory + integration tests.
 *
 * Tests the canonical filter → analysis → TTS configuration end-to-end
 * with mock engines.
 */

import {
  createDefaultPipeline,
  createContext,
  DEFAULT_PIPELINE_CONFIG,
} from '../index';
import type {CompletionEngine, CompletionResult} from '../../../utils/completionTypes';
import type {Engine as TTSEngine, Voice} from '../../tts/types';

function mockEngine(result: Partial<CompletionResult>): CompletionEngine {
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

function mockTTS(voices: Voice[] = []): TTSEngine {
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

describe('createDefaultPipeline', () => {
  describe('default config (filter + analysis, no TTS)', () => {
    it('includes filter and analysis stages', () => {
      const pipeline = createDefaultPipeline({
        filterEngine: mockEngine({text: 'analyze'}),
        analysisEngine: mockEngine({text: 'response'}),
      });
      expect(pipeline.listStages()).toEqual(['filter', 'analysis']);
    });

    it('runs filter → analysis when filter says analyze', async () => {
      const filterEngine = mockEngine({text: 'analyze'});
      const analysisEngine = mockEngine({text: 'It is a technique.'});
      const pipeline = createDefaultPipeline({filterEngine, analysisEngine});

      const result = await pipeline.run(createContext('what is RAG?'));

      expect(result.filterResult).toBe('analyze');
      expect(result.shouldAnalyze).toBe(true);
      expect(result.response).toBe('It is a technique.');
      expect(analysisEngine.completion).toHaveBeenCalled();
    });

    it('skips analysis when filter says trivial', async () => {
      const filterEngine = mockEngine({text: 'trivial'});
      const analysisEngine = mockEngine({text: 'should not run'});
      const pipeline = createDefaultPipeline({filterEngine, analysisEngine});

      const result = await pipeline.run(createContext('hi'));

      expect(result.shouldAnalyze).toBe(false);
      expect(result.response).toBeUndefined();
      expect(analysisEngine.completion).not.toHaveBeenCalled();
    });

    it('records both stages in metadata on success', async () => {
      const pipeline = createDefaultPipeline({
        filterEngine: mockEngine({text: 'analyze'}),
        analysisEngine: mockEngine({text: 'answer'}),
      });

      const result = await pipeline.run(createContext('explain'));

      const names = result.metadata.stages.map(s => s.name);
      expect(names).toContain('filter');
      expect(names).toContain('analysis');
    });
  });

  describe('enableFilter: false', () => {
    it('skips the filter stage entirely', () => {
      const pipeline = createDefaultPipeline(
        {
          filterEngine: mockEngine({text: 'x'}),
          analysisEngine: mockEngine({text: 'y'}),
        },
        {enableFilter: false},
      );
      expect(pipeline.listStages()).toEqual(['analysis']);
    });

    it('analysis runs because shouldAnalyze defaults to true', async () => {
      const analysisEngine = mockEngine({text: 'response'});
      const pipeline = createDefaultPipeline(
        {filterEngine: mockEngine({}), analysisEngine},
        {enableFilter: false},
      );

      const result = await pipeline.run(createContext('anything'));

      expect(result.response).toBe('response');
      expect(analysisEngine.completion).toHaveBeenCalled();
    });
  });

  describe('enableTTS: true', () => {
    it('appends a TTS stage', () => {
      const pipeline = createDefaultPipeline(
        {
          filterEngine: mockEngine({text: 'analyze'}),
          analysisEngine: mockEngine({text: 'answer'}),
          ttsEngine: mockTTS([{id: 'v', name: 'A', engine: 'system'}]),
        },
        {enableTTS: true},
      );
      expect(pipeline.listStages()).toEqual(['filter', 'analysis', 'tts']);
    });

    it('runs TTS after analysis produces a response', async () => {
      const ttsEngine = mockTTS([{id: 'v', name: 'A', engine: 'system'}]);
      const pipeline = createDefaultPipeline(
        {
          filterEngine: mockEngine({text: 'analyze'}),
          analysisEngine: mockEngine({text: 'spoken response'}),
          ttsEngine,
        },
        {enableTTS: true},
      );

      const result = await pipeline.run(createContext('say hello'));

      expect(ttsEngine.play).toHaveBeenCalledWith(
        'spoken response',
        expect.objectContaining({id: 'v'}),
      );
      expect(result.audioUri).toBe('tts://played');
    });

    it('skips TTS when analysis is skipped (no response)', async () => {
      const ttsEngine = mockTTS([{id: 'v', name: 'A', engine: 'system'}]);
      const pipeline = createDefaultPipeline(
        {
          filterEngine: mockEngine({text: 'trivial'}),
          analysisEngine: mockEngine({text: 'should not run'}),
          ttsEngine,
        },
        {enableTTS: true},
      );

      const result = await pipeline.run(createContext('hi'));

      expect(result.response).toBeUndefined();
      expect(ttsEngine.play).not.toHaveBeenCalled();
      // filter ran, analysis skipped (condition false), tts skipped (condition false)
      const statuses = result.metadata.stages.map(s => s.status);
      expect(statuses).toContain('skipped');
    });
  });

  describe('full pipeline integration (filter → analysis → TTS)', () => {
    it('end-to-end: filter routes to analysis → analysis responds → TTS speaks', async () => {
      const filterEngine = mockEngine({text: 'analyze'});
      const analysisEngine = mockEngine({
        text: 'RAG stands for Retrieval-Augmented Generation.',
        tokens_predicted: 50,
        tokens_evaluated: 120,
      });
      const ttsEngine = mockTTS([{id: 'v1', name: 'Sarah', engine: 'system'}]);

      const pipeline = createDefaultPipeline(
        {filterEngine, analysisEngine, ttsEngine},
        {enableTTS: true},
      );

      const result = await pipeline.run(createContext('what is RAG?'));

      // Filter
      expect(result.filterResult).toBe('analyze');
      expect(result.shouldAnalyze).toBe(true);
      // Analysis
      expect(result.response).toBe('RAG stands for Retrieval-Augmented Generation.');
      // TTS
      expect(result.audioUri).toBe('tts://played');
      // Metadata
      expect(result.metadata.stages).toHaveLength(3);
      expect(result.metadata.stages.every(s => s.status === 'success')).toBe(true);
      expect(result.metadata.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('end-to-end: trivial message skips analysis and TTS', async () => {
      const filterEngine = mockEngine({text: 'trivial'});
      const analysisEngine = mockEngine({text: 'no'});
      const ttsEngine = mockTTS([{id: 'v', name: 'A', engine: 'system'}]);

      const pipeline = createDefaultPipeline(
        {filterEngine, analysisEngine, ttsEngine},
        {enableTTS: true},
      );

      const result = await pipeline.run(createContext('hi'));

      expect(result.filterResult).toBe('trivial');
      expect(result.shouldAnalyze).toBe(false);
      expect(result.response).toBeUndefined();
      expect(result.audioUri).toBeUndefined();

      // Only the filter stage ran successfully; analysis + TTS were skipped
      const statuses = result.metadata.stages.map(s => s.status);
      expect(statuses.filter(s => s === 'success')).toHaveLength(1);
      expect(statuses.filter(s => s === 'skipped')).toHaveLength(2);
    });
  });

  describe('createContext helper', () => {
    it('initializes with shouldAnalyze=true', () => {
      const ctx = createContext('hello');
      expect(ctx.userMessage).toBe('hello');
      expect(ctx.shouldAnalyze).toBe(true);
      expect(ctx.metadata.stages).toEqual([]);
    });

    it('accepts conversation history', () => {
      const history = [{role: 'user' as const, content: 'prev'}];
      const ctx = createContext('next', history);
      expect(ctx.history).toEqual(history);
    });
  });
});
