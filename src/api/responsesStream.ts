import type {
  CompletionResult,
  CompletionStreamData,
  ToolCall,
} from '../utils/completionTypes';
import type {ResponsesDiagnostics} from './responsesDiagnostics';
import type {
  ReplayableResponsesOutputItem,
  ResponsesFunctionCall,
  ResponsesOutputMessage,
  ResponsesProviderBinding,
  ResponsesReasoningItem,
  ResponsesReplayState,
  ResponsesTerminalStatus,
  ResponsesUsage,
} from './responsesTypes';
import {isResponsesReplayState} from './responsesTypes';

type RecordValue = Record<string, unknown>;

type InternalItem =
  | {
      type: 'message';
      id: string;
      outputIndex: number;
      role: 'assistant';
      status?: 'in_progress' | 'completed' | 'incomplete';
      phase?: 'commentary' | 'final_answer';
      content: Map<number, MessagePart>;
    }
  | {
      type: 'reasoning';
      id: string;
      outputIndex: number;
      summary: Map<number, string>;
      encryptedContent?: string;
    }
  | {
      type: 'function_call';
      id: string;
      outputIndex: number;
      callId: string;
      name: string;
      arguments: string;
      status?: 'in_progress' | 'completed' | 'incomplete';
    };

type MessagePart =
  | {type: 'output_text'; text: string; annotations?: unknown[]}
  | {type: 'refusal'; refusal: string};

export interface ResponsesStreamEvent {
  type: string;
  [key: string]: unknown;
}

export interface FinalizedResponsesStream {
  result: CompletionResult;
  replay?: ResponsesReplayState;
}

export interface ResponsesStreamCompatibility {
  providerProfile?: 'github-copilot';
}

export type ResponsesStreamErrorCode =
  | 'malformed-event'
  | 'unsupported-output'
  | 'invalid-lifecycle'
  | 'premature-eof'
  | 'response-incomplete'
  | 'response-failed'
  | 'response-cancelled'
  | 'response-error'
  | 'invalid-completed-response';

export class ResponsesStreamProtocolError extends Error {
  readonly code: ResponsesStreamErrorCode;
  readonly eventType?: string;
  readonly partialResult?: CompletionResult;

  constructor(
    code: ResponsesStreamErrorCode,
    message: string,
    options: {eventType?: string; partialResult?: CompletionResult} = {},
  ) {
    super(message);
    this.name = 'ResponsesStreamProtocolError';
    this.code = code;
    this.eventType = options.eventType;
    Object.defineProperty(this, 'partialResult', {
      value: options.partialResult,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeLabel = (value: string): string =>
  value.replace(/[\r\n\t]/g, ' ').slice(0, 80);

const sortedValues = <T>(map: Map<number, T>): T[] =>
  [...map.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, value]) => value);

function requiredString(
  record: RecordValue,
  key: string,
  eventType: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw malformed(eventType, `"${key}" must be a non-empty string`);
  }
  return value;
}

function requiredText(
  record: RecordValue,
  key: string,
  eventType: string,
): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw malformed(eventType, `"${key}" must be a string`);
  }
  return value;
}

function optionalString(
  record: RecordValue,
  key: string,
  eventType: string,
): string | undefined {
  const value = record[key];
  if (value !== undefined && typeof value !== 'string') {
    throw malformed(eventType, `"${key}" must be a string`);
  }
  return value;
}

function requiredIndex(
  record: RecordValue,
  key: string,
  eventType: string,
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw malformed(eventType, `"${key}" must be a non-negative integer`);
  }
  return value;
}

function requiredRecord(
  record: RecordValue,
  key: string,
  eventType: string,
): RecordValue {
  const value = record[key];
  if (!isRecord(value)) {
    throw malformed(eventType, `"${key}" must be an object`);
  }
  return value;
}

function malformed(
  eventType: string,
  detail: string,
): ResponsesStreamProtocolError {
  return new ResponsesStreamProtocolError(
    'malformed-event',
    `Malformed Responses event "${safeLabel(eventType)}": ${detail}.`,
    {eventType: safeLabel(eventType)},
  );
}

