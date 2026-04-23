/**
 * E2E-only deep-link dispatcher. Only imported from a __E2E__-gated branch
 * in src/hooks/useDeepLinking.ts, so this module is DCE-stripped in prod.
 *
 * Supported protocols in v1:
 *   pocketpal://memory?cmd=snap::<label>
 *   pocketpal://memory?cmd=clear::snapshots
 */
import type {DeepLinkParams} from '../services/DeepLinkService';

/** Returns true if handled; false if caller should fall through. */
export async function dispatchAutomationDeepLink(
  params: DeepLinkParams,
): Promise<boolean> {
  if (params.host === 'memory' && params.queryParams?.cmd) {
    const {
      takeMemorySnapshot,
      clearMemorySnapshots,
    } = require('../utils/memoryProfile');
    const cmd = params.queryParams.cmd;
    if (cmd.startsWith('snap::')) {
      const label = cmd.slice(6) || 'unnamed';
      await takeMemorySnapshot(label);
    } else if (cmd === 'clear::snapshots') {
      await clearMemorySnapshots();
    }
    return true;
  }
  return false;
}
