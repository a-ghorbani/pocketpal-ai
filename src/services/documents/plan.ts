import {documentTokens} from './budget';
import {estimateDocTokens} from './estimate';
import {
  DOCUMENT_LEAD,
  EXCERPT_LEAD,
  documentKey,
  excerptClose,
  excerptOpen,
  renderDocumentStub,
} from './render';
import {
  EXCERPT_MAX_TOKENS,
  FULL_DOC_MAX_TOKENS,
  FULL_TOTAL_MAX_TOKENS,
  PASSAGE_MAX_TOKENS,
  REPLY_RESERVE,
  type DocumentMode,
  type DocumentRef,
} from './types';
import type {MessageType} from '../../utils/types';

export interface PlannedDocument {
  ref: DocumentRef;
  tokens: number;
  mode: DocumentMode;
}

export type BudgetVerdict =
  | {kind: 'fits'}
  | {kind: 'unknown'}
  | {
      kind: 'over';
      reason: 'history' | 'new';
      needed: number;
      available: number;
      newDocs: PlannedDocument[];
      historyDocTokens: number;
    };

export interface PlanInput {
  /** History rows, newest first, already cut at an edited or resent row. */
  rows: MessageType.Any[];
  message: MessageType.PartialText;
  windowTokens: number | undefined;
  activeModelId: string | undefined;
  nonDocText: string;
  missingKeys: ReadonlySet<string>;
}

export interface Plan {
  /** Modes of `message.documents`, index-aligned with it. */
  newModes: DocumentMode[];
  fullLoad: number;
  room: number | undefined;
  excerptBudget: number;
  verdict: BudgetVerdict;
}

const LEAD_TOKENS = estimateDocTokens(`${DOCUMENT_LEAD}\n\n`);
const WIDEST_CITATION = 'p.99999 parts 999–999 of 999';

/** One excerpt's delimiters, its separator and the excerpt lead's share. */
export const excerptOverhead = (ref: DocumentRef): number =>
  estimateDocTokens(
    `${excerptOpen(ref, WIDEST_CITATION)}\n\n${excerptClose(ref)}\n\n`,
  );

export const EXCERPT_LEAD_TOKENS = estimateDocTokens(`${EXCERPT_LEAD}\n\n`);

const floorFor = (searched: DocumentRef[]): number =>
  PASSAGE_MAX_TOKENS +
  EXCERPT_LEAD_TOKENS +
  Math.max(0, ...searched.map(excerptOverhead));

export const modeOf = (ref: DocumentRef): DocumentMode => ref.mode ?? 'full';

export const documentPlan = ({
  rows,
  message,
  windowTokens,
  activeModelId,
  nonDocText,
  missingKeys,
}: PlanInput): Plan => {
  const isMissing = (ref: DocumentRef) => missingKeys.has(documentKey(ref));
  const fullTokens = (ref: DocumentRef) =>
    documentTokens(ref, activeModelId, missingKeys);
  const loadOf = (ref: DocumentRef, mode: DocumentMode) =>
    isMissing(ref)
      ? 0
      : mode === 'searched'
        ? estimateDocTokens(renderDocumentStub(ref))
        : fullTokens(ref);

  const historyRows = rows
    .filter((row): row is MessageType.Text => row.type === 'text')
    .map(row => row.documents ?? [])
    .filter(refs => refs.length > 0);
  const historyRefs = historyRows.flat();
  const newRefs = message.documents ?? [];

  const historyLoad =
    LEAD_TOKENS * historyRows.length +
    historyRefs.reduce((sum, ref) => sum + loadOf(ref, modeOf(ref)), 0);
  const searched = historyRefs.filter(
    ref => modeOf(ref) === 'searched' && !isMissing(ref),
  );
  let fullTotal = historyRefs
    .filter(ref => modeOf(ref) === 'full')
    .reduce((sum, ref) => sum + fullTokens(ref), 0);

  const newModes: DocumentMode[] = newRefs.map(ref => {
    const tokens = fullTokens(ref);
    if (
      ref.searchPinned ||
      tokens > FULL_DOC_MAX_TOKENS ||
      fullTotal + tokens > FULL_TOTAL_MAX_TOKENS
    ) {
      return 'searched';
    }
    fullTotal += tokens;
    return 'full';
  });
  const newLoad = () =>
    (newRefs.length > 0 ? LEAD_TOKENS : 0) +
    newRefs.reduce((sum, ref, i) => sum + loadOf(ref, newModes[i]), 0);
  const searchedNow = () => [
    ...searched,
    ...newRefs.filter(
      (ref, i) => newModes[i] === 'searched' && !isMissing(ref),
    ),
  ];

  const nonDoc = estimateDocTokens(nonDocText);
  const available =
    windowTokens === undefined ? undefined : windowTokens - REPLY_RESERVE;
  const historyOver =
    available !== undefined && nonDoc + historyLoad > available;

  if (available !== undefined && !historyOver) {
    const exceeds = () => {
      const anySearched = searchedNow().length > 0;
      return (
        nonDoc +
          historyLoad +
          newLoad() +
          (anySearched ? floorFor(searchedNow()) : 0) >
        available
      );
    };
    for (let i = newRefs.length - 1; i >= 0 && exceeds(); i--) {
      if (newModes[i] === 'full') {
        newModes[i] = 'searched';
      }
    }
  }

  const fullLoad = historyLoad + newLoad();
  const searchedRefs = searchedNow();
  const anySearched = searchedRefs.length > 0;
  const floor = anySearched ? floorFor(searchedRefs) : 0;
  const room =
    available === undefined ? undefined : available - nonDoc - fullLoad;
  const excerptBudget = anySearched
    ? Math.max(0, Math.min(EXCERPT_MAX_TOKENS, room ?? EXCERPT_MAX_TOKENS))
    : 0;

  const plan = {newModes, fullLoad, room, excerptBudget};
  if (historyRefs.length === 0 && newRefs.length === 0) {
    return {...plan, verdict: {kind: 'fits'}};
  }
  if (available === undefined) {
    return {...plan, verdict: {kind: 'unknown'}};
  }
  const over = (reason: 'history' | 'new'): Plan => ({
    ...plan,
    verdict: {
      kind: 'over',
      reason,
      needed: nonDoc + fullLoad + floor,
      available,
      newDocs: newRefs.map((ref, i) => ({
        ref,
        tokens: fullTokens(ref),
        mode: newModes[i],
      })),
      historyDocTokens: historyLoad,
    },
  });
  if (historyOver) {
    return over('history');
  }
  if (anySearched && excerptBudget < floor) {
    return over(newModes.some(mode => mode === 'searched') ? 'new' : 'history');
  }
  return {...plan, verdict: {kind: 'fits'}};
};
