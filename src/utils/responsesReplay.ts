import type {
  ReplayableResponsesOutputItem,
  ResponsesFunctionCall,
  ResponsesProviderBinding,
  ResponsesReplayState,
} from '../api/responsesTypes';
import {isResponsesReplayState} from '../api/responsesTypes';
import type {ChatMessage} from './types';

export interface ResponsesReplayMessageMetadata {
  responsesState?: unknown;
}

export interface ResponsesReplayBuildOptions {
  binding: ResponsesProviderBinding;
  messageMetadata?: readonly (
    | ResponsesReplayMessageMetadata
    | null
    | undefined
  )[];
}

export type ResponsesInputContent =
  | string
  | Array<
      | {type: 'input_text'; text: string}
      | {type: 'input_image'; image_url: string}
    >;

export interface ResponsesInputMessage {
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: ResponsesInputContent;
}

export interface ResponsesFunctionCallOutput {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export type ResponsesPortableFunctionCall = Omit<ResponsesFunctionCall, 'id'>;

export type ResponsesHistoryInputItem =
  | ResponsesInputMessage
  | ResponsesFunctionCallOutput
  | ResponsesPortableFunctionCall
  | ReplayableResponsesOutputItem;

export type ResponsesReplayValidationCode =
  | 'invalid-binding'
  | 'invalid-metadata'
  | 'invalid-replay-state'
  | 'incomplete-replay-item'
  | 'duplicate-output-item-id'
  | 'duplicate-call-id'
  | 'inconsistent-call-ids'
  | 'orphan-tool-output'
  | 'duplicate-tool-output'
  | 'missing-tool-output'
  | 'invalid-tool-call';

export class ResponsesReplayValidationError extends Error {
  readonly code: ResponsesReplayValidationCode;
  readonly messageIndex?: number;

  constructor(
    code: ResponsesReplayValidationCode,
    message: string,
    messageIndex?: number,
  ) {
    super(message);
    this.name = 'ResponsesReplayValidationError';
    this.code = code;
    this.messageIndex = messageIndex;
  }
}

const normalizeOptional = (value: unknown): string | undefined | null => {
  if (value !== undefined && typeof value !== 'string') {
    return null;
  }
  const normalized = value?.trim();
  return normalized ? normalized.toLowerCase() : undefined;
};

export function normalizeResponsesServerUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function responsesReplayBindingMatches(
  stateBinding: ResponsesProviderBinding,
  currentBinding: ResponsesProviderBinding,
): boolean {
  return (
    stateBinding.wireApi === currentBinding.wireApi &&
    normalizeResponsesServerUrl(stateBinding.serverUrl) ===
      normalizeResponsesServerUrl(currentBinding.serverUrl) &&
    stateBinding.modelId.trim() === currentBinding.modelId.trim() &&
    normalizeOptional(stateBinding.serverType) ===
      normalizeOptional(currentBinding.serverType) &&
    stateBinding.serverId === currentBinding.serverId &&
    stateBinding.credentialRevision === currentBinding.credentialRevision
  );
}

function replayBindingFromUnknown(
  value: unknown,
): ResponsesProviderBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const binding = (value as {binding?: unknown}).binding;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    return undefined;
  }
  const candidate = binding as Partial<ResponsesProviderBinding>;
  if (
    candidate.wireApi !== 'responses' ||
    typeof candidate.serverUrl !== 'string' ||
    typeof candidate.modelId !== 'string'
  ) {
    return undefined;
  }
  return candidate as ResponsesProviderBinding;
}

function assertBinding(binding: ResponsesProviderBinding): void {
  if (
    binding.wireApi !== 'responses' ||
    (binding.serverId !== undefined && typeof binding.serverId !== 'string') ||
    (binding.serverType !== undefined &&
      typeof binding.serverType !== 'string') ||
    typeof binding.serverUrl !== 'string' ||
    !binding.serverUrl.trim() ||
    typeof binding.modelId !== 'string' ||
    !binding.modelId.trim() ||
    (binding.credentialRevision !== undefined &&
      (!Number.isSafeInteger(binding.credentialRevision) ||
        binding.credentialRevision < 0))
  ) {
    throw new ResponsesReplayValidationError(
      'invalid-binding',
      'The current Responses provider binding is incomplete or invalid.',
    );
  }
}

function replayBindingHasInvalidOptionalFields(
  binding: ResponsesProviderBinding,
): boolean {
  return (
    (binding.serverId !== undefined && typeof binding.serverId !== 'string') ||
    (binding.serverType !== undefined &&
      typeof binding.serverType !== 'string') ||
    (binding.credentialRevision !== undefined &&
      (typeof binding.credentialRevision !== 'number' ||
        !Number.isSafeInteger(binding.credentialRevision) ||
        binding.credentialRevision < 0))
  );
}

