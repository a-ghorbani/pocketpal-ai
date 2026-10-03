import type {RemoteGenerationSettings} from '../../utils/completionTypes';
import type {
  NormalizedRemoteCatalogModel,
  RemoteModelPreference,
} from '../../utils/remoteProtocol';
import type {ServerConfig} from '../../utils/types';

export interface CachedRemoteCatalogModel extends NormalizedRemoteCatalogModel {
  serverId: string;
  normalizedUrl: string;
  serverType?: string;
  credentialRevision: number;
}

export const normalizeServerUrl = (url: string): string =>
  url.replace(/\/+$/, '');

export const credentialRevisionOf = (server: ServerConfig): number =>
  Number.isSafeInteger(server.credentialRevision) &&
  (server.credentialRevision ?? -1) >= 0
    ? server.credentialRevision!
    : 0;

export function dropServerEntries<T>(
  map: Record<string, T>,
  serverId: string,
): Record<string, T> {
  const prefix = `${serverId}/`;
  return Object.fromEntries(
    Object.entries(map).filter(([key]) => !key.startsWith(prefix)),
  );
}

export function dropEntry<T>(
  map: Record<string, T>,
  key: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(map).filter(([entryKey]) => entryKey !== key),
  );
}

export function cloneRemoteGenerationSettings(
  settings: RemoteGenerationSettings,
): RemoteGenerationSettings {
  return {
    ...settings,
    stop: settings.stop ? [...settings.stop] : settings.stop,
    reasoning: settings.reasoning ? {...settings.reasoning} : undefined,
    generationParameterModes: settings.generationParameterModes
      ? {...settings.generationParameterModes}
      : undefined,
  };
}

export function withoutGenerationSettings(
  preference: RemoteModelPreference,
): RemoteModelPreference | undefined {
  const remaining = {...preference};
  delete remaining.generationSettings;
  return Object.keys(remaining).length > 0 ? remaining : undefined;
}
