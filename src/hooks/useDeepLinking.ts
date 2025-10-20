/**
 * useDeepLinking Hook
 *
 * Handles deep link navigation from iOS Shortcuts
 * Must be called from a component inside NavigationContainer
 */

import {useEffect, useState, useCallback} from 'react';
import {useNavigation} from '@react-navigation/native';
import {deepLinkService, DeepLinkParams} from '../services/DeepLinkService';
import {chatSessionStore, palStore} from '../store';
import {ROUTES} from '../utils/navigationConstants';

// Shared state for pending message (accessible from any component)
let pendingMessage: string | null = null;
const messageListeners: Array<(message: string | null) => void> = [];

const setPendingMessage = (message: string | null) => {
  pendingMessage = message;
  messageListeners.forEach(listener => listener(message));
};

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
          // TODO: Show error to user
          return;
        }

        // Store message to prefill if provided
        if (message) {
          setPendingMessage(message);
        }

        // Set the pal as active
        await chatSessionStore.setActivePal(pal.id);

        // Navigate to chat screen
        (navigation as any).navigate(ROUTES.CHAT);
      } catch (error) {
        console.error('Error handling chat deep link:', error);
        // TODO: Show error to user
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
  const [message, setMessage] = useState<string | null>(pendingMessage);

  useEffect(() => {
    // Subscribe to message changes
    const listener = (newMessage: string | null) => {
      setMessage(newMessage);
    };
    messageListeners.push(listener);

    // Cleanup
    return () => {
      const index = messageListeners.indexOf(listener);
      if (index > -1) {
        messageListeners.splice(index, 1);
      }
    };
  }, []);

  return {
    pendingMessage: message,
    clearPendingMessage: () => {
      setPendingMessage(null);
    },
  };
};