function normalizeUsage(value: unknown): ResponsesUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const number = (candidate: unknown): number | undefined =>
    typeof candidate === 'number' &&
    Number.isFinite(candidate) &&
    candidate >= 0
      ? candidate
      : undefined;
  const inputDetails = isRecord(value.input_tokens_details)
    ? value.input_tokens_details
    : undefined;
  const outputDetails = isRecord(value.output_tokens_details)
    ? value.output_tokens_details
    : undefined;
  const usage: ResponsesUsage = {
    inputTokens: number(value.input_tokens),
    outputTokens: number(value.output_tokens),
    totalTokens: number(value.total_tokens),
    cachedInputTokens: number(inputDetails?.cached_tokens),
    reasoningTokens: number(outputDetails?.reasoning_tokens),
  };
  return Object.values(usage).some(item => item !== undefined)
    ? usage
    : undefined;
}

function terminalErrorCode(
  status: ResponsesTerminalStatus,
): ResponsesStreamErrorCode {
  if (status === 'failed') {
    return 'response-failed';
  }
  if (status === 'cancelled') {
    return 'response-cancelled';
  }
  return 'response-incomplete';
}

export class ResponsesStreamReducer {
  private readonly items = new Map<number, InternalItem>();
  private readonly itemIndices = new Map<string, number>();
  private readonly doneReplacedItemIndices = new Set<number>();
  private readonly compatibilityRemappedItemIndices = new Set<number>();
  private terminalStatus?: ResponsesTerminalStatus;
  private incompleteReason?: CompletionResult['incomplete_reason'];
  private usage?: ResponsesUsage;
  private terminalError?: ResponsesStreamProtocolError;

  constructor(
    private readonly diagnostics?: ResponsesDiagnostics,
    private readonly compatibility: ResponsesStreamCompatibility = {},
  ) {}

  reduce(event: ResponsesStreamEvent): CompletionStreamData | undefined {
    this.diagnostics?.event(event);
    if (!isRecord(event) || typeof event.type !== 'string' || !event.type) {
      throw new ResponsesStreamProtocolError(
        'malformed-event',
        'Malformed Responses event: missing event type.',
      );
    }
    if (this.terminalStatus || this.terminalError) {
      throw new ResponsesStreamProtocolError(
        'invalid-lifecycle',
        'Received a Responses event after the terminal event.',
        {eventType: event.type, partialResult: this.buildResult()},
      );
    }

    const before = this.projectionKey();
    switch (event.type) {
      case 'response.created':
      case 'response.in_progress':
        this.applyLifecycle(event);
        break;
      case 'response.output_item.added':
      case 'response.output_item.done':
        this.applyOutputItem(event);
        break;
      case 'response.content_part.added':
      case 'response.content_part.done':
        this.applyContentPart(event);
        break;
      case 'response.output_text.delta':
      case 'response.output_text.done':
        this.applyOutputText(event);
        break;
      case 'response.refusal.delta':
      case 'response.refusal.done':
        this.applyRefusal(event);
        break;
      case 'response.reasoning_summary_part.added':
      case 'response.reasoning_summary_part.done':
        this.applyReasoningPart(event);
        break;
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_summary_text.done':
        this.applyReasoningText(event);
        break;
      case 'response.function_call_arguments.delta':
      case 'response.function_call_arguments.done':
        this.applyFunctionArguments(event);
        break;
      case 'response.completed':
      case 'response.incomplete':
      case 'response.failed':
      case 'response.cancelled':
        this.applyTerminal(event);
        break;
      case 'error':
        this.applyError(event);
        break;
      default:
        return undefined;
    }

    const after = this.projectionKey();
    if (before === after) {
      return undefined;
    }
    return this.snapshot();
  }

  finish(binding: ResponsesProviderBinding): FinalizedResponsesStream {
    if (this.terminalError) {
      throw this.terminalError;
    }
    if (!this.terminalStatus) {
      throw new ResponsesStreamProtocolError(
        'premature-eof',
        'Responses stream ended before a terminal event.',
        {partialResult: this.buildResult()},
      );
    }

    const result = this.buildResult();
    if (this.terminalStatus !== 'completed' || result.refusal) {
      if (this.terminalStatus !== 'completed') {
        result.interrupted = true;
      }
      return {result};
    }

    const output = this.replayOutput();
    const replay: ResponsesReplayState = {
      version: 1,
      binding: {...binding},
      output,
      terminalStatus: 'completed',
    };
    if (!isResponsesReplayState(replay)) {
      throw new ResponsesStreamProtocolError(
        'invalid-completed-response',
        'Completed Responses output could not be validated for replay.',
        {partialResult: result},
      );
    }
    result.provider_state = {wireApi: 'responses', responses: replay};
    return {result, replay};
  }

