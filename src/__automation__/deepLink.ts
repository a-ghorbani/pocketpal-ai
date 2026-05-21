/**
 * E2E-only deep-link dispatcher. Only imported from a __E2E__-gated branch
 * in src/hooks/useDeepLinking.ts, so this module is DCE-stripped in prod.
 *
 * Supported protocols in v1:
 *   pocketpal://memory?cmd=snap::<label>
 *   pocketpal://memory?cmd=clear::snapshots
 *   pocketpal://e2e/benchmark   (Android: cold-launch path lives in
 *                                useDeepLinking.ts since RN's Android side
 *                                doesn't deliver the URL via DeepLinkService)
 */
import type {DeepLinkParams} from '../services/DeepLinkService';
import {
  ROUTES,
  isBenchmarkRunnerUrl,
  parseBenchmarkAutostart,
} from '../utils/navigationConstants';

interface NavigationLike {
  navigate: (route: string, params?: Record<string, unknown>) => void;
}

/** Returns true if handled; false if caller should fall through. */
export async function dispatchAutomationDeepLink(
  params: DeepLinkParams,
  navigation?: NavigationLike,
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
  // pocketpal://e2e/benchmark — bench host. Match against the raw URL via
  // the shared helper so both deep-link sites (this dispatcher and the
  // useDeepLinking cold/warm-launch effect) accept the exact same shape.
  if (isBenchmarkRunnerUrl(params.url)) {
    // Resolve autostart from the same raw URL string via the shared helper —
    // NOT from params.queryParams — so the iOS/DeepLinkService origin and the
    // Android/Linking origin cannot diverge in truthiness.
    navigation?.navigate(ROUTES.BENCHMARK_RUNNER, {
      autostart: parseBenchmarkAutostart(params.url),
    });
    return true;
  }
  return false;
}
