/**
 * Shared types for the E2E automation bridge.
 *
 * Kept intentionally small: adapters today are self-contained components
 * with no shared prop surface. This file exists so future adapters that
 * DO need shared types have a home for them.
 */

export type {DeepLinkParams} from '../services/DeepLinkService';
