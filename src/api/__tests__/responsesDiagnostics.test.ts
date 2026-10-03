import {
  createResponsesDiagnostics,
  RESPONSES_DIAGNOSTIC_LIMITS,
  type ResponsesDiagnosticRecord,
  ResponsesDiagnosticRecorder,
  responsesDiagnosticsController,
} from '../responsesDiagnostics';

const secret = 'SECRET_MARKER_DO_NOT_RECORD';

const request = {
  model: `model-${secret}`,
  messages: [
    {
      role: 'user',
      content: `prompt-${secret}`,
    },
  ],
  temperature: 0.5,
  top_p: 0.9,
  max_tokens: 100,
  tools: [
    {
      type: 'function' as const,
      function: {
        name: `tool-${secret}`,
        description: secret,
        parameters: {secret},
      },
    },
  ],
  tool_choice: 'auto' as const,
  response_format: {
    type: 'json_schema' as const,
    json_schema: {
      name: `schema-${secret}`,
      schema: {type: 'object', description: secret},
    },
  },
  reasoning: {enabled: true, effort: 'high'},
};

describe('Responses diagnostics', () => {
  afterEach(() => {
    responsesDiagnosticsController.disableAndClear();
  });

  it('is opt-in and inert when disabled', () => {
    expect(createResponsesDiagnostics()).toBeUndefined();
  });

  it('emits only allowlisted request and event structure with scoped aliases', () => {
    const recorder = new ResponsesDiagnosticRecorder();
    const diagnostics = createResponsesDiagnostics(recorder.observer)!;
    diagnostics.request(request, {
      input: [
        {
          role: 'user',
          content: `history-${secret}`,
        },
      ],
      includeReasoningEncryptedContent: true,
    });
    diagnostics.event({
      type: 'response.output_item.added',
      output_index: 3,
      item: {
        type: 'function_call',
        id: `item-${secret}`,
        call_id: `call-${secret}`,
        name: `tool-${secret}`,
        arguments: `args-${secret}`,
        status: 'in_progress',
      },
      headers: {Authorization: secret},
      url: `https://${secret}.test`,
    });
    diagnostics.event({
      type: 'response.function_call_arguments.done',
      output_index: 3,
      item_id: `item-${secret}`,
      arguments: `result-${secret}`,
    });
    diagnostics.finish('completed');

    expect(recorder.records).toEqual([
      expect.objectContaining({
        kind: 'request',
        protocol: 'responses',
        endpoint: 'responses',
        inputSource: 'history',
        maxOutputTokensSource: 'max-tokens',
        hasTemperature: true,
        hasTopP: true,
        hasMaxOutputTokens: true,
        hasTools: true,
        hasToolChoice: true,
        hasTextFormat: true,
        reasoningMode: 'enabled-with-effort',
        requestsEncryptedReasoning: true,
      }),
      expect.objectContaining({
        kind: 'event',
        eventType: 'response.output_item.added',
        outputIndex: 3,
        itemAlias: 'item-1',
        callAlias: 'call-2',
        itemType: 'function_call',
        status: 'in_progress',
      }),
      expect.objectContaining({
        kind: 'event',
        eventType: 'response.function_call_arguments.done',
        outputIndex: 3,
        itemAlias: 'item-1',
      }),
      expect.objectContaining({kind: 'outcome', outcome: 'completed'}),
    ]);
    expect(JSON.stringify(recorder.records)).not.toContain(secret);
  });

  it('maps unknown structural values and protocol mismatches to safe labels', () => {
    const recorder = new ResponsesDiagnosticRecorder();
    const diagnostics = createResponsesDiagnostics(recorder.observer)!;
    diagnostics.event({
      type: `event-${secret}`,
      output_index: Number.POSITIVE_INFINITY,
      content_index: -1,
      summary_index: 1.5,
      item: {
        type: `item-${secret}`,
        id: secret,
        status: `status-${secret}`,
        role: `role-${secret}`,
        phase: `phase-${secret}`,
      },
      part: {type: `part-${secret}`, text: secret},
    });
    diagnostics.error({
      code: 'invalid-lifecycle',
      message: secret,
      stack: secret,
    });

    expect(recorder.records[0]).toEqual({
      kind: 'event',
      sequence: 0,
      eventType: 'unknown',
      outputIndex: undefined,
      contentIndex: undefined,
      summaryIndex: undefined,
      responseAlias: undefined,
      itemAlias: 'item-1',
      callAlias: undefined,
      itemType: 'unknown',
      partType: 'unknown',
      status: 'unknown',
      role: 'unknown',
      phase: 'unknown',
    });
    expect(recorder.records[1]).toEqual(
      expect.objectContaining({
        kind: 'error',
        errorClass: 'protocol',
        mismatchReason: 'invalid-lifecycle',
      }),
    );
    expect(JSON.stringify(recorder.records)).not.toContain(secret);
  });

  it('enforces record, trace, and alias bounds without observer failures escaping', () => {
    const observed: unknown[] = [];
    const diagnostics = createResponsesDiagnostics(record => {
      observed.push(record);
      throw new Error(secret);
    })!;

    for (let index = 0; index < 400; index++) {
      diagnostics.event({
        type: 'response.output_item.added',
        output_index: index,
        item: {
          type: 'function_call',
          id: `item-${index}-${secret}`,
          call_id: `call-${index}-${secret}`,
          status: 'in_progress',
        },
      });
    }
    diagnostics.finish('completed');

    expect(observed).toHaveLength(RESPONSES_DIAGNOSTIC_LIMITS.records);
    expect(observed.at(-1)).toEqual(
      expect.objectContaining({
        itemAlias: 'item-255',
        callAlias: 'call-256',
      }),
    );
    for (const record of observed) {
      expect(
        Buffer.byteLength(JSON.stringify(record), 'utf8'),
      ).toBeLessThanOrEqual(RESPONSES_DIAGNOSTIC_LIMITS.recordBytes);
    }
    expect(
      Buffer.byteLength(JSON.stringify(observed), 'utf8'),
    ).toBeLessThanOrEqual(RESPONSES_DIAGNOSTIC_LIMITS.traceBytes);
    expect(JSON.stringify(observed)).not.toContain(secret);

    const recorder = new ResponsesDiagnosticRecorder();
    recorder.observer({
      kind: 'event',
      sequence: 0,
      eventType: secret.repeat(RESPONSES_DIAGNOSTIC_LIMITS.recordBytes),
    } as unknown as ResponsesDiagnosticRecord);
    expect(recorder.records).toHaveLength(0);
  });

  it('provides an opt-in controller with clear and disable-and-clear behavior', () => {
    expect(responsesDiagnosticsController.enabled).toBe(false);
    expect(responsesDiagnosticsController.observer).toBeUndefined();

    responsesDiagnosticsController.enable(() => {});
    expect(responsesDiagnosticsController.enabled).toBe(true);
    const observer = responsesDiagnosticsController.observer!;
    observer({kind: 'outcome', sequence: 0, outcome: 'completed'});
    expect(responsesDiagnosticsController.records).toHaveLength(1);

    responsesDiagnosticsController.clear();
    expect(responsesDiagnosticsController.records).toHaveLength(0);
    observer({kind: 'outcome', sequence: 1, outcome: 'completed'});
    expect(responsesDiagnosticsController.records).toHaveLength(1);

    responsesDiagnosticsController.setEnabled(false);
    expect(responsesDiagnosticsController.enabled).toBe(false);
    expect(responsesDiagnosticsController.observer).toBeUndefined();
    observer({kind: 'outcome', sequence: 2, outcome: 'completed'});
    expect(responsesDiagnosticsController.records).toHaveLength(1);

    responsesDiagnosticsController.setEnabled(true);
    expect(responsesDiagnosticsController.enabled).toBe(true);
    expect(responsesDiagnosticsController.records).toHaveLength(1);

    responsesDiagnosticsController.disableAndClear();
    expect(responsesDiagnosticsController.enabled).toBe(false);
    expect(responsesDiagnosticsController.observer).toBeUndefined();
    expect(responsesDiagnosticsController.records).toHaveLength(0);
    observer({kind: 'outcome', sequence: 3, outcome: 'completed'});
    expect(responsesDiagnosticsController.records).toHaveLength(0);
  });

  it('logs sanitized bounded records with the diagnostic tag by default', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    responsesDiagnosticsController.enable();
    const diagnostics = createResponsesDiagnostics(
      responsesDiagnosticsController.observer,
    )!;

    diagnostics.request(request, {});
    diagnostics.event({
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'function_call',
        id: `item-${secret}`,
        call_id: `call-${secret}`,
        name: `tool-${secret}`,
        arguments: `args-${secret}`,
        status: 'in_progress',
      },
    });
    diagnostics.finish('completed');

    expect(info).toHaveBeenCalled();
    for (const [message] of info.mock.calls) {
      expect(message).toEqual(expect.stringMatching(/^\[PP_RESPONSES_DIAG\] /));
      expect(message).not.toContain(secret);
    }

    const callsBeforeDisable = info.mock.calls.length;
    const staleObserver = responsesDiagnosticsController.observer!;
    responsesDiagnosticsController.disableAndClear();
    staleObserver({kind: 'outcome', sequence: 100, outcome: 'completed'});
    expect(info).toHaveBeenCalledTimes(callsBeforeDisable);
    info.mockRestore();
  });
});
