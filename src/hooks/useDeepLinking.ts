/**
 * useDeepLinking Hook
 *
 * Handles deep link navigation from iOS Shortcuts
 * Must be called from a component inside NavigationContainer
 */

import {useEffect, useCallback} from 'react';
import {Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {deepLinkService, DeepLinkParams} from '../services/DeepLinkService';
import {chatSessionStore, palStore, deepLinkStore} from '../store';
import {ROUTES} from '../utils/navigationConstants';

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

  const handleDeepLink = useCallback(
    async (params: DeepLinkParams) => {
      console.log('Handling deep link:', params);

      // Handle chat deep links
      if (params.host === 'chat' && params.queryParams) {
        const {palId, palName, message} = params.queryParams;

        if (palId) {
          await handleChatDeepLink(palId, palName, message);
        }
      }
    },
    [handleChatDeepLink],
  );

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