  end(binding: ResponsesProviderBinding): FinalizedResponsesStream {
    return this.finish(binding);
  }

  finalize(binding: ResponsesProviderBinding): FinalizedResponsesStream {
    return this.finish(binding);
  }

  snapshot(): CompletionStreamData {
    const content = this.visibleContent();
    const reasoning = this.reasoningContent();
    const tools = this.streamToolCalls();
    return {
      token: '',
      content: content || undefined,
      accumulated_text: content,
      reasoning_content: reasoning || undefined,
      tool_calls: tools.length > 0 ? tools : undefined,
    };
  }

  private applyLifecycle(event: RecordValue): void {
    const response = requiredRecord(event, 'response', event.type as string);
    const status = optionalString(response, 'status', event.type as string);
    if (
      status !== undefined &&
      status !== 'queued' &&
      status !== 'in_progress'
    ) {
      throw malformed(event.type as string, 'response status is invalid');
    }
    this.reconcileResponse(response, event.type as string);
  }

  private applyOutputItem(event: RecordValue): void {
    const eventType = event.type as string;
    const index = requiredIndex(event, 'output_index', eventType);
    const item = requiredRecord(event, 'item', eventType);
    if (eventType === 'response.output_item.done' && !this.items.has(index)) {
      throw malformed(eventType, 'output item was not registered');
    }
    this.reconcileItem(index, item, eventType);
  }

  private applyContentPart(event: RecordValue): void {
    const eventType = event.type as string;
    const item = this.messageForEvent(event, eventType);
    const contentIndex = requiredIndex(event, 'content_index', eventType);
    const part = requiredRecord(event, 'part', eventType);
    item.content.set(contentIndex, this.parseMessagePart(part, eventType));
  }

  private applyOutputText(event: RecordValue): void {
    const eventType = event.type as string;
    const item = this.messageForEvent(event, eventType);
    const contentIndex = requiredIndex(event, 'content_index', eventType);
    const existing = item.content.get(contentIndex);
    if (existing && existing.type !== 'output_text') {
      throw malformed(eventType, 'content part is not output_text');
    }
    if (eventType.endsWith('.delta')) {
      const delta = requiredText(event, 'delta', eventType);
      item.content.set(contentIndex, {
        type: 'output_text',
        text: (existing?.text ?? '') + delta,
        annotations: existing?.annotations,
      });
    } else {
      const text = requiredText(event, 'text', eventType);
      item.content.set(contentIndex, {
        type: 'output_text',
        text,
        annotations: existing?.annotations,
      });
    }
  }

  private applyRefusal(event: RecordValue): void {
    const eventType = event.type as string;
    const item = this.messageForEvent(event, eventType);
    const contentIndex = requiredIndex(event, 'content_index', eventType);
    const existing = item.content.get(contentIndex);
    if (existing && existing.type !== 'refusal') {
      throw malformed(eventType, 'content part is not refusal');
    }
    if (eventType.endsWith('.delta')) {
      const delta = requiredText(event, 'delta', eventType);
      item.content.set(contentIndex, {
        type: 'refusal',
        refusal: (existing?.refusal ?? '') + delta,
      });
    } else {
      item.content.set(contentIndex, {
        type: 'refusal',
        refusal: requiredText(event, 'refusal', eventType),
      });
    }
  }

  private applyReasoningPart(event: RecordValue): void {
    const eventType = event.type as string;
    const item = this.reasoningForEvent(event, eventType);
    const summaryIndex = requiredIndex(event, 'summary_index', eventType);
    const part = requiredRecord(event, 'part', eventType);
    if (part.type !== 'summary_text' || typeof part.text !== 'string') {
      throw malformed(eventType, 'reasoning part must be summary_text');
    }
    item.summary.set(summaryIndex, part.text);
  }

