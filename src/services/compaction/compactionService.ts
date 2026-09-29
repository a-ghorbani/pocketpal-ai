import {
  CompletionResultSnapshot,
  CompletionEngine,
} from '../../utils/completionTypes';
import {MessageType} from '../../utils/types';
import {assistant} from '../../utils/chat';
import {removeThinkingParts} from '../../utils/chat';
import {
  CompactionPartition,
  CompactionSettings,
  SanitizedMessage,
} from './types';

/**
 * Evaluates whether a chat session is a candidate for compaction using
 * the dynamic token headroom rule:
 *   bufferTokens = max(512, ceil(effectiveNCtx * 0.15))
 *   triggerLimit = effectiveNCtx - bufferTokens
 */
export function shouldCompactSession(
  snapshot: CompletionResultSnapshot | undefined,
  effectiveNCtx?: number,
  settings?: CompactionSettings,
): boolean {
  if (!snapshot) {
    return false;
  }

  // If the engine flagged context full or truncated, trigger compaction immediately
  if (snapshot.contextFull) {
    return true;
  }

  if (!effectiveNCtx || effectiveNCtx <= 0) {
    return false;
  }

  const used = snapshot.used ?? snapshot.tokensPredicted ?? 0;
  if (used <= 0) {
    return false;
  }

  // Allow custom threshold override if explicitly provided (e.g. 0.85)
  if (settings?.threshold !== undefined && settings.threshold > 0) {
    return used / effectiveNCtx >= settings.threshold;
  }

  // Dynamic token headroom calculation: ensures enough buffer remains
  // so the summarizer prompt does not exceed n_ctx
  const bufferTokens = Math.max(512, Math.ceil(effectiveNCtx * 0.15));
  const triggerLimit = effectiveNCtx - bufferTokens;

  return used >= triggerLimit;
}

/**
 * Sanitizes an individual message for summarization, converting raw tool
 * payloads and image attachments into lightweight semantic text tags.
 */
export function sanitizeMessage(msg: MessageType.Any): SanitizedMessage | null {
  if (msg.type === 'text') {
    const textMsg = msg as MessageType.Text;
    const role: 'user' | 'assistant' | 'system' =
      textMsg.author?.id === assistant.id ? 'assistant' : 'user';

    let content = (textMsg.text || '').trim();

    // Multimodal attachments: replace images with compact text tokens
    if (textMsg.imageUris && textMsg.imageUris.length > 0) {
      const imgTags = textMsg.imageUris.map(
        (_, i) => `[Attached Image ${i + 1}]`,
      );
      content = content ? `${content} ${imgTags.join(' ')}` : imgTags.join(' ');
    }

    if (!content) {
      return null;
    }

    return {role, sanitizedContent: content};
  }

  if (msg.type === 'assistant_turn') {
    const turn = msg as MessageType.AssistantTurn;
    const parts: string[] = [];

    for (const step of turn.steps ?? []) {
      if (step.content && step.content.trim()) {
        parts.push(step.content.trim());
      }

      // Compact tool calls
      if (step.toolCalls && step.toolCalls.length > 0) {
        for (const tc of step.toolCalls) {
          const fnName = tc.function?.name || 'tool';
          parts.push(`[Used Tool: ${fnName}]`);
        }
      }

      // Compact tool outcomes, truncating oversized scrapes or outputs
      if (step.toolOutcomes && step.toolOutcomes.length > 0) {
        for (const outcome of step.toolOutcomes) {
          const res = (outcome.responseContent || '').trim();
          const truncated =
            res.length > 150 ? `${res.substring(0, 140)}... (truncated)` : res;
          parts.push(`[Tool Result (${outcome.toolName}): ${truncated}]`);
        }
      }
    }

    const fullContent = parts.join('\n');
    if (!fullContent) {
      return null;
    }

    return {role: 'assistant', sanitizedContent: fullContent};
  }

  if (msg.type === 'custom' && msg.metadata?.compaction) {
    const summary = msg.metadata.summary || msg.metadata.text || '';
    if (summary) {
      return {
        role: 'system',
        sanitizedContent: `[Prior Compaction Summary]: ${summary}`,
      };
    }
  }

  return null;
}

