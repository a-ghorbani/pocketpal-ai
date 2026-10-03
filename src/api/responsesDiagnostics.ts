import type {
  ResponsesRequestOptions,
  ResponsesRequestParams,
} from './responsesRequest';

const MAX_RECORD_BYTES = 2 * 1024;
const MAX_RECORDS = 128;
const MAX_TRACE_BYTES = 64 * 1024;
const MAX_ALIASES = 256;
const LOG_TAG = '[PP_RESPONSES_DIAG]';

const EVENT_TYPE_VALUES = [
  'response.created',
  'response.in_progress',
  'response.output_item.added',
  'response.output_item.done',
  'response.content_part.added',
  'response.content_part.done',
  'response.output_text.delta',
  'response.output_text.done',
  'response.refusal.delta',
  'response.refusal.done',
  'response.reasoning_summary_part.added',
  'response.reasoning_summary_part.done',
  'response.reasoning_summary_text.delta',
  'response.reasoning_summary_text.done',
  'response.function_call_arguments.delta',
  'response.function_call_arguments.done',
  'response.completed',
  'response.incomplete',
  'response.failed',
  'response.cancelled',
  'error',
] as const;
const ITEM_TYPE_VALUES = ['message', 'reasoning', 'function_call'] as const;
const PART_TYPE_VALUES = ['output_text', 'refusal', 'summary_text'] as const;
const STATUS_VALUES = [
  'queued',
  'in_progress',
  'completed',
  'incomplete',
  'failed',
  'cancelled',
] as const;
const ROLE_VALUES = ['assistant'] as const;
const PHASE_VALUES = ['commentary', 'final_answer'] as const;
const MISMATCH_REASON_VALUES = [
  'malformed-event',
  'unsupported-output',
  'invalid-lifecycle',
  'premature-eof',
  'response-incomplete',
  'response-failed',
  'response-cancelled',
  'response-error',
  'invalid-completed-response',
] as const;

const EVENT_TYPES: ReadonlySet<string> = new Set(EVENT_TYPE_VALUES);
const ITEM_TYPES: ReadonlySet<string> = new Set(ITEM_TYPE_VALUES);
const PART_TYPES: ReadonlySet<string> = new Set(PART_TYPE_VALUES);
const STATUSES: ReadonlySet<string> = new Set(STATUS_VALUES);
const ROLES: ReadonlySet<string> = new Set(ROLE_VALUES);
const PHASES: ReadonlySet<string> = new Set(PHASE_VALUES);
const MISMATCH_REASONS: ReadonlySet<string> = new Set(MISMATCH_REASON_VALUES);

type Allowlisted<T extends readonly string[]> = T[number] | 'unknown';

export interface ResponsesDiagnosticRecord {
  kind: 'request' | 'event' | 'http' | 'outcome' | 'error';
  sequence: number;
  protocol?: 'responses';
  endpoint?: 'responses';
  inputSource?: 'messages' | 'history';
  maxOutputTokensSource?: 'absent' | 'max-tokens' | 'n-predict' | 'both';
  hasTemperature?: boolean;
  hasTopP?: boolean;
  hasMaxOutputTokens?: boolean;
  hasTools?: boolean;
  hasToolChoice?: boolean;
  hasTextFormat?: boolean;
  reasoningMode?:
    | 'absent'
    | 'enabled'
    | 'enabled-with-effort'
    | 'disabled'
    | 'disabled-with-policy';
  requestsEncryptedReasoning?: boolean;
  eventType?: Allowlisted<typeof EVENT_TYPE_VALUES>;
  outputIndex?: number;
  contentIndex?: number;
  summaryIndex?: number;
  responseAlias?: string;
  itemAlias?: string;
  callAlias?: string;
  itemType?: Allowlisted<typeof ITEM_TYPE_VALUES>;
  partType?: Allowlisted<typeof PART_TYPE_VALUES>;
  status?: Allowlisted<typeof STATUS_VALUES>;
  role?: Allowlisted<typeof ROLE_VALUES>;
  phase?: Allowlisted<typeof PHASE_VALUES>;
  httpStatus?: number;
  outcome?: 'completed' | 'interrupted' | 'aborted' | 'error';
  errorClass?:
    | 'abort'
    | 'http'
    | 'network'
    | 'timeout'
    | 'parse'
    | 'protocol'
    | 'internal';
  mismatchReason?: Allowlisted<typeof MISMATCH_REASON_VALUES>;
}

export type ResponsesDiagnosticObserver = (
  record: Readonly<ResponsesDiagnosticRecord>,
) => void;