  private applyReasoningText(event: RecordValue): void {
    const eventType = event.type as string;
    const item = this.reasoningForEvent(event, eventType);
    const summaryIndex = requiredIndex(event, 'summary_index', eventType);
    if (eventType.endsWith('.delta')) {
      const delta = requiredText(event, 'delta', eventType);
      item.summary.set(
        summaryIndex,
        (item.summary.get(summaryIndex) ?? '') + delta,
      );
    } else {
      item.summary.set(summaryIndex, requiredText(event, 'text', eventType));
    }
  }

  private applyFunctionArguments(event: RecordValue): void {
    const eventType = event.type as string;
    const item = this.functionForEvent(event, eventType);
    if (eventType.endsWith('.delta')) {
      item.arguments += requiredText(event, 'delta', eventType);
    } else {
      item.arguments = requiredText(event, 'arguments', eventType);
    }
  }

  private applyTerminal(event: RecordValue): void {
    const eventType = event.type as string;
    const response = requiredRecord(event, 'response', eventType);
    this.reconcileResponse(response, eventType);

    const expected = eventType.slice(
      'response.'.length,
    ) as ResponsesTerminalStatus;
    const responseStatus = optionalString(response, 'status', eventType);
    const status = responseStatus ?? expected;
    if (
      status !== 'completed' &&
      status !== 'incomplete' &&
      status !== 'failed' &&
      status !== 'cancelled'
    ) {
      throw malformed(eventType, 'terminal response status is invalid');
    }
    if (status !== expected) {
      throw malformed(eventType, 'event type and response status disagree');
    }
    this.terminalStatus = status;
    this.usage = normalizeUsage(response.usage) ?? this.usage;
    if (status === 'incomplete') {
      const details = isRecord(response.incomplete_details)
        ? response.incomplete_details
        : undefined;
      const reason = details?.reason;
      this.incompleteReason =
        reason === 'max_output_tokens' || reason === 'content_filter'
          ? reason
          : 'unknown';
    }
    if (status === 'failed' || status === 'cancelled') {
      this.terminalError = new ResponsesStreamProtocolError(
        terminalErrorCode(status),
        status === 'failed'
          ? 'The Responses request failed.'
          : 'The Responses request was cancelled.',
        {eventType, partialResult: this.buildResult()},
      );
    }
  }

  private applyError(event: RecordValue): never {
    const error = event.error;
    if (error !== undefined && !isRecord(error)) {
      throw malformed('error', '"error" must be an object');
    }
    const protocolError = new ResponsesStreamProtocolError(
      'response-error',
      'The Responses stream reported an error.',
      {eventType: 'error', partialResult: this.buildResult()},
    );
    this.terminalError = protocolError;
    throw protocolError;
  }

  private reconcileResponse(response: RecordValue, eventType: string): void {
    if (response.output !== undefined) {
      if (!Array.isArray(response.output)) {
        throw malformed(eventType, 'response output must be an array');
      }
      response.output.forEach((item, outputIndex) => {
        if (!isRecord(item)) {
          throw malformed(eventType, 'response output item must be an object');
        }
        this.reconcileItem(outputIndex, item, eventType);
      });
    }
    this.usage = normalizeUsage(response.usage) ?? this.usage;
  }

