import {estimateDocTokens} from './estimate';

import {DOCUMENT_LEAD, documentKey} from './render';
import {REPLY_RESERVE, type DocumentRef} from './types';
import type {MessageType} from '../../utils/types';

export interface BudgetDocument {
  ref: DocumentRef;
  tokens: number;
}

export type BudgetVerdict =
  | {kind: 'fits'}
  | {kind: 'unknown'}
  | {
      kind: 'over';
      needed: number;
      available: number;
      newDocs: BudgetDocument[];
      historyDocTokens: number;
      historyOverflow: boolean;
    };

export interface DocumentBudgetInput {
  windowTokens: number | undefined;
  activeModelId: string | undefined;
  nonDocText: string;
  history: DocumentRef[][];
  newRefs: DocumentRef[];
  missingKeys: ReadonlySet<string>;
}

const LEAD_TOKENS = estimateDocTokens(`${DOCUMENT_LEAD}\n\n`);

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

export const evaluateDocumentBudget = ({
  windowTokens,
  activeModelId,
  nonDocText,
  history,
  newRefs,
  missingKeys,
}: DocumentBudgetInput): BudgetVerdict => {
  const historyRows = history.filter(refs => refs.length > 0);
  if (historyRows.length === 0 && newRefs.length === 0) {
    return {kind: 'fits'};
  }
  if (windowTokens === undefined) {
    return {kind: 'unknown'};
  }
  const tokensOf = (ref: DocumentRef) =>
    documentTokens(ref, activeModelId, missingKeys);
  const historyDocTokens =
    LEAD_TOKENS * historyRows.length +
    historyRows.flat().reduce((sum, ref) => sum + tokensOf(ref), 0);
  const newDocs = newRefs.map(ref => ({ref, tokens: tokensOf(ref)}));
  const newDocTokens =
    newDocs.length > 0
      ? LEAD_TOKENS + newDocs.reduce((sum, doc) => sum + doc.tokens, 0)
      : 0;
  const needed =
    estimateDocTokens(nonDocText) + historyDocTokens + newDocTokens;
  const available = windowTokens - REPLY_RESERVE;
  if (needed <= available) {
    return {kind: 'fits'};
  }
  return {
    kind: 'over',
    needed,
    available,
    newDocs,
    historyDocTokens,
    historyOverflow: needed - newDocTokens > available,
  };
};
