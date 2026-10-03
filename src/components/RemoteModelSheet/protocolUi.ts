import type {
  RemoteApiMode,
  RemoteProtocolResolution,
  RemoteProtocolSource,
  RemoteWireApi,
} from '../../utils/remoteProtocol';

export const API_MODE_VALUES: RemoteApiMode[] = [
  'auto',
  'chat-completions',
  'responses',
];

export const MODEL_API_MODE_VALUES = [
  'inherit',
  'chat-completions',
  'responses',
] as const;

export type ModelApiMode = (typeof MODEL_API_MODE_VALUES)[number];

export function protocolLabel(
  wireApi: RemoteWireApi | undefined,
  labels: {chatCompletions: string; responses: string; unsupported: string},
): string {
  if (wireApi === 'chat-completions') {
    return labels.chatCompletions;
  }
  if (wireApi === 'responses') {
    return labels.responses;
  }
  return labels.unsupported;
}

export function protocolSourceLabel(
  source: RemoteProtocolSource,
  labels: {
    modelOverride: string;
    serverOverride: string;
    liveCatalog: string;
    cachedCatalog: string;
    compatibilityDefault: string;
  },
): string {
  switch (source) {
    case 'model-override':
      return labels.modelOverride;
    case 'server-override':
      return labels.serverOverride;
    case 'catalog':
      return labels.liveCatalog;
    case 'cached-catalog':
      return labels.cachedCatalog;
    default:
      return labels.compatibilityDefault;
  }
}

export function protocolWarningKey(
  resolution: RemoteProtocolResolution,
): 'unsupported' | 'contradiction' | 'unknown' | undefined {
  if (!resolution.supported) {
    return 'unsupported';
  }
  if (resolution.warning === 'contradicts-catalog') {
    return 'contradiction';
  }
  if (resolution.warning === 'unknown-support') {
    return 'unknown';
  }
  return undefined;
}