  private reconcileItem(
    outputIndex: number,
    raw: RecordValue,
    eventType: string,
  ): void {
    const type = requiredString(raw, 'type', eventType);
    const id = requiredString(raw, 'id', eventType);
    const priorIndex = this.itemIndices.get(id);
    if (priorIndex !== undefined && priorIndex !== outputIndex) {
      throw malformed(eventType, 'output item id moved to another index');
    }
    const existing = this.items.get(outputIndex);
    if (existing && existing.type !== type) {
      throw malformed(eventType, 'output item identity changed');
    }
    const replacesId = existing !== undefined && existing.id !== id;
    const isOutputItemDone = eventType === 'response.output_item.done';
    const isCompletedSnapshot = eventType === 'response.completed';
    if (
      replacesId &&
      ((!isOutputItemDone && !isCompletedSnapshot) ||
        this.compatibility.providerProfile !== 'github-copilot' ||
        priorIndex !== undefined ||
        (isOutputItemDone && this.doneReplacedItemIndices.has(outputIndex)))
    ) {
      throw malformed(eventType, 'output item identity changed');
    }
    if (replacesId && existing?.type === 'function_call') {
      const callId = optionalString(raw, 'call_id', eventType);
      const name = optionalString(raw, 'name', eventType);
      if (
        (callId !== undefined && callId !== existing.callId) ||
        (name !== undefined && name !== existing.name)
      ) {
        throw malformed(eventType, 'function call correlation changed');
      }
    }
    const preserveAccumulated =
      replacesId || this.compatibilityRemappedItemIndices.has(outputIndex);

    let item: InternalItem;
    if (type === 'message') {
      const role = raw.role;
      if (role !== undefined && role !== 'assistant') {
        throw malformed(eventType, 'message role must be assistant');
      }
      const status = this.itemStatus(raw.status, eventType);
      const phase = raw.phase;
      if (
        phase !== undefined &&
        phase !== 'commentary' &&
        phase !== 'final_answer'
      ) {
        throw malformed(eventType, 'message phase is invalid');
      }
      const messageItem: Extract<InternalItem, {type: 'message'}> = {
        type,
        id,
        outputIndex,
        role: 'assistant',
        status,
        phase,
        content:
          preserveAccumulated && existing?.type === 'message'
            ? new Map(existing.content)
            : new Map(),
      };
      if (raw.content !== undefined) {
        if (!Array.isArray(raw.content)) {
          throw malformed(eventType, 'message content must be an array');
        }
        raw.content.forEach((part, contentIndex) => {
          if (!isRecord(part)) {
            throw malformed(
              eventType,
              'message content part must be an object',
            );
          }
          messageItem.content.set(
            contentIndex,
            this.parseMessagePart(part, eventType),
          );
        });
      } else if (existing?.type === 'message') {
        messageItem.content = existing.content;
      }
      item = messageItem;
    } else if (type === 'reasoning') {
      const reasoningItem: Extract<InternalItem, {type: 'reasoning'}> = {
        type,
        id,
        outputIndex,
        summary:
          preserveAccumulated && existing?.type === 'reasoning'
            ? new Map(existing.summary)
            : new Map(),
        encryptedContent: optionalString(raw, 'encrypted_content', eventType),
      };
      if (raw.summary !== undefined) {
        if (!Array.isArray(raw.summary)) {
          throw malformed(eventType, 'reasoning summary must be an array');
        }
        raw.summary.forEach((part, summaryIndex) => {
          if (
            !isRecord(part) ||
            part.type !== 'summary_text' ||
            typeof part.text !== 'string'
          ) {
            throw malformed(eventType, 'reasoning summary part is invalid');
          }
          reasoningItem.summary.set(summaryIndex, part.text);
        });
      } else if (existing?.type === 'reasoning') {
        reasoningItem.summary = existing.summary;
      }
      if (
        reasoningItem.encryptedContent === undefined &&
        existing?.type === 'reasoning'
      ) {
        reasoningItem.encryptedContent = existing.encryptedContent;
      }
      item = reasoningItem;
    } else if (type === 'function_call') {
      const rawArguments = optionalString(raw, 'arguments', eventType);
      item = {
        type,
        id,
        outputIndex,
        callId:
          optionalString(raw, 'call_id', eventType) ??
          (existing?.type === 'function_call' ? existing.callId : ''),
        name:
          optionalString(raw, 'name', eventType) ??
          (existing?.type === 'function_call' ? existing.name : ''),
        arguments:
          preserveAccumulated &&
          existing?.type === 'function_call' &&
          rawArguments === ''
            ? existing.arguments
            : (rawArguments ??
              (existing?.type === 'function_call' ? existing.arguments : '')),
        status: this.itemStatus(raw.status, eventType),
      };
      if (!item.callId || !item.name) {
        throw malformed(eventType, 'function call requires call_id and name');
      }
    } else {
      throw new ResponsesStreamProtocolError(
        'unsupported-output',
        `Unsupported Responses output item type "${safeLabel(type)}".`,
        {
          eventType: safeLabel(eventType),
          partialResult: this.buildResult(),
        },
      );
    }

    this.items.set(outputIndex, item);
    this.itemIndices.set(id, outputIndex);
    if (replacesId) {
      if (isOutputItemDone) {
        this.doneReplacedItemIndices.add(outputIndex);
      }
      this.compatibilityRemappedItemIndices.add(outputIndex);
    }
  }

