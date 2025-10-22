/**
 * DeepLinkService
 *
 * Handles deep links from iOS Shortcuts and other sources
 */

import {NativeModules, NativeEventEmitter, Platform} from 'react-native';

const {DeepLinkModule} = NativeModules;

export interface DeepLinkParams {
  url: string;
  scheme: string;
  host: string;
  queryParams?: {
    palId?: string;
    palName?: string;
    message?: string;
    [key: string]: string | undefined;
  };
}

export type DeepLinkHandler = (params: DeepLinkParams) => void;

class DeepLinkService {
  private eventEmitter: NativeEventEmitter | null = null;
  private listeners: DeepLinkHandler[] = [];
  private subscription: any = null;

  constructor() {
    if (Platform.OS === 'ios' && DeepLinkModule) {
      this.eventEmitter = new NativeEventEmitter(DeepLinkModule);
    }
  }

  /**
   * Initialize the deep link service and start listening for deep links
   */
  initialize() {
    if (!this.eventEmitter) {
      return;
    }

    // Cleanup existing subscription first to prevent duplicates
    // This can happen during hot reload or if initialize() is called multiple times
    if (this.subscription) {
      console.log(
        'DeepLinkService: Cleaning up existing subscription before re-initializing',
      );
      this.subscription.remove();
      this.subscription = null;
    }

    // Listen for deep link events
    this.subscription = this.eventEmitter.addListener(
      'onDeepLink',
      (params: DeepLinkParams) => {
        console.log('Deep link received:', params);
        this.notifyListeners(params);
      },
    );

    // Check for initial URL (app opened via deep link)
    this.checkInitialURL();
  }

  /**
   * Clean up listeners
   */
  cleanup() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.listeners = [];
  }

  /**
   * Add a deep link handler
   */
  addListener(handler: DeepLinkHandler) {
    this.listeners.push(handler);

    // Return a function to remove the listener
    return () => {
      this.listeners = this.listeners.filter(h => h !== handler);
    };
  }

  /**
   * Check if app was opened via deep link
   */
  private async checkInitialURL() {
    if (!DeepLinkModule) {
      return;
    }

    try {
      const url = await DeepLinkModule.getInitialURL();
      if (url) {
        // Parse the URL and notify listeners
        const params = this.parseURL(url);
        if (params) {
          this.notifyListeners(params);
        }
      }
    } catch (error) {
      console.error('Error getting initial URL:', error);
    }
  }

  /**
   * Parse a URL string into DeepLinkParams
   */
  private parseURL(urlString: string): DeepLinkParams | null {
    try {
      const url = new URL(urlString);
      const queryParams: {[key: string]: string} = {};

      url.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      return {
        url: urlString,
        scheme: url.protocol.replace(':', ''),
        host: url.hostname,
        queryParams,
      };
    } catch (error) {
      console.error('Error parsing URL:', error);
      return null;
    }
  }

  /**
   * Notify all registered listeners
   */
  private notifyListeners(params: DeepLinkParams) {
    this.listeners.forEach(handler => {
      try {
        handler(params);
      } catch (error) {
        console.error('Error in deep link handler:', error);
      }
    });
  }
}

export const deepLinkService = new DeepLinkService();