function assertReplayState(
  value: unknown,
  expectedCallIds: readonly string[],
  messageIndex: number,
): asserts value is ResponsesReplayState {
  if (!isResponsesReplayState(value)) {
    throw new ResponsesReplayValidationError(
      'invalid-replay-state',
      `Assistant message ${messageIndex} has matching Responses state that is malformed or not completed.`,
      messageIndex,
    );
  }
  if (replayBindingHasInvalidOptionalFields(value.binding)) {
    throw new ResponsesReplayValidationError(
      'invalid-replay-state',
      `Assistant message ${messageIndex} has malformed provider binding fields.`,
      messageIndex,
    );
  }

  const outputIds = new Set<string>();
  const stateCallIds: string[] = [];
  const callIds = new Set<string>();

  for (const item of value.output) {
    if (!item.id.trim()) {
      throw new ResponsesReplayValidationError(
        'invalid-replay-state',
        `Assistant message ${messageIndex} has a replay item with an empty output item id.`,
        messageIndex,
      );
    }
    if (outputIds.has(item.id)) {
      throw new ResponsesReplayValidationError(
        'duplicate-output-item-id',
        `Assistant message ${messageIndex} repeats Responses output item id "${item.id}".`,
        messageIndex,
      );
    }
    outputIds.add(item.id);

    if (
      (item.type === 'message' || item.type === 'function_call') &&
      item.status !== undefined &&
      item.status !== 'completed'
    ) {
      throw new ResponsesReplayValidationError(
        'incomplete-replay-item',
        `Assistant message ${messageIndex} contains ${item.type} item "${item.id}" with non-completed status "${item.status}".`,
        messageIndex,
      );
    }
    if (
      item.type === 'message' &&
      item.phase !== undefined &&
      item.phase !== 'commentary' &&
      item.phase !== 'final_answer'
    ) {
      throw new ResponsesReplayValidationError(
        'invalid-replay-state',
        `Assistant message ${messageIndex} contains message item "${item.id}" with invalid phase "${item.phase}".`,
        messageIndex,
      );
    }
    if (item.type === 'function_call') {
      if (!item.call_id.trim() || !item.name.trim()) {
        throw new ResponsesReplayValidationError(
          'invalid-replay-state',
          `Assistant message ${messageIndex} has a function call with an empty call_id or name.`,
          messageIndex,
        );
      }
      if (callIds.has(item.call_id)) {
        throw new ResponsesReplayValidationError(
          'duplicate-call-id',
          `Assistant message ${messageIndex} repeats function call_id "${item.call_id}".`,
          messageIndex,
        );
      }
      callIds.add(item.call_id);
      stateCallIds.push(item.call_id);
    }
  }

  if (
    stateCallIds.length !== expectedCallIds.length ||
    stateCallIds.some((callId, index) => callId !== expectedCallIds[index])
  ) {
    throw new ResponsesReplayValidationError(
      'inconsistent-call-ids',
      `Assistant message ${messageIndex} replay call_ids do not match its portable tool_calls.`,
      messageIndex,
    );
  }
}

function cloneReplayItem(
  item: ReplayableResponsesOutputItem,
): ReplayableResponsesOutputItem {
  if (item.type === 'message') {
    return {
      ...item,
      content: item.content.map(part => ({
        ...part,
        ...(part.type === 'output_text' && part.annotations
          ? {annotations: [...part.annotations]}
          : {}),
      })),
    };
  }
  if (item.type === 'reasoning') {
    return {...item, summary: item.summary.map(part => ({...part}))};
  }
  return {...item};
}

function messageContent(
  content: ChatMessage['content'],
): ResponsesInputContent {
  if (typeof content === 'string') {
    return content;
  }
  return content.map(part =>
    part.type === 'image_url'
      ? {
          type: 'input_image' as const,
          image_url: part.image_url?.url ?? '',
        }
      : {type: 'input_text' as const, text: part.text ?? ''},
  );
}

function portableToolCalls(
  message: ChatMessage,
  messageIndex: number,
): ResponsesPortableFunctionCall[] {
  const callIds = new Set<string>();
  return (message.tool_calls ?? []).map(call => {
    const id = call.id;
    const name = call.function?.name;
    const args = call.function?.arguments;
    if (
      typeof id !== 'string' ||
      !id.trim() ||
      typeof name !== 'string' ||
      !name.trim() ||
      typeof args !== 'string'
    ) {
      throw new ResponsesReplayValidationError(
        'invalid-tool-call',
        `Assistant message ${messageIndex} has a malformed portable tool call.`,
        messageIndex,
      );
    }
    if (callIds.has(id)) {
      throw new ResponsesReplayValidationError(
        'duplicate-call-id',
        `Assistant message ${messageIndex} repeats portable tool call_id "${id}".`,
        messageIndex,
      );
    }
    callIds.add(id);
    return {
      type: 'function_call',
      call_id: id,
      name,
      arguments: args,
      status: 'completed',
    };
  });
}