/**
 * Partitions conversation messages into older messages to be summarized
 * and the latest N turns to be preserved verbatim. Also handles multi-round
 * compaction chaining and timestamp calculation.
 */
export function partitionMessagesForCompaction(
  messages: MessageType.Any[],
  preservedTurnCount = 2,
): CompactionPartition | null {
  // Filter out any messages already soft-archived in earlier compactions
  const activeMessages = messages.filter(msg => !msg.metadata?.isCompacted);

  // Normalize chronological order (oldest first)
  const chronological = [...activeMessages].sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
  );

  const preservedMessageCount = preservedTurnCount * 2;
  // We need at least 1 message to summarize beyond the preserved turns
  if (chronological.length <= preservedMessageCount) {
    return null;
  }

  const splitIndex = chronological.length - preservedMessageCount;
  const olderMessages = chronological.slice(0, splitIndex);
  const toPreserve = chronological.slice(splitIndex);

  // Chained multi-round compactions: check if olderMessages contains a prior CompactionMarker
  let priorSummary: string | undefined;
  const toSummarize: SanitizedMessage[] = [];
  const messageIdsToArchive: string[] = [];

  for (const msg of olderMessages) {
    messageIdsToArchive.push(msg.id);

    if (msg.type === 'custom' && msg.metadata?.compaction) {
      // Extract prior summary so it chains into the new compaction prompt
      priorSummary = msg.metadata.summary;
      continue;
    }

    const sanitized = sanitizeMessage(msg);
    if (sanitized) {
      toSummarize.push(sanitized);
    }
  }

  // Calculate timestamp placement: midway between last compacted message and first preserved message
  const lastCompactedMsg = olderMessages[olderMessages.length - 1];
  const firstPreservedMsg = toPreserve[0];
  const markerTimestamp =
    firstPreservedMsg &&
    firstPreservedMsg.createdAt &&
    lastCompactedMsg &&
    lastCompactedMsg.createdAt
      ? Math.floor(
          (lastCompactedMsg.createdAt + firstPreservedMsg.createdAt) / 2,
        )
      : (lastCompactedMsg?.createdAt || Date.now()) + 1;

  return {
    toSummarize,
    toPreserve,
    messageIdsToArchive,
    priorSummary,
    markerTimestamp,
  };
}

/**
 * Builds the strict, concise compaction prompt designed for on-device execution.
 * Directs the model to output a structured summary without thought chains or tags.
 */
export function buildCompactionPrompt(
  messages: SanitizedMessage[],
  focusInstruction?: string,
  priorSummary?: string,
): string {
  const focusClause = focusInstruction?.trim()
    ? `\nSpecial User Focus: Give extra priority and detail to: "${focusInstruction.trim()}".`
    : '';

  const priorSummaryClause = priorSummary?.trim()
    ? `\n### Previous Summary of Earlier Turns\n${priorSummary.trim()}\n`
    : '';

  return `You are a conversation summarizer. Distill the conversation below into a concise reference for an AI assistant continuing the chat.

Requirements:
- Omit casual chatter, greetings, and abandoned lines of inquiry.
- Preserve key requirements, constraints, decisions made, and technical specs.
- Do NOT output reasoning or <think> tags. Start immediately with the summary.
${focusClause}
${priorSummaryClause}
Output format:
### Primary Goal
[1-2 sentences]

### Key Decisions & Facts
- [Bullet points]

### Current State & Next Steps
- [Bullet points]

Conversation to summarize:
${messages.map(m => `${m.role.toUpperCase()}: ${m.sanitizedContent}`).join('\n\n')}`;
}

/**
 * Executes the compaction completion pass using the active engine.
 * Caps generation to 256 tokens and enforces low temperature for speed and factuality.
 */
export async function executeCompaction(
  engine: CompletionEngine,
  prompt: string,
  _signal?: AbortSignal,
): Promise<string> {
  const result = await engine.completion({
    prompt,
    temperature: 0.2,
    top_p: 0.9,
    n_predict: 256,
    enable_thinking: false,
    stop: ['\n\n\n\n', '<|im_end|>', '</s>', '<end_of_turn>'],
  });

  let rawText = result.text || result.content || '';
  rawText = removeThinkingParts(rawText).trim();

  if (!rawText) {
    throw new Error('Compaction produced an empty summary.');
  }

  return rawText;
}
