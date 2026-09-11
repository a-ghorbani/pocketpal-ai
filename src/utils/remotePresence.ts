import {RemoteModelPresence, ServerConfig} from './types';

export type SleepState = 'awake' | 'asleep' | 'unknown';

/**
 * The most recent sleep observation for the model this server was last asked
 * about — not a live state, and not a statement about reachability. An
 * observation is never expired here, so a consumer that needs freshness must
 * bound it against `at` itself. Observations made against a different url than
 * the server now carries are ignored, so a url edit reads as unknown.
 */
export function lastObservedSleepState(
  servers: ServerConfig[],
  presence: Record<string, RemoteModelPresence>,
  serverId: string,
): SleepState {
  const server = servers.find(s => s.id === serverId);
  if (!server) {
    return 'unknown';
  }
  const prefix = `${serverId}/`;
  let latest: RemoteModelPresence | undefined;
  for (const [key, entry] of Object.entries(presence)) {
    if (!key.startsWith(prefix) || entry.probedUrl !== server.url) {
      continue;
    }
    if (!latest || entry.at > latest.at) {
      latest = entry;
    }
  }
  if (!latest) {
    return 'unknown';
  }
  return latest.isSleeping ? 'asleep' : 'awake';
}
