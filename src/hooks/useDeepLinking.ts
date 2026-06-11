/**
 * useDeepLinking Hook
 *
 * Handles deep link navigation from iOS Shortcuts
 * Must be called from a component inside NavigationContainer
 */

import {useEffect, useCallback} from 'react';
import {Alert, Linking} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {deepLinkService, DeepLinkParams} from '../services/DeepLinkService';
import {isHubLink, parseHubRunURL} from '../services/hubRunLink';
import {chatSessionStore, palStore, deepLinkStore, uiStore} from '../store';
import {ROUTES} from '../utils/navigationConstants';
import {
  isBenchmarkRunnerUrl,
  parseBenchmarkAutostart,
} from '../__automation__/benchmarkRoute';

/**
 * Hook for handling deep link navigation
 * Call this once in a component inside NavigationContainer
 */
export const useDeepLinking = () => {
  const navigation = useNavigation();

  const handleChatDeepLink = useCallback(
    async (palId: string, palName?: string, message?: string) => {
      try {
        // Find the pal
        const pal = palStore.pals.find(p => p.id === palId);

        if (!pal) {
          console.error(`Pal not found: ${palId} (${palName})`);

          // Show user-friendly error message
          Alert.alert(
            'Pal Not Found',
            `The pal "${palName || palId}" could not be found. It may have been deleted or is not available on this device.`,
            [{text: 'OK'}],
          );
          return;
        }

        // Store message to prefill if provided
        if (message) {
          deepLinkStore.setPendingMessage(message);
        }

        // Set the pal as active
        await chatSessionStore.setActivePal(pal.id);

        // Navigate to chat screen with proper typing
        (navigation as any).navigate(ROUTES.CHAT);
      } catch (error) {
        console.error('Error handling chat deep link:', error);

        // Show user-friendly error message
        Alert.alert(
          'Error Opening Chat',
          'An error occurred while trying to open the chat. Please try again.',
          [{text: 'OK'}],
        );
      }
    },
    [navigation],
  );

  // Validates a raw hub/run URL and, if valid, parks it for the sheet host to
  // present. Shared by the iOS native-emitter and Android prod Linking paths.
  // An invalid link surfaces a message and writes nothing (validation precedes
  // side effects).
  const handleHubRunLink = useCallback((url: string) => {
    const request = parseHubRunURL(url);
    if (!request) {
      Alert.alert(
        uiStore.l10n.models.hubRun.invalidLinkTitle,
        uiStore.l10n.models.hubRun.invalidLinkMessage,
        [{text: uiStore.l10n.common.ok}],
      );
      return;
    }
    deepLinkStore.setPendingHubRun(request);
  }, []);

  const handleDeepLink = useCallback(
    async (params: DeepLinkParams) => {
      console.log('Handling deep link:', params);

      // Automation-bridge dispatch (E2E-only). DCE-stripped in prod because
      // __E2E__ inlines to false and the require() inside the gate is never
      // reached. See src/__automation__/deepLink.ts.
      if (__E2E__) {
        const {dispatchAutomationDeepLink} = require('../__automation__');
        if (await dispatchAutomationDeepLink(params, navigation)) {
          return;
        }
      }

      // Handle chat deep links
      if (params.host === 'chat' && params.queryParams) {
        const {palId, palName, message} = params.queryParams;

        if (palId) {
          await handleChatDeepLink(palId, palName, message);
        }
      }

      // Handle hub/run download deep links (iOS native-emitter path). Only the
      // exact hub/run route is handled; unknown hub paths are ignored silently,
      // matching the prod Linking path.
      if (isHubLink(params.url)) {
        handleHubRunLink(params.url);
      }
    },
    [handleChatDeepLink, handleHubRunLink, navigation],
  );

  // E2E-only routing for the BenchmarkRunnerScreen. Two paths:
  //   1. Cold launch — Linking.getInitialURL() reads the launching intent's
  //      data URI; no MainActivity onNewIntent override needed.
  //   2. Warm launch — WDIO's `mobile: deepLink` driver command delivers the
  //      URL after the app has already started (fullReset re-installs the
  //      APK but the activity is launched before the test sends the deep
  //      link), so Android routes it as a warm 'url' event. Without the
  //      addEventListener path, the spec's `bench-run-button` wait would
  //      hang because the runner screen never mounts.
  // The whole effect is gated by __E2E__; in prod, the body is unreachable
  // and DCE-stripped by Hermes.
  useEffect(() => {
    if (!__E2E__) {
      return;
    }
    const routeIfBench = (url: string | null) => {
      if (isBenchmarkRunnerUrl(url)) {
        // Resolve autostart from the same raw URL the gate matched, via the
        // shared helper, so cold-launch (getInitialURL) and warm-launch
        // ('url' event) deliveries — and the iOS dispatchAutomationDeepLink
        // path — cannot diverge in truthiness. A bare bench URL resolves
        // false, so the screen stays idle exactly as before.
        (navigation as any).navigate(ROUTES.BENCHMARK_RUNNER, {
          autostart: parseBenchmarkAutostart(url),
        });
      }
    };
    Linking.getInitialURL()
      .then(routeIfBench)
      .catch(() => {
        // getInitialURL rejects on some surfaces; warm-state listener still
        // covers WDIO's deepLink command.
      });
    // Defensive: addEventListener is at the RN native bridge edge. If it
    // ever throws synchronously the cold-launch path above already ran, so
    // we contain the error and skip the cleanup return rather than tearing
    // down the rest of the hook's lifecycle.
    let sub: {remove: () => void} | null = null;
    try {
      sub = Linking.addEventListener('url', ({url}) => routeIfBench(url));
    } catch {
      sub = null;
    }
    return () => {
      sub?.remove();
    };
  }, [navigation]);

  useEffect(() => {
    // Initialize deep link service
    deepLinkService.initialize();

    // Add deep link handler
    const removeListener = deepLinkService.addListener(handleDeepLink);

    // Cleanup on unmount
    return () => {
      removeListener();
      deepLinkService.cleanup();
    };
  }, [handleDeepLink]);

  // Prod, always-on delivery for the hub/run route. iOS arrives via the native
  // emitter above; Android prod has no native deep-link bridge, so this RN
  // Linking path (cold getInitialURL + warm 'url' event) is the only delivery.
  // Gated by isHubLink so non-hub URLs (chat, e2e/benchmark, memory) and unknown
  // hub paths are ignored silently — only the exact hub/run route reaches
  // handleHubRunLink, matching the native emitter path. A malformed hub/run
  // payload still alerts.
  useEffect(() => {
    Linking.getInitialURL()
      .then(url => {
        if (url && isHubLink(url)) {
          handleHubRunLink(url);
        }
      })
      .catch(() => {
        // getInitialURL rejects on some surfaces; the warm listener still runs.
      });

    // addEventListener is at the RN native bridge edge; contain a synchronous
    // throw so it can't tear down the rest of the hook's lifecycle.
    let sub: {remove: () => void} | null = null;
    try {
      sub = Linking.addEventListener('url', ({url}) => {
        if (url && isHubLink(url)) {
          handleHubRunLink(url);
        }
      });
    } catch {
      sub = null;
    }

    return () => {
      sub?.remove();
    };
  }, [handleHubRunLink]);
};

/**
 * Hook for the hub/run landing-sheet host. Reads the parked request and clears
 * it once the sheet is dismissed (single-writer clear / consumed-once).
 */
export const useHubRunSheet = () => {
  return {
    pendingHubRun: deepLinkStore.pendingHubRun,
    clearPendingHubRun: () => {
      deepLinkStore.clearPendingHubRun();
    },
  };
};

/**
 * Hook for accessing pending message state
 * Can be called from any component (doesn't require navigation)
 */
export const usePendingMessage = () => {
  return {
    pendingMessage: deepLinkStore.pendingMessage,
    clearPendingMessage: () => {
      deepLinkStore.clearPendingMessage();
    },
  };
};
