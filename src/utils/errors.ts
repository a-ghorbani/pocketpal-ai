/**
 * Error classes for better error handling throughout the application
 */

import axios from 'axios';
import {uiStore} from '../store/UIStore';
/**
 * NetworkError - Used for connectivity-related errors
 * Examples: No internet connection, timeout, etc.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * AppCheckError - Used for Firebase App Check verification errors
 * Examples: App not installed from official store, verification failed, etc.
 */
export class AppCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppCheckError';
  }
}

/**
 * ServerError - Used for backend server errors
 * Examples: 500 errors, API unavailable, etc.
 */
export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerError';
  }
}

/**
 * Standardized error state interface for consistent error handling across the app
 */
export interface ErrorState {
  code:
    | 'authentication'
    | 'authorization'
    | 'network'
    | 'storage'
    | 'server'
    | 'multimodal'
    | 'unknown';
  service?: 'huggingface' | 'firebase' | 'localapi' | 'oci';
  message: string;
  context: 'search' | 'download' | 'modelDetails' | 'chat';
  recoverable: boolean;
  severity?: 'error' | 'warning';
  metadata?: {
    modelId?: string;
    [key: string]: any;
  };
}

/**
 * Helper function to create a standardized error state from any error
 */
export function createErrorState(
  error: unknown,
  context: ErrorState['context'],
  service?: ErrorState['service'],
  metadata?: ErrorState['metadata'],
  severity: ErrorState['severity'] = 'error',
): ErrorState {
  const l10nObject = uiStore.l10n;
  let code: ErrorState['code'] = 'unknown';
  let message = l10nObject.errors.unexpectedError;
  let recoverable = true;
  let errorService = service;

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;

    // Check URL to determine service if not explicitly provided
    if (!errorService) {
      const url = error.config?.url || '';
      if (url.includes('huggingface.co') || url.includes('hf.co')) {
        errorService = 'huggingface';
      }
    }

    if (statusCode === 401) {
      code = 'authentication';
      message =
        errorService === 'huggingface'
          ? context === 'search'
            ? l10nObject.errors.hfAuthenticationErrorSearch
            : l10nObject.errors.hfAuthenticationError
          : l10nObject.errors.authenticationError;
    } else if (statusCode === 403) {
      code = 'authorization';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfAuthorizationError
          : l10nObject.errors.authorizationError;
    } else if (statusCode && statusCode >= 500) {
      code = 'server';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfServerError
          : l10nObject.errors.serverError;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      code = 'network';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfNetworkTimeout
          : l10nObject.errors.networkTimeout;
    } else if (error.code === 'ERR_NETWORK') {
      code = 'network';
      message =
        errorService === 'huggingface'
          ? l10nObject.errors.hfNetworkError
          : l10nObject.errors.networkError;
    }
  } else if (error instanceof NetworkError) {
    code = 'network';
    message = error.message;
  } else if (error instanceof ServerError) {
    code = 'server';
    message = error.message;
  } else if (error instanceof Error) {
    // Handle error messages containing HTTP status codes (e.g., 'Client error: 403')
    if (typeof error.message === 'string') {
      const statusCodeMatch = error.message.match(
        /(?:Client error:|status:?)\s*(\d{3})/i,
      );
      if (statusCodeMatch) {
        const statusCode = parseInt(statusCodeMatch[1], 10);

        if (statusCode === 401) {
          code = 'authentication';
          message =
            errorService === 'huggingface'
              ? l10nObject.errors.hfAuthenticationError
              : l10nObject.errors.authenticationError;
        } else if (statusCode === 403) {
          code = 'authorization';
          message =
            errorService === 'huggingface'
              ? l10nObject.errors.hfAuthorizationError
              : l10nObject.errors.authorizationError;
        } else if (statusCode >= 500) {
          code = 'server';
          message =
            errorService === 'huggingface'
              ? l10nObject.errors.hfServerError
              : l10nObject.errors.serverError;
        }
      } else if (
        error.message.includes('storage') ||
        error.message.includes('space')
      ) {
        code = 'storage';
        message = error.message;
      } else {
        message = error.message;
      }
    } else {
      message = error.message;
    }
  }

  return {
    code,
    service: errorService,
    message,
    context,
    recoverable,
    severity,
    metadata,
  };
}

/**
 * Helper function to create a multimodal warning state
 */
export function createMultimodalWarning(
  message: string,
  context: ErrorState['context'] = 'chat',
): ErrorState {
  return {
    code: 'multimodal',
    message,
    context,
    recoverable: false,
    severity: 'warning',
  };
}
