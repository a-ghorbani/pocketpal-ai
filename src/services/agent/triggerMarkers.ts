import type {JinjaFormattedChatResult, ToolCall} from 'llama.rn';
import type {ToolDefinition} from '../talents/types';

/**
 * Per-context cache of trigger-text markers extracted from
 * `getFormattedChat(...)` `grammar_triggers`. Used by the runner to
 * detect when the model has begun emitting a tool-call sentinel even
 * before parsed `tool_calls` arrive — surfaces a `marker_seen` event
 * so the UI can flip to "preparing tool" copy a frame earlier.
 *
 * Factory pattern (NOT module-level state) so the cache lifetime is
 * scoped to the hook's `useRef`. No unbounded growth across model
 * swaps; the hook creates a fresh cache when it remounts.
 */
export interface TriggerMarkerCache {
  getMarkers(
    contextId: string,
    tools: ToolDefinition[],
    getFormattedChat: () => Promise<JinjaFormattedChatResult>,
  ): Promise<string[]>;
}

/**
 * Convert a raw grammar_triggers entry (the `value` may be a partial
 * regex/sentinel) to a plain text marker the streaming code can scan
 * for in `accumulated_text`. Filters out empty / token-only entries.
 */
function extractTextMarkers(
  triggers: JinjaFormattedChatResult['grammar_triggers'],
): string[] {
  if (!triggers || triggers.length === 0) {
    return [];
  }
  const out: string[] = [];
  for (const t of triggers) {
    const value = (t as {value?: string})?.value;
    if (typeof value === 'string' && value.length > 0) {
      out.push(value);
    }
  }
  return out;
}

export function createTriggerMarkerCache(): TriggerMarkerCache {
  // Map key: `${contextId}::${sortedToolNames.join(',')}`. Tools list is
  // part of the key because different Pals advertise different schemas
  // and the resulting grammar may differ across them.
  const cache = new Map<string, string[]>();

  return {
    async getMarkers(
      contextId: string,
      tools: ToolDefinition[],
      getFormattedChat: () => Promise<JinjaFormattedChatResult>,
    ): Promise<string[]> {
      const toolNames = tools
        .map(t => t.function?.name)
        .filter((n): n is string => !!n)
        .sort();
      const key = `${contextId}::${toolNames.join(',')}`;
      const cached = cache.get(key);
      if (cached) {
        return cached;
      }
      try {
        const result = await getFormattedChat();
        const markers = extractTextMarkers(result.grammar_triggers);
        cache.set(key, markers);
        return markers;
      } catch {
        // Fail open: a cache miss returns no markers and the runner
        // simply skips the marker_seen event for this turn.
        cache.set(key, []);
        return [];
      }
    },
  };
}

/**
 * Re-export the llama.rn `ToolCall` shape for consumers that need to
 * pass through tool-call payloads alongside marker info.
 */
export type {ToolCall};