export function buildResponsesReplayInput(
  messages: readonly ChatMessage[],
  options: ResponsesReplayBuildOptions,
): ResponsesHistoryInputItem[] {
  assertBinding(options.binding);
  const metadata = options.messageMetadata ?? [];
  if (metadata.length > messages.length) {
    throw new ResponsesReplayValidationError(
      'invalid-metadata',
      'Responses replay metadata has entries beyond the portable message history.',
    );
  }

  const result: ResponsesHistoryInputItem[] = [];
  let pendingCallIds: string[] = [];
  const emittedToolOutputs = new Set<string>();

  const assertNoPendingCalls = (nextMessageIndex: number): void => {
    if (pendingCallIds.length > 0) {
      throw new ResponsesReplayValidationError(
        'missing-tool-output',
        `Tool call_id "${pendingCallIds[0]}" has no function_call_output before message ${nextMessageIndex}.`,
        nextMessageIndex,
      );
    }
  };

  messages.forEach((message, messageIndex) => {
    const messageMetadata = metadata[messageIndex];
    if (
      messageMetadata !== undefined &&
      messageMetadata !== null &&
      (typeof messageMetadata !== 'object' || Array.isArray(messageMetadata))
    ) {
      throw new ResponsesReplayValidationError(
        'invalid-metadata',
        `Responses replay metadata for message ${messageIndex} is malformed.`,
        messageIndex,
      );
    }

    if (message.role === 'tool') {
      const callId = message.tool_call_id;
      if (!callId || !pendingCallIds.includes(callId)) {
        throw new ResponsesReplayValidationError(
          emittedToolOutputs.has(callId ?? '')
            ? 'duplicate-tool-output'
            : 'orphan-tool-output',
          callId
            ? `Tool output for call_id "${callId}" is duplicate or has no preceding function call.`
            : `Tool message ${messageIndex} has no tool_call_id.`,
          messageIndex,
        );
      }
      if (emittedToolOutputs.has(callId)) {
        throw new ResponsesReplayValidationError(
          'duplicate-tool-output',
          `Tool output for call_id "${callId}" appears more than once.`,
          messageIndex,
        );
      }
      if (typeof message.content !== 'string') {
        throw new ResponsesReplayValidationError(
          'orphan-tool-output',
          `Tool output for call_id "${callId}" must have string content.`,
          messageIndex,
        );
      }
      result.push({
        type: 'function_call_output',
        call_id: callId,
        output: message.content,
      });
      emittedToolOutputs.add(callId);
      pendingCallIds = pendingCallIds.filter(id => id !== callId);
      return;
    }

    assertNoPendingCalls(messageIndex);
    if (
      messageMetadata?.responsesState !== undefined &&
      message.role !== 'assistant'
    ) {
      throw new ResponsesReplayValidationError(
        'invalid-metadata',
        `Responses replay state is attached to non-assistant message ${messageIndex}.`,
        messageIndex,
      );
    }

    if (message.role !== 'assistant') {
      result.push({
        role: message.role,
        content: messageContent(message.content),
      });
      return;
    }

    const calls = portableToolCalls(message, messageIndex);
    const callIds = calls.map(call => call.call_id);
    const state = messageMetadata?.responsesState;
    const stateBinding =
      state === undefined ? undefined : replayBindingFromUnknown(state);
    const requiredBindingMatches =
      stateBinding !== undefined &&
      normalizeResponsesServerUrl(stateBinding.serverUrl) ===
        normalizeResponsesServerUrl(options.binding.serverUrl) &&
      stateBinding.modelId.trim() === options.binding.modelId.trim();

    if (
      stateBinding &&
      responsesReplayBindingMatches(stateBinding, options.binding)
    ) {
      assertReplayState(state, callIds, messageIndex);
      result.push(...state.output.map(cloneReplayItem));
    } else {
      if (
        requiredBindingMatches &&
        replayBindingHasInvalidOptionalFields(stateBinding)
      ) {
        throw new ResponsesReplayValidationError(
          'invalid-replay-state',
          `Assistant message ${messageIndex} has malformed matching provider binding fields.`,
          messageIndex,
        );
      }
      if (typeof message.content !== 'string' || message.content.length > 0) {
        result.push({
          role: 'assistant',
          content: messageContent(message.content),
        });
      }
      result.push(...calls);
    }
    pendingCallIds = callIds;
  });

  assertNoPendingCalls(messages.length);
  return result;
}

export const convertPortableHistoryToResponsesInput = buildResponsesReplayInput;
