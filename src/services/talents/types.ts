/**
 * Result shape returned by a TalentEngine.
 * - `type: 'html'` with `html` populated means a visual preview is available.
 * - `type: 'text'` means only a textual summary is produced.
 * - `type: 'audio'` means an audio file was produced (future TTS support).
 * - `type: 'error'` means the engine failed; errorMessage describes what went wrong.
 * `summary` is always present and is what gets fed back to the model as the
 * `{role: 'tool', content}` payload on subsequent turns.
 */
export type TalentResult =
  | {type: 'html'; html: string; title?: string; summary: string}
  | {type: 'text'; summary: string}
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
  execute(args: Record<string, any>): Promise<TalentResult>;
  toToolDefinition(): ToolDefinition;
  /**
   * Optional hint: minimum n_ctx (in tokens) under which this engine
   * tends to overflow the context on its first invocation. Consumed
   * declaratively — never drives per-turn behaviour. Read at pal-load
   * to surface the one-shot snackbar, and at run_finished to swap the
   * `context-full` banner sub-copy when the offending tool was a
   * heavy talent.
   */
  readonly recommendedContextTokens?: number;
}