  private itemStatus(
    value: unknown,
    eventType: string,
  ): 'in_progress' | 'completed' | 'incomplete' | undefined {
    if (
      value !== undefined &&
      value !== 'in_progress' &&
      value !== 'completed' &&
      value !== 'incomplete'
    ) {
      throw malformed(eventType, 'output item status is invalid');
    }
    return value;
  }

  private parseMessagePart(part: RecordValue, eventType: string): MessagePart {
    if (part.type === 'output_text' && typeof part.text === 'string') {
      if (part.annotations !== undefined && !Array.isArray(part.annotations)) {
        throw malformed(eventType, 'output text annotations must be an array');
      }
      return {
        type: 'output_text',
        text: part.text,
        ...(part.annotations ? {annotations: [...part.annotations]} : {}),
      };
    }
    if (part.type === 'refusal' && typeof part.refusal === 'string') {
      return {type: 'refusal', refusal: part.refusal};
    }
    throw new ResponsesStreamProtocolError(
      'unsupported-output',
      `Unsupported Responses content part type "${
        typeof part.type === 'string' ? safeLabel(part.type) : 'unknown'
      }".`,
      {
        eventType: safeLabel(eventType),
        partialResult: this.buildResult(),
      },
    );
  }

  private itemForEvent(
    event: RecordValue,
    eventType: string,
    expected: InternalItem['type'],
  ): InternalItem {
    const outputIndex = requiredIndex(event, 'output_index', eventType);
    const itemId = requiredString(event, 'item_id', eventType);
    const item = this.items.get(outputIndex);
    if (!item || item.type !== expected) {
      throw malformed(eventType, `event does not match a ${expected} item`);
    }
    if (item.id !== itemId) {
      const priorIndex = this.itemIndices.get(itemId);
      if (
        this.compatibility.providerProfile !== 'github-copilot' ||
        priorIndex !== undefined
      ) {
        throw malformed(eventType, `event does not match a ${expected} item`);
      }
      item.id = itemId;
      this.itemIndices.set(itemId, outputIndex);
      this.compatibilityRemappedItemIndices.add(outputIndex);
    }
    return item;
  }

  private messageForEvent(
    event: RecordValue,
    eventType: string,
  ): Extract<InternalItem, {type: 'message'}> {
    return this.itemForEvent(event, eventType, 'message') as Extract<
      InternalItem,
      {type: 'message'}
    >;
  }

  private reasoningForEvent(
    event: RecordValue,
    eventType: string,
  ): Extract<InternalItem, {type: 'reasoning'}> {
    return this.itemForEvent(event, eventType, 'reasoning') as Extract<
      InternalItem,
      {type: 'reasoning'}
    >;
  }

  private functionForEvent(
    event: RecordValue,
    eventType: string,
  ): Extract<InternalItem, {type: 'function_call'}> {
    return this.itemForEvent(event, eventType, 'function_call') as Extract<
      InternalItem,
      {type: 'function_call'}
    >;
  }

  private projectionKey(): string {
    const projection = this.snapshot();
    return JSON.stringify(projection);
  }

  private visibleContent(): string {
    return sortedValues(this.items)
      .filter(
        (item): item is Extract<InternalItem, {type: 'message'}> =>
          item.type === 'message',
      )
      .flatMap(item => sortedValues(item.content))
      .map(part => (part.type === 'output_text' ? part.text : part.refusal))
      .join('');
  }

  private refusalContent(): string {
    return sortedValues(this.items)
      .filter(
        (item): item is Extract<InternalItem, {type: 'message'}> =>
          item.type === 'message',
      )
      .flatMap(item => sortedValues(item.content))
      .filter(
        (part): part is Extract<MessagePart, {type: 'refusal'}> =>
          part.type === 'refusal',
      )
      .map(part => part.refusal)
      .join('');
  }

