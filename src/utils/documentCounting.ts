import {modelStore} from '../store';
import type {DocumentCounting} from '../services/documents/store';

/** Exact counting is available only from a loaded local context. */
export const documentCountingOptions = (): DocumentCounting | undefined => {
  const context = modelStore.context;
  const modelId = modelStore.activeModelId;
  if (!context || !modelId) {
    return undefined;
  }
  return {
    modelId,
    tokenize: async text => (await context.tokenize(text)).tokens.length,
  };
};
