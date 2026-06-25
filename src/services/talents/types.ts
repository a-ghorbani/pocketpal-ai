/** One web_search hit, structured for the talent UI (not the model). */
export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Result shape returned by a TalentEngine.
 * - `type: 'html'` with `html` populated means a visual preview is available.
 * - `type: 'text'` means only a textual summary is produced.
 * - `type: 'search'` carries structured hits for the UI; the model still reads
 *   `summary` (the wrapped menu) exactly as it would a `text` result.
 * - `type: 'audio'` means an audio file was produced (future TTS support).
 * - `type: 'error'` means the engine failed; errorMessage describes what went wrong.
 * `summary` is always present and is what gets fed back to the model as the
 * `{role: 'tool', content}` payload on subsequent turns.
 */
export type TalentResult =
  | {type: 'html'; html: string; title?: string; summary: string}
  | {type: 'text'; summary: string}
  | {
      type: 'search';
      query: string;
      results: WebSearchResultItem[];
      summary: string;
    }
  | {type: 'audio'; audioUri: string; summary: string}
  | {type: 'error'; summary: string; errorMessage: string};

/** OpenAI function-calling tool schema shape. */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface TalentEngine {
  readonly name: string;
  /**
   * Optional hint for the n_ctx this talent tends to need room for. Read only
   * by the pal-load hint and the heavy-talent banner sub-copy; never moves a
   * banner trigger threshold.
   */
  readonly recommendedContextTokens?: number;
  execute(args: Record<string, any>): Promise<TalentResult>;
  toToolDefinition(): ToolDefinition;
}