  private reasoningContent(): string {
    return sortedValues(this.items)
      .filter(
        (item): item is Extract<InternalItem, {type: 'reasoning'}> =>
          item.type === 'reasoning',
      )
      .flatMap(item => sortedValues(item.summary))
      .join('');
  }

  private completedToolCalls(): ToolCall[] {
    return sortedValues(this.items)
      .filter(
        (item): item is Extract<InternalItem, {type: 'function_call'}> =>
          item.type === 'function_call' && item.status === 'completed',
      )
      .map(item => ({
        id: item.callId,
        type: 'function' as const,
        function: {name: item.name, arguments: item.arguments},
      }));
  }

  private streamToolCalls(): ToolCall[] {
    if (
      this.refusalContent() ||
      (this.terminalStatus !== undefined && this.terminalStatus !== 'completed')
    ) {
      return [];
    }
    if (this.terminalStatus === 'completed') {
      return this.completedToolCalls();
    }
    return sortedValues(this.items)
      .filter(
        (item): item is Extract<InternalItem, {type: 'function_call'}> =>
          item.type === 'function_call',
      )
      .map(item => ({
        id: item.callId,
        type: 'function' as const,
        function: {name: item.name, arguments: item.arguments},
      }));
  }

  private buildResult(): CompletionResult {
    const content = this.visibleContent();
    const reasoning = this.reasoningContent();
    const refusal = this.refusalContent();
    const tools = this.completedToolCalls();
    const terminalStatus = refusal ? 'incomplete' : this.terminalStatus;
    return {
      text: content,
      content,
      reasoning_content: reasoning || undefined,
      tool_calls:
        refusal ||
        (this.terminalStatus !== undefined &&
          this.terminalStatus !== 'completed') ||
        tools.length === 0
          ? undefined
          : tools,
      tokens_evaluated: this.usage?.inputTokens,
      tokens_predicted: this.usage?.outputTokens,
      terminal_status: terminalStatus,
      incomplete_reason: refusal ? 'content_filter' : this.incompleteReason,
      refusal: refusal || undefined,
      usage: this.usage,
      interrupted:
        terminalStatus !== undefined && terminalStatus !== 'completed'
          ? true
          : undefined,
    };
  }

  private replayOutput(): ReplayableResponsesOutputItem[] {
    const callIds = new Set<string>();
    return sortedValues(this.items).map(item => {
      if (item.type === 'message') {
        if (item.status !== undefined && item.status !== 'completed') {
          throw new ResponsesStreamProtocolError(
            'invalid-completed-response',
            'Completed response contains a non-completed message item.',
            {partialResult: this.buildResult()},
          );
        }
        const message: ResponsesOutputMessage = {
          type: 'message',
          id: item.id,
          role: 'assistant',
          status: 'completed',
          ...(item.phase ? {phase: item.phase} : {}),
          content: sortedValues(item.content).map(part => ({...part})),
        };
        return message;
      }
      if (item.type === 'reasoning') {
        const reasoning: ResponsesReasoningItem = {
          type: 'reasoning',
          id: item.id,
          summary: sortedValues(item.summary).map(text => ({
            type: 'summary_text',
            text,
          })),
          ...(item.encryptedContent !== undefined
            ? {encrypted_content: item.encryptedContent}
            : {}),
        };
        return reasoning;
      }
      if (item.status !== 'completed') {
        throw new ResponsesStreamProtocolError(
          'invalid-completed-response',
          'Completed response contains a non-completed function call.',
          {partialResult: this.buildResult()},
        );
      }
      if (callIds.has(item.callId)) {
        throw new ResponsesStreamProtocolError(
          'invalid-completed-response',
          'Completed response contains a duplicate function call id.',
          {partialResult: this.buildResult()},
        );
      }
      callIds.add(item.callId);
      const call: ResponsesFunctionCall = {
        type: 'function_call',
        id: item.id,
        call_id: item.callId,
        name: item.name,
        arguments: item.arguments,
        status: 'completed',
      };
      return call;
    });
  }
}

export function createResponsesStreamReducer(
  diagnostics?: ResponsesDiagnostics,
  compatibility?: ResponsesStreamCompatibility,
): ResponsesStreamReducer {
  return new ResponsesStreamReducer(diagnostics, compatibility);
}
