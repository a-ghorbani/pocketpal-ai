import {useCallback, useRef, useState, useContext} from 'react';

import {toJS} from 'mobx';

import {chatSessionStore, modelStore} from '../store';
import {safeParseJSON} from '../utils';
import {L10nContext} from '../utils';

export const useStructuredOutput = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l10n = useContext(L10nContext);

  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  const generate = useCallback(
    async (
      prompt: string,
      schema: object,
      options?: {
        temperature?: number;
        top_p?: number;
        top_k?: number;
        repeat_penalty?: number;
      },
    ) => {
      // `engine` is set for both local (LocalCompletionEngine wrapping a
      // LlamaContext) and remote (OpenAICompletionEngine) — so structured
      // output works against any backend that honours
      // response_format.json_schema.
      const engine = modelStore.engine;
      if (!engine) {
        throw new Error(l10n.generation.modelNotInitialized);
      }

      setIsGenerating(true);
      setError(null);
      const stopWords = toJS(modelStore.activeModel?.stopWords);

      try {
        stopRef.current = () => {
          engine.stopCompletion().catch(() => {});
        };

        const resolvedSettings =
          await chatSessionStore.getCurrentCompletionSettings(
            modelStore.activeModelCompletionSettings,
          );
        const result = await engine.completion({
          ...resolvedSettings,
          messages: [{role: 'user', content: prompt}],
          response_format: {
            type: 'json_schema',
            json_schema: {
              strict: true,
              schema,
            },
          },
          temperature: options?.temperature ?? 0.2,
          top_p: options?.top_p ?? 0.9,
          top_k: options?.top_k ?? 40,
          n_predict: 2000,

          stop: stopWords,
          enable_thinking: false,
          ...(resolvedSettings.generationParameterModes
            ? {
                generationParameterModes:
                  resolvedSettings.generationParameterModes,
              }
            : {}),
        });

        stopRef.current = null;
        if (result.refusal) {
          throw new Error('The model refused the structured output request');
        }
        if (
          result.interrupted ||
          (result.terminal_status && result.terminal_status !== 'completed')
        ) {
          const reason =
            result.incomplete_reason === 'max_output_tokens'
              ? 'output token limit reached'
              : result.terminal_status || 'interrupted';
          throw new Error(`Structured output was not completed: ${reason}`);
        }
        const parsed = safeParseJSON(result.text);
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.error instanceof Error
        ) {
          throw parsed.error;
        }
        return parsed;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : l10n.generation.failedToGenerate;
        setError(errorMessage);
        throw err;
      } finally {
        setIsGenerating(false);
        stopRef.current = null;
      }
    },
    [l10n.generation],
  );

  return {
    generate,
    isGenerating,
    error,
    stop,
  };
};
