import {CompletionResultSnapshot} from '../../utils/completionTypes';
import {MessageType} from '../../utils/types';

export interface CompactionSettings {
  autoCompact?: boolean;
  threshold?: number;
  preservedTurns?: number;
}

export interface SanitizedMessage {
  role: 'user' | 'assistant' | 'system';
  sanitizedContent: string;
}

export interface CompactionMetadata {
  compaction: true;
  summary: string;
  compactedCount: number;
  focusInstruction?: string;
  timestamp: number;
  tokenCountBefore?: number;
  tokenCountAfter?: number;
}

export interface CompactionPartition {
  toSummarize: SanitizedMessage[];
  toPreserve: MessageType.Any[];
  messageIdsToArchive: string[];
  priorSummary?: string;
  markerTimestamp: number;
}

export interface CompactionOptions {
  messages: MessageType.Any[];
  effectiveNCtx?: number;
  focusInstruction?: string;
  preservedTurns?: number;
}

export interface CompactionResult {
  summary: string;
  compactedCount: number;
  markerTimestamp: number;
  messageIdsToArchive: string[];
}
