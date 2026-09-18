import type {ServerType} from '../../utils/serverTypes';
import type {RemoteModelInfo} from '../../utils/types';
import {normalizeUrl} from '../http';

const DETECT_TIMEOUT_MS = 5000;

/**
 * Detect server type from response headers and model metadata.
 * Checks (cheapest first):
 * 1. Server header === 'llama.cpp'
 * 2. Any model owned_by === 'organization_owner' → LM Studio
 * 3. GET / body === 'Ollama is running' → Ollama
 * 4. Unknown → undefined
 */
export async function detectServerType(
  serverUrl: string,
  models: RemoteModelInfo[],
  headers: Record<string, string>,
): Promise<ServerType | undefined> {
  // 1. llama.cpp sets a Server header
  const serverHeader = headers.server || headers.Server || '';
  if (serverHeader === 'llama.cpp') {
    return 'llama.cpp';
  }

  // 2. LM Studio sets owned_by to 'organization_owner'
  if (models.some(m => m.owned_by === 'organization_owner')) {
    return 'LM Studio';
  }

  // 3. Ollama responds with 'Ollama is running' at GET /
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
    try {
      const response = await fetch(normalizeUrl(serverUrl), {
        method: 'GET',
        signal: controller.signal,
      });
      const body = await response.text();
      if (body.trim() === 'Ollama is running') {
        return 'Ollama';
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Probe failed — not Ollama
  }

  return undefined;
}
