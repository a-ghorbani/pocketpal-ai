import type {RemoteGenerationSettings} from './completionTypes';

export const REMOTE_WIRE_APIS = ['chat-completions', 'responses'] as const;

export type RemoteWireApi = (typeof REMOTE_WIRE_APIS)[number];
export type RemoteApiMode = 'auto' | RemoteWireApi;
export type RemoteProtocolSource =
  | 'model-override'
  | 'server-override'
  | 'catalog'
  | 'cached-catalog'
  | 'compatibility-default';

export type ResponsesSerializedReasoningMode = 'absent' | 'effort';
export type RemoteCapabilityEvidenceSource =
  | 'live-catalog'
  | 'cached-catalog'
  | 'provider-verification';

export interface RemoteParameterSupportEvidence {
  supported: boolean;
  source: RemoteCapabilityEvidenceSource;
  reasoningModes?: ResponsesSerializedReasoningMode[];
}

export interface RemoteResponsesSamplingCapabilities {
  temperature?: RemoteParameterSupportEvidence;
  topP?: RemoteParameterSupportEvidence;
  maxOutputTokens?: RemoteParameterSupportEvidence;
}

export interface RemoteProtocolCapabilities {
  advertisedEndpoints?: RemoteWireApi[];
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsStructuredOutput?: boolean;
  contextLength?: number;
  maxOutputTokens?: number;
  reasoningEffortValues?: string[];
  responsesSampling?: RemoteResponsesSamplingCapabilities;
}

export interface RemoteModelPreference {
  wireApi?: RemoteWireApi;
  vision?: 'auto' | 'on' | 'off';
  generationSettings?: RemoteGenerationSettings;
}

export interface RemoteProtocolResolution {
  wireApi?: RemoteWireApi;
  source: RemoteProtocolSource;
  supported: boolean;
  warning?: 'unknown-support' | 'contradicts-catalog';
}

export type RemoteCatalogProvenance = 'live' | 'cached';
export type RemoteEndpointSupport = 'known' | 'unknown';

export interface NormalizedRemoteCatalogModel {
  capabilities: RemoteProtocolCapabilities;
  endpointSupport: RemoteEndpointSupport;
  provenance: RemoteCatalogProvenance;
}

export interface ResolveRemoteProtocolOptions {
  modelPreference?: RemoteModelPreference;
  apiMode?: RemoteApiMode;
  catalog?: NormalizedRemoteCatalogModel;
}

export function isRemoteWireApi(value: unknown): value is RemoteWireApi {
  return (
    typeof value === 'string' &&
    (REMOTE_WIRE_APIS as readonly string[]).includes(value)
  );
}

export function isRemoteApiMode(value: unknown): value is RemoteApiMode {
  return value === 'auto' || isRemoteWireApi(value);
}

export function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

const VERIFIED_COPILOT_TERRA_RESPONSES_SAMPLING: RemoteResponsesSamplingCapabilities =
  {
    temperature: {
      supported: false,
      source: 'provider-verification',
      reasoningModes: ['absent'],
    },
  };

export interface ResolveResponsesSamplingCapabilitiesOptions {
  serverType?: string;
  modelId: string;
  wireApi?: RemoteWireApi;
  catalogCapabilities?: RemoteProtocolCapabilities;
}

/**
 * Combines explicit catalog claims with narrowly scoped, reproduced provider
 * evidence. Unknown fields stay unknown so callers continue sending them.
 */
export function resolveResponsesSamplingCapabilities({
  serverType,
  modelId,
  wireApi,
  catalogCapabilities,
}: ResolveResponsesSamplingCapabilitiesOptions): RemoteResponsesSamplingCapabilities {
  const verified =
    serverType === 'GitHub Copilot' &&
    modelId === 'gpt-5.6-terra' &&
    wireApi === 'responses'
      ? VERIFIED_COPILOT_TERRA_RESPONSES_SAMPLING
      : undefined;
  const catalog = catalogCapabilities?.responsesSampling;

  return {
    temperature: catalog?.temperature ?? verified?.temperature,
    topP: catalog?.topP ?? verified?.topP,
    maxOutputTokens: catalog?.maxOutputTokens ?? verified?.maxOutputTokens,
  };
}

function catalogSource(
  catalog: NormalizedRemoteCatalogModel,
): RemoteProtocolSource {
  return catalog.provenance === 'cached' ? 'cached-catalog' : 'catalog';
}

function resolveOverride(
  wireApi: RemoteWireApi,
  source: 'model-override' | 'server-override',
  catalog: NormalizedRemoteCatalogModel | undefined,
): RemoteProtocolResolution {
  const contradictsCatalog =
    catalog?.endpointSupport === 'known' &&
    !catalog.capabilities.advertisedEndpoints?.includes(wireApi);

  return {
    wireApi,
    source,
    supported: true,
    ...(contradictsCatalog ? {warning: 'contradicts-catalog' as const} : {}),
  };
}

/**
 * Resolve the wire protocol without consulting model ids, server names or
 * hostnames. Missing `apiMode` is the legacy-compatible Auto setting.
 */
export function resolveRemoteProtocol({
  modelPreference,
  apiMode,
  catalog,
}: ResolveRemoteProtocolOptions): RemoteProtocolResolution {
  const modelOverride = modelPreference?.wireApi;
  if (isRemoteWireApi(modelOverride)) {
    return resolveOverride(modelOverride, 'model-override', catalog);
  }
  if (isRemoteWireApi(apiMode)) {
    return resolveOverride(apiMode, 'server-override', catalog);
  }

  if (catalog?.endpointSupport === 'known') {
    const advertised = catalog.capabilities.advertisedEndpoints ?? [];
    if (advertised.includes('chat-completions')) {
      return {
        wireApi: 'chat-completions',
        source: catalogSource(catalog),
        supported: true,
      };
    }
    if (advertised.includes('responses')) {
      return {
        wireApi: 'responses',
        source: catalogSource(catalog),
        supported: true,
      };
    }
    return {
      source: catalogSource(catalog),
      supported: false,
    };
  }

  return {
    wireApi: 'chat-completions',
    source: 'compatibility-default',
    supported: true,
    warning: 'unknown-support',
  };
}