const logResponsesDiagnosticRecord: ResponsesDiagnosticObserver = record => {
  console.info(`${LOG_TAG} ${JSON.stringify(record)}`);
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function utf8Length(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      length++;
    } else if (code < 0x800) {
      length += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      length += 4;
      index++;
    } else {
      length += 3;
    }
  }
  return length;
}

function recordBytes(record: ResponsesDiagnosticRecord): number {
  return utf8Length(JSON.stringify(record));
}

function allowlisted<T extends readonly string[]>(
  value: unknown,
  values: ReadonlySet<string>,
): Allowlisted<T> | undefined {
  return typeof value === 'string'
    ? values.has(value)
      ? (value as T[number])
      : 'unknown'
    : undefined;
}

function finiteIndex(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function httpStatus(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

function reasoningMode(
  params: ResponsesRequestParams,
  options: ResponsesRequestOptions,
): ResponsesDiagnosticRecord['reasoningMode'] {
  if (!params.reasoning) {
    return 'absent';
  }
  if (params.reasoning.enabled) {
    return params.reasoning.effort ? 'enabled-with-effort' : 'enabled';
  }
  return options.parameterPolicy?.reasoning?.disabledEffort
    ? 'disabled-with-policy'
    : 'disabled';
}

function safeErrorClass(
  error: unknown,
): Pick<ResponsesDiagnosticRecord, 'errorClass' | 'mismatchReason'> {
  if (isRecord(error)) {
    const mismatchReason = allowlisted<typeof MISMATCH_REASON_VALUES>(
      error.code,
      MISMATCH_REASONS,
    );
    if (mismatchReason) {
      return {errorClass: 'protocol', mismatchReason};
    }
    if (error.name === 'AbortError' || error.message === 'Completion aborted') {
      return {errorClass: 'abort'};
    }
    if (
      error.message === 'Connection timed out' ||
      error.message === 'Idle timeout: no data received'
    ) {
      return {errorClass: 'timeout'};
    }
    if (error.message === 'Network error') {
      return {errorClass: 'network'};
    }
    if (
      typeof error.message === 'string' &&
      error.message.startsWith('Malformed JSON')
    ) {
      return {errorClass: 'parse'};
    }
  }
  return {errorClass: 'internal'};
}

export class ResponsesDiagnosticRecorder {
  private readonly captured: Readonly<ResponsesDiagnosticRecord>[] = [];
  private bytes = 2;

  readonly observer: ResponsesDiagnosticObserver = record => {
    if (this.captured.length >= MAX_RECORDS) {
      return;
    }
    const bytes = recordBytes(record);
    const separatorBytes = this.captured.length > 0 ? 1 : 0;
    if (
      bytes > MAX_RECORD_BYTES ||
      this.bytes + separatorBytes + bytes > MAX_TRACE_BYTES
    ) {
      return;
    }
    this.captured.push(Object.freeze({...record}));
    this.bytes += separatorBytes + bytes;
  };

  get records(): readonly Readonly<ResponsesDiagnosticRecord>[] {
    return this.captured;
  }

  clear(): void {
    this.captured.length = 0;
    this.bytes = 2;
  }
}

export class ResponsesDiagnosticsController {
  private recorder?: ResponsesDiagnosticRecorder;
  private downstreamObserver?: ResponsesDiagnosticObserver;
  private active = false;

  private readonly observe: ResponsesDiagnosticObserver = record => {
    if (!this.active) {
      return;
    }
    this.recorder?.observer(record);
    try {
      this.downstreamObserver?.(record);
    } catch {
      // Diagnostics must never affect completion behavior.
    }
  };

  get enabled(): boolean {
    return this.active;
  }

  get observer(): ResponsesDiagnosticObserver | undefined {
    return this.enabled ? this.observe : undefined;
  }

  get records(): readonly Readonly<ResponsesDiagnosticRecord>[] {
    return this.recorder?.records ?? [];
  }

  enable(
    observer: ResponsesDiagnosticObserver = logResponsesDiagnosticRecord,
  ): void {
    this.recorder ??= new ResponsesDiagnosticRecorder();
    this.downstreamObserver = observer;
    this.active = true;
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.enable();
      return;
    }
    this.active = false;
    this.downstreamObserver = undefined;
  }

  clear(): void {
    this.recorder?.clear();
  }

  disableAndClear(): void {
    this.setEnabled(false);
    this.recorder?.clear();
    this.recorder = undefined;
  }
}

export const responsesDiagnosticsController =
  new ResponsesDiagnosticsController();

export class ResponsesDiagnostics {
  private sequence = 0;
  private records = 0;
  private bytes = 2;
  private terminal = false;
  private readonly aliases = new Map<string, string>();

  constructor(private readonly observer: ResponsesDiagnosticObserver) {}

  request(
    params: ResponsesRequestParams,
    options: ResponsesRequestOptions,
  ): void {
    this.emit({
      kind: 'request',
      protocol: 'responses',
      endpoint: 'responses',
      inputSource: options.input ? 'history' : 'messages',
      maxOutputTokensSource:
        params.max_tokens !== undefined
          ? params.n_predict !== undefined
            ? 'both'
            : 'max-tokens'
          : params.n_predict !== undefined
            ? 'n-predict'
            : 'absent',
      hasTemperature: params.temperature !== undefined,
      hasTopP: params.top_p !== undefined,
      hasMaxOutputTokens:
        params.max_tokens !== undefined || params.n_predict !== undefined,
      hasTools: params.tools !== undefined,
      hasToolChoice: params.tool_choice !== undefined,
      hasTextFormat: params.response_format !== undefined,
      reasoningMode: reasoningMode(params, options),
      requestsEncryptedReasoning:
        options.includeReasoningEncryptedContent === true,
    });
  }

  event(value: unknown): void {
    const event = isRecord(value) ? value : undefined;
    const item = event && isRecord(event.item) ? event.item : undefined;
    const part = event && isRecord(event.part) ? event.part : undefined;
    const response =
      event && isRecord(event.response) ? event.response : undefined;

    this.emit({
      kind: 'event',
      eventType:
        allowlisted<typeof EVENT_TYPE_VALUES>(event?.type, EVENT_TYPES) ??
        (event ? 'unknown' : undefined),
      outputIndex: finiteIndex(event?.output_index),
      contentIndex: finiteIndex(event?.content_index),
      summaryIndex: finiteIndex(event?.summary_index),
      responseAlias: this.alias(response?.id, 'response'),
      itemAlias: this.alias(event?.item_id ?? item?.id, 'item'),
      callAlias: this.alias(item?.call_id, 'call'),
      itemType: allowlisted<typeof ITEM_TYPE_VALUES>(item?.type, ITEM_TYPES),
      partType: allowlisted<typeof PART_TYPE_VALUES>(part?.type, PART_TYPES),
      status: allowlisted<typeof STATUS_VALUES>(
        response?.status ?? item?.status,
        STATUSES,
      ),
      role: allowlisted<typeof ROLE_VALUES>(item?.role, ROLES),
      phase: allowlisted<typeof PHASE_VALUES>(item?.phase, PHASES),
    });
  }

  http(status: unknown): void {
    this.emit({kind: 'http', httpStatus: httpStatus(status)});
  }

  error(error: unknown, errorClass?: 'http'): void {
    if (this.terminal) {
      return;
    }
    const safe =
      errorClass === 'http'
        ? ({errorClass: 'http'} as const)
        : safeErrorClass(error);
    this.emit({kind: 'error', ...safe});
    this.finish('error');
  }

  finish(outcome: 'completed' | 'interrupted' | 'aborted' | 'error'): void {
    if (this.terminal) {
      return;
    }
    this.terminal = true;
    this.emit({kind: 'outcome', outcome});
  }

  private alias(value: unknown, prefix: string): string | undefined {
    if (typeof value !== 'string' || value.length === 0) {
      return undefined;
    }
    const existing = this.aliases.get(value);
    if (existing) {
      return existing;
    }
    if (this.aliases.size >= MAX_ALIASES) {
      return undefined;
    }
    const alias = `${prefix}-${this.aliases.size + 1}`;
    this.aliases.set(value, alias);
    return alias;
  }

  private emit(record: Omit<ResponsesDiagnosticRecord, 'sequence'>): void {
    if (this.records >= MAX_RECORDS) {
      return;
    }
    const complete = Object.freeze({
      ...record,
      sequence: this.sequence++,
    }) as Readonly<ResponsesDiagnosticRecord>;
    const bytes = recordBytes(complete);
    const separatorBytes = this.records > 0 ? 1 : 0;
    if (
      bytes > MAX_RECORD_BYTES ||
      this.bytes + separatorBytes + bytes > MAX_TRACE_BYTES
    ) {
      return;
    }
    this.records++;
    this.bytes += separatorBytes + bytes;
    try {
      this.observer(complete);
    } catch {
      // Diagnostics must never affect completion behavior.
    }
  }
}

export function createResponsesDiagnostics(
  observer?: ResponsesDiagnosticObserver,
): ResponsesDiagnostics | undefined {
  return observer ? new ResponsesDiagnostics(observer) : undefined;
}

export const RESPONSES_DIAGNOSTIC_LIMITS = Object.freeze({
  recordBytes: MAX_RECORD_BYTES,
  records: MAX_RECORDS,
  traceBytes: MAX_TRACE_BYTES,
  aliases: MAX_ALIASES,
});
