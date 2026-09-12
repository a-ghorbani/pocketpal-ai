import {serverStore} from '../../store';

/**
 * Every read of a surface another piece of work owns goes through here, so
 * this sheet has one place to change when those surfaces land and none of its
 * rendering depends on whether they exist yet.
 *
 * The presence union is declared here for the same reason: when the owning
 * type lands, this file imports it and the exhaustive switch below fails to
 * compile against any member that is added or removed, rather than silently
 * absorbing it into an existing branch.
 */
export type ServerPresence = 'unknown' | 'reachable' | 'asleep' | 'unreachable';

type SiblingSurfaces = {
  favouriteModelIds?: string[];
  lastUsedModelId?: string;
  serverPresence?: (serverId: string) => ServerPresence;
  toggleFavourite?: (serverId: string, remoteModelId: string) => void;
};

const surfaces = serverStore as unknown as SiblingSurfaces;

export function serverFavouriteModelIds(): string[] {
  return surfaces.favouriteModelIds ?? [];
}

/**
 * The server-scoped last-used remote model. Deliberately not
 * `ModelStore.lastUsedModelId`, which is a persisted local-model value that
 * remote activation refuses to set.
 */
export function serverLastUsedRemoteModelId(): string | undefined {
  return surfaces.lastUsedModelId;
}

/**
 * Absent means nobody has probed, which renders exactly as reachable. Only a
 * definite offline collapses the list, so "I have not been told" can never
 * become a claim that the server is down.
 */
export function serverPresence(serverId: string): ServerPresence {
  return surfaces.serverPresence?.(serverId) ?? 'unknown';
}

export function isServerOffline(serverId: string): boolean {
  switch (serverPresence(serverId)) {
    case 'unreachable':
      return true;
    case 'unknown':
    case 'reachable':
    case 'asleep':
      return false;
  }
}

export function canToggleFavourite(): boolean {
  return typeof surfaces.toggleFavourite === 'function';
}

export function toggleFavourite(serverId: string, remoteModelId: string): void {
  surfaces.toggleFavourite?.(serverId, remoteModelId);
}
