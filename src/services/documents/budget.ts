import {documentKey} from './render';
import type {DocumentRef} from './types';
import type {MessageType} from '../../utils/types';

export const documentTokens = (
  ref: DocumentRef,
  activeModelId: string | undefined,
  missingKeys: ReadonlySet<string> = new Set(),
): number => {
  if (missingKeys.has(documentKey(ref))) {
    return 0;
  }
  return ref.tokenCount && ref.tokenCount.modelId === activeModelId
    ? ref.tokenCount.n
    : ref.tokenEstimate;
};

export const displayTokens = (ref: DocumentRef): number =>
  ref.tokenCount?.n ?? ref.tokenEstimate;

export const hasDocuments = (
  rows: MessageType.Any[],
  message: MessageType.PartialText,
): boolean =>
  !!message.documents?.length ||
  rows.some(row => row.type === 'text' && !!row.documents?.length);
