import {useCallback, useContext, useEffect, useRef, useState} from 'react';

import {toJS} from 'mobx';

import {modelStore} from '../store';
import type {GenerationLease} from '../store/generationLease';
import {safeParseJSON} from '../utils';
import {L10nContext} from '../utils';
import {stopQuietly} from '../utils/stopQuietly';

export const useStructuredOutput = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l10n = useContext(L10nContext);

  const leaseRef = useRef<GenerationLease | null>(null);
  const cancelledRef = useRef(false);

  const stop = useCallback(() => {
    leaseRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const cancel = useCallback(() => {
    setIsBusy(false);
    if (!leaseRef.current) {
      return;
    }
    cancelledRef.current = true;
    leaseRef.current.abort();
  }, []);

  useEffect(() => cancel, [cancel]);

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
      cancelledRef.current = false;
      setIsBusy(false);
      const lease = modelStore.tryAcquireGeneration();
      if (!lease) {
        if (modelStore.isGenerationBusy) {
          setIsBusy(true);
          return undefined;
        }
        throw new Error(l10n.generation.modelNotInitialized);
      }
      const onAbort = () => stopQuietly(() => lease.engine.stopCompletion());
      try {
        leaseRef.current = lease;
        setIsGenerating(true);
        setError(null);
        const stopWords = toJS(modelStore.activeModel?.stopWords);
        lease.signal.addEventListener('abort', onAbort, {once: true});

        const result = await lease.engine.completion({
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
        });

        return cancelledRef.current ? undefined : safeParseJSON(result.text);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : l10n.generation.failedToGenerate;
        setError(errorMessage);
        throw err;
      } finally {
        lease.signal.removeEventListener('abort', onAbort);
        lease.end();
        leaseRef.current = null;
        setIsGenerating(false);
      }
    },
    [l10n.generation],
  );

  return {
    generate,
    isGenerating,
    isBusy,
    error,
    stop,
    cancel,
  };
};
