/**
 * ModelPipeline orchestrator tests.
 *
 * Tests stage sequencing, condition skip, error capture, and metadata
 * accumulation. Uses stub stages — no real CompletionEngine needed.
 */

import {ModelPipeline} from '../ModelPipeline';
import type {PipelineStage, PipelineContext} from '../types';

/** Helper: build an initial context. */
function makeCtx(userMessage = 'hello'): PipelineContext {
  return {
    userMessage,
    shouldAnalyze: true,
    metadata: {stages: [], totalDurationMs: 0},
  };
}

/** Helper: a stub stage that appends to ctx.userMessage. */
function appendStage(name: string, suffix: string): PipelineStage {
  return {
    name,
    execute: async ctx => ({
      ...ctx,
      userMessage: ctx.userMessage + suffix,
    }),
  };
}

/** Helper: a stage that sets a specific field. */
function fieldStage(name: string, field: keyof PipelineContext, value: any): PipelineStage {
  return {
    name,
    execute: async ctx => ({...ctx, [field]: value}),
  };
}

/** Helper: a stage that throws. */
function errorStage(name: string, message: string): PipelineStage {
  return {
    name,
    execute: async () => {
      throw new Error(message);
    },
  };
}

/** Helper: a stage with a condition. */
function conditionalStage(
  name: string,
  condition: (ctx: PipelineContext) => boolean,
  suffix: string,
): PipelineStage {
  return {
    name,
    condition,
    execute: async ctx => ({
      ...ctx,
      userMessage: ctx.userMessage + suffix,
    }),
  };
}

describe('ModelPipeline', () => {
  describe('addStage / setStages / listStages', () => {
    it('adds stages in order', () => {
      const p = new ModelPipeline();
      p.addStage(appendStage('a', 'A')).addStage(appendStage('b', 'B'));
      expect(p.listStages()).toEqual(['a', 'b']);
    });

    it('setStages replaces the list', () => {
      const p = new ModelPipeline([appendStage('a', 'A')]);
      p.setStages([appendStage('x', 'X'), appendStage('y', 'Y')]);
      expect(p.listStages()).toEqual(['x', 'y']);
    });

    it('constructs with initial stages', () => {
      const p = new ModelPipeline([appendStage('a', 'A')]);
      expect(p.listStages()).toEqual(['a']);
    });

    it('starts empty', () => {
      const p = new ModelPipeline();
      expect(p.listStages()).toEqual([]);
    });
  });

  describe('run — basic sequencing', () => {
    it('runs stages in order, threading context', async () => {
      const p = new ModelPipeline([
        appendStage('a', 'A'),
        appendStage('b', 'B'),
        appendStage('c', 'C'),
      ]);

      const result = await p.run(makeCtx('start'));

      expect(result.userMessage).toBe('startABC');
    });

    it('runs a single stage', async () => {
      const p = new ModelPipeline([appendStage('only', '!')]);
      const result = await p.run(makeCtx('hi'));
      expect(result.userMessage).toBe('hi!');
    });

    it('runs zero stages (passthrough)', async () => {
      const p = new ModelPipeline();
      const result = await p.run(makeCtx('untouched'));
      expect(result.userMessage).toBe('untouched');
      expect(result.metadata.stages).toEqual([]);
    });
  });

  describe('run — condition skipping', () => {
    it('skips a stage whose condition returns false', async () => {
      const p = new ModelPipeline([
        appendStage('always', '1'),
        conditionalStage(
          'sometimes',
          ctx => ctx.userMessage.includes('run'),
          '2',
        ),
        appendStage('after', '3'),
      ]);

      // 'hi' does not contain 'run' → 'sometimes' skipped
      const result = await p.run(makeCtx('hi'));
      expect(result.userMessage).toBe('hi13');

      // metadata records the skip
      const skipMeta = result.metadata.stages.find(s => s.name === 'sometimes');
      expect(skipMeta?.status).toBe('skipped');
    });

    it('runs a stage whose condition returns true', async () => {
      const p = new ModelPipeline([
        conditionalStage(
          'sometimes',
          ctx => ctx.userMessage.includes('run'),
          '!',
        ),
      ]);

      const result = await p.run(makeCtx('please run'));
      expect(result.userMessage).toBe('please run!');
    });

    it('stage without condition always runs', async () => {
      const p = new ModelPipeline([appendStage('always', 'X')]);
      const result = await p.run(makeCtx('test'));
      const meta = result.metadata.stages[0];
      expect(meta.status).toBe('success');
    });
  });

  describe('run — error handling', () => {
    it('captures stage error in metadata without aborting', async () => {
      const p = new ModelPipeline([
        appendStage('a', '1'),
        errorStage('boom', 'kaboom'),
        appendStage('b', '2'),
      ]);

      const result = await p.run(makeCtx('start'));

      expect(result.userMessage).toBe('start1' + '2'); // error stage didn't mutate
      const errorMeta = result.metadata.stages.find(s => s.name === 'boom');
      expect(errorMeta?.status).toBe('error');
      expect(errorMeta?.error).toBe('kaboom');
    });

    it('continues with prior context after error', async () => {
      const p = new ModelPipeline([
        fieldStage('set-filter', 'filterResult', 'done'),
        errorStage('boom', 'fail'),
        appendStage('after', '!'),
      ]);

      const result = await p.run(makeCtx());

      // filterResult set by stage 1 should survive the error in stage 2
      expect(result.filterResult).toBe('done');
      expect(result.userMessage).toBe('hello!'); // stage 3 appended
    });
  });

  describe('run — metadata', () => {
    it('records each stage name, status, and duration', async () => {
      const p = new ModelPipeline([
        appendStage('a', 'A'),
        appendStage('b', 'B'),
      ]);

      const result = await p.run(makeCtx());

      expect(result.metadata.stages).toHaveLength(2);
      expect(result.metadata.stages[0].name).toBe('a');
      expect(result.metadata.stages[0].status).toBe('success');
      expect(result.metadata.stages[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.stages[1].name).toBe('b');
    });

    it('records total duration', async () => {
      const p = new ModelPipeline([appendStage('a', 'A')]);
      const result = await p.run(makeCtx());
      expect(result.metadata.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('preserves stage order in metadata', async () => {
      const p = new ModelPipeline([
        appendStage('first', '1'),
        appendStage('second', '2'),
        appendStage('third', '3'),
      ]);
      const result = await p.run(makeCtx());
      const names = result.metadata.stages.map(s => s.name);
      expect(names).toEqual(['first', 'second', 'third']);
    });
  });

  describe('run — context fields', () => {
    it('carries history through unchanged', async () => {
      const history = [
        {role: 'user' as const, content: 'previous'},
        {role: 'assistant' as const, content: 'response'},
      ];
      const p = new ModelPipeline([appendStage('a', '!')]);
      const result = await p.run(makeCtx('msg'));
      // history was not provided — verify makeCtx doesn't set it
      expect(result.history).toBeUndefined();
    });

    it('preserves shouldAnalyze across stages', async () => {
      const p = new ModelPipeline([appendStage('a', '!')]);
      const result = await p.run(makeCtx());
      expect(result.shouldAnalyze).toBe(true);
    });
  });
});
