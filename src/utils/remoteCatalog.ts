import {
  normalizePositiveInteger,
  type NormalizedRemoteCatalogModel,
  type RemoteCatalogProvenance,
  type RemoteParameterSupportEvidence,
  type RemoteProtocolCapabilities,
  type RemoteWireApi,
} from './remoteProtocol';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Catalogs advertise paths, not request URLs. Only the two supported,
 * unversioned paths and their exact v1 equivalents are recognized.
 */
export function normalizeRemoteEndpoint(
  value: unknown,
): RemoteWireApi | undefined {
  if (value === '/chat/completions' || value === '/v1/chat/completions') {
    return 'chat-completions';
  }
  if (value === '/responses' || value === '/v1/responses') {
    return 'responses';
  }
  return undefined;
}

function normalizeEndpoints(value: unknown): {
  advertisedEndpoints?: RemoteWireApi[];
  endpointSupport: NormalizedRemoteCatalogModel['endpointSupport'];
} {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(
      endpoint => typeof endpoint === 'string' && endpoint.length > 0,
    )
  ) {
    return {endpointSupport: 'unknown'};
  }

  const advertisedEndpoints: RemoteWireApi[] = [];
  for (const endpoint of value) {
    const normalized = normalizeRemoteEndpoint(endpoint);
    if (normalized && !advertisedEndpoints.includes(normalized)) {
      advertisedEndpoints.push(normalized);
    }
  }
  return {advertisedEndpoints, endpointSupport: 'known'};
}

function booleanField(
  record: Record<string, unknown> | undefined,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    if (typeof record?.[key] === 'boolean') {
      return record[key] as boolean;
    }
  }
  return undefined;
}

function normalizeReasoningEfforts(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(effort => typeof effort === 'string' && effort.length > 0)
  ) {
    return undefined;
  }
  return Array.from(new Set(value));
}

function normalizeObjectCapabilities(
  value: Record<string, unknown>,
  provenance: RemoteCatalogProvenance,
): Omit<RemoteProtocolCapabilities, 'advertisedEndpoints'> {
  const supports = isRecord(value.supports) ? value.supports : undefined;
  const limits = isRecord(value.limits) ? value.limits : undefined;
  const capabilities: Omit<RemoteProtocolCapabilities, 'advertisedEndpoints'> =
    {};

  const supportsVision = booleanField(supports, 'vision');
  const supportsTools = booleanField(supports, 'tool_calls');
  const supportsStructuredOutput = booleanField(
    supports,
    'structured_outputs',
    'structured_output',
  );
  const contextLength = normalizePositiveInteger(
    limits?.max_context_window_tokens,
  );
  const maxOutputTokens = normalizePositiveInteger(limits?.max_output_tokens);
  const reasoningEffortValues = normalizeReasoningEfforts(
    supports?.reasoning_effort,
  );
  const evidence = (
    supported: boolean | undefined,
  ): RemoteParameterSupportEvidence | undefined =>
    supported === undefined
      ? undefined
      : {
          supported,
          source: provenance === 'live' ? 'live-catalog' : 'cached-catalog',
        };
  const temperature = evidence(booleanField(supports, 'temperature'));
  const topP = evidence(booleanField(supports, 'top_p'));
  const maxOutputTokensSupport = evidence(
    booleanField(supports, 'max_output_tokens'),
  );

  if (supportsVision !== undefined) {
    capabilities.supportsVision = supportsVision;
  }
  if (supportsTools !== undefined) {
    capabilities.supportsTools = supportsTools;
  }
  if (supportsStructuredOutput !== undefined) {
    capabilities.supportsStructuredOutput = supportsStructuredOutput;
  }
  if (contextLength !== undefined) {
    capabilities.contextLength = contextLength;
  }
  if (maxOutputTokens !== undefined) {
    capabilities.maxOutputTokens = maxOutputTokens;
  }
  if (reasoningEffortValues !== undefined) {
    capabilities.reasoningEffortValues = reasoningEffortValues;
  }
  if (temperature || topP || maxOutputTokensSupport) {
    capabilities.responsesSampling = {
      ...(temperature ? {temperature} : {}),
      ...(topP ? {topP} : {}),
      ...(maxOutputTokensSupport
        ? {maxOutputTokens: maxOutputTokensSupport}
        : {}),
    };
  }

  return capabilities;
}

const LLAMA_VISION_CAPABILITIES = new Set(['multimodal', 'vision']);
const LLAMA_TOOL_CAPABILITIES = new Set(['tool_calls', 'tools']);
const LLAMA_STRUCTURED_OUTPUT_CAPABILITIES = new Set([
  'structured_output',
  'structured_outputs',
  'structured-output',
  'json_schema',
]);

function normalizeArrayCapabilities(
  value: unknown[],
): Omit<RemoteProtocolCapabilities, 'advertisedEndpoints'> {
  if (!value.every(capability => typeof capability === 'string')) {
    return {};
  }
  const declared = new Set(value);
  return {
    supportsVision: Array.from(LLAMA_VISION_CAPABILITIES).some(capability =>
      declared.has(capability),
    ),
    supportsTools: Array.from(LLAMA_TOOL_CAPABILITIES).some(capability =>
      declared.has(capability),
    ),
    supportsStructuredOutput: Array.from(
      LLAMA_STRUCTURED_OUTPUT_CAPABILITIES,
    ).some(capability => declared.has(capability)),
  };
}

function freezeCapabilities(
  capabilities: RemoteProtocolCapabilities,
): RemoteProtocolCapabilities {
  if (capabilities.advertisedEndpoints) {
    Object.freeze(capabilities.advertisedEndpoints);
  }
  if (capabilities.reasoningEffortValues) {
    Object.freeze(capabilities.reasoningEffortValues);
  }
  if (capabilities.responsesSampling) {
    for (const evidence of Object.values(capabilities.responsesSampling)) {
      if (evidence?.reasoningModes) {
        Object.freeze(evidence.reasoningModes);
      }
      Object.freeze(evidence);
    }
    Object.freeze(capabilities.responsesSampling);
  }
  return Object.freeze(capabilities);
}

/**
 * Normalize either Copilot's nested capability object or llama.cpp's flat
 * string array. A malformed shape contributes no capability claims.
 */
export function normalizeRemoteCatalogModel(
  row: unknown,
  provenance: RemoteCatalogProvenance = 'live',
): NormalizedRemoteCatalogModel {
  const record = isRecord(row) ? row : undefined;
  const endpoints = normalizeEndpoints(record?.supported_endpoints);
  const rawCapabilities = record?.capabilities;
  const modelCapabilities = isRecord(rawCapabilities)
    ? normalizeObjectCapabilities(rawCapabilities, provenance)
    : Array.isArray(rawCapabilities)
      ? normalizeArrayCapabilities(rawCapabilities)
      : {};

  return Object.freeze({
    capabilities: freezeCapabilities({
      ...modelCapabilities,
      ...(endpoints.advertisedEndpoints
        ? {advertisedEndpoints: endpoints.advertisedEndpoints}
        : {}),
    }),
    endpointSupport: endpoints.endpointSupport,
    provenance,
  });
}
