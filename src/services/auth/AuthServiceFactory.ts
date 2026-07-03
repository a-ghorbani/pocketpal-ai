/**
 * Authentication Service Factory
 *
 * Creates the appropriate authentication service based on configuration.
 * In Phase 1, defaults to MockAuthService.
 * When Firebase is configured, can switch to FirebaseAuthService.
 *
 * @phase Phase 1 - Service Factory
 */

import { IAuthService } from './IAuthService';
import { MockAuthService } from './MockAuthService';
import { getMockAuthService } from './MockAuthService';
import { FirebaseAuthService, getFirebaseAuthService } from './FirebaseAuthService';
import { isFirebaseConfigured } from '../../../firebase.config';

export type AuthServiceType = 'mock' | 'firebase';

interface AuthServiceFactoryConfig {
  /**
   * Force a specific service type
   * If not set, auto-detects based on Firebase configuration
   */
  forceType?: AuthServiceType;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * AuthServiceFactory - Creates authentication service instances
 *
 * Usage:
 * ```typescript
 * const authService = AuthServiceFactory.create();
 * ```
 */
export class AuthServiceFactory {
  private static instance: IAuthService | null = null;
  private static config: AuthServiceFactoryConfig = {
    debug: false,
  };

  /**
   * Configure the factory
   * @param config - Factory configuration
   */
  static configure(config: AuthServiceFactoryConfig): void {
    AuthServiceFactory.config = { ...AuthServiceFactory.config, ...config };
  }

  /**
   * Determine which service type to use
   */
  private static getServiceType(): AuthServiceType {
    if (AuthServiceFactory.config.forceType) {
      return AuthServiceFactory.config.forceType;
    }

    // In Phase 1, always use mock if Firebase not configured
    if (!isFirebaseConfigured()) {
      return 'mock';
    }

    return 'firebase';
  }

  /**
   * Create or get the authentication service instance
   * Uses singleton pattern to ensure only one instance exists
   *
   * @returns IAuthService - The authentication service
   */
  static create(): IAuthService {
    const serviceType = AuthServiceFactory.getServiceType();

    if (AuthServiceFactory.instance) {
      // Check if we need to switch service type
      const currentIsMock = AuthServiceFactory.instance instanceof MockAuthService;
      const shouldBeMock = serviceType === 'mock';

      if (currentIsMock === shouldBeMock) {
        return AuthServiceFactory.instance;
      }

      // Service type changed, create new instance
      console.log(`[AuthFactory] Switching auth service type to: ${serviceType}`);
    }

    if (serviceType === 'mock') {
      if (AuthServiceFactory.config.debug) {
        console.log('[AuthFactory] Creating MockAuthService');
      }
      AuthServiceFactory.instance = getMockAuthService();
    } else {
      if (AuthServiceFactory.config.debug) {
        console.log('[AuthFactory] Creating FirebaseAuthService');
      }
      AuthServiceFactory.instance = getFirebaseAuthService();
    }

    return AuthServiceFactory.instance;
  }

  /**
   * Reset the singleton instance
   * Useful for testing or switching configurations
   */
  static reset(): void {
    AuthServiceFactory.instance = null;
  }

  /**
   * Get the current service type
   */
  static getCurrentServiceType(): AuthServiceType {
    return AuthServiceFactory.getServiceType();
  }
}

// Convenience export - default service instance
export const authService = AuthServiceFactory.create();

export default AuthServiceFactory;
