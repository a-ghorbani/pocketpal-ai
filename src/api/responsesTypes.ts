import type {RemoteWireApi} from '../utils/remoteProtocol';

export type ResponsesTerminalStatus =
  | 'completed'
  | 'incomplete'
  | 'failed'
  | 'cancelled';

export type ResponsesIncompleteReason =
  | 'max_output_tokens'
  | 'content_filter'
  | 'unknown';

export interface ResponsesUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface ResponsesOutputText {
  type: 'output_text';
  text: string;
  annotations?: unknown[];
}

export interface ResponsesRefusal {
  type: 'refusal';
  refusal: string;
}

export interface ResponsesOutputMessage {
  type: 'message';
  id: string;
  role: 'assistant';
  status?: 'in_progress' | 'completed' | 'incomplete';
  phase?: 'commentary' | 'final_answer';
  content: Array<ResponsesOutputText | ResponsesRefusal>;
}

export interface ResponsesReasoningSummary {
  type: 'summary_text';
  text: string;
}

export interface ResponsesReasoningItem {
  type: 'reasoning';
  id: string;
  summary: ResponsesReasoningSummary[];
  encrypted_content?: string;
}

export interface ResponsesFunctionCall {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: 'in_progress' | 'completed' | 'incomplete';
}

export type ReplayableResponsesOutputItem =
  | ResponsesOutputMessage
  | ResponsesReasoningItem
  | ResponsesFunctionCall;

export interface ResponsesProviderBinding {
  wireApi: 'responses';
  serverId?: string;
  serverUrl: string;
  serverType?: string;
  modelId: string;
  credentialRevision?: number;
}

export interface ResponsesReplayState {
  version: 1;
  binding: ResponsesProviderBinding;
  output: ReplayableResponsesOutputItem[];
  terminalStatus: 'completed';
}

export interface CompletionProviderState {
  wireApi: RemoteWireApi;
  responses?: ResponsesReplayState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isReplayableOutputItem(
  value: unknown,
): value is ReplayableResponsesOutputItem {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }
  if (value.type === 'message') {
    return (
      typeof value.id === 'string' &&
      value.role === 'assistant' &&
      Array.isArray(value.content) &&
      value.content.every(
        part =>
          isRecord(part) &&
          ((part.type === 'output_text' && typeof part.text === 'string') ||
            (part.type === 'refusal' && typeof part.refusal === 'string')),
      )
    );
  }
  if (value.type === 'reasoning') {
    return (
      typeof value.id === 'string' &&
      Array.isArray(value.summary) &&
      value.summary.every(
        part =>
          isRecord(part) &&
          part.type === 'summary_text' &&
          typeof part.text === 'string',
      ) &&
      (value.encrypted_content === undefined ||
        typeof value.encrypted_content === 'string')
    );
  }
  if (value.type === 'function_call') {
    return (
      typeof value.id === 'string' &&
      typeof value.call_id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.arguments === 'string'
    );
  }
  return false;
}

export function isResponsesReplayState(
  value: unknown,
): value is ResponsesReplayState {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }
  if (
    value.terminalStatus !== 'completed' ||
    !Array.isArray(value.output) ||
    !value.output.every(isReplayableOutputItem)
  ) {
    return false;
  }
  const binding = value.binding;
  return (
    isRecord(binding) &&
    binding.wireApi === 'responses' &&
    typeof binding.serverUrl === 'string' &&
    binding.serverUrl.length > 0 &&
    typeof binding.modelId === 'string' &&
    binding.modelId.length > 0 &&
    (binding.credentialRevision === undefined ||
      (typeof binding.credentialRevision === 'number' &&
        Number.isSafeInteger(binding.credentialRevision) &&
        binding.credentialRevision >= 0))
  );
}
