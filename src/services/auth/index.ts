/**
 * Authentication Services - Barrel Export
 *
 * Exports all authentication-related modules.
 *
 * @phase Phase 1 - Auth Module Entry Point
 */

// Interface
export * from './IAuthService';

// Implementations
export { MockAuthService } from './MockAuthService';
export { getMockAuthService } from './MockAuthService';

// Factory
export { AuthServiceFactory, authService } from './AuthServiceFactory';
export type { AuthServiceType, AuthServiceFactoryConfig } from './AuthServiceFactory';
