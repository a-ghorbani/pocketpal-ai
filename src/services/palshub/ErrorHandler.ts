import {AxiosError} from 'axios';

import {PalsHubError} from './PalsHubService';

import type {PalsHubErrorResponse} from '../../types/palshub';

export interface ErrorInfo {
  type: 'network' | 'auth' | 'rate_limit' | 'validation' | 'server' | 'unknown';
  message: string;
  userMessage: string;
  statusCode?: number;
  retryable: boolean;
  retryAfter?: number; // seconds
  details?: unknown;
}

export class PalsHubErrorHandler {
  static handle(error: unknown): ErrorInfo {
    // Handle PalsHub API errors
    if (error instanceof PalsHubError) {
      return this.handlePalsHubError(error);
    }

    // Handle Axios errors
    if (error instanceof AxiosError) {
      return this.handleAxiosError(error);
    }

    // Handle generic errors
    if (error instanceof Error) {
      return {
        type: 'unknown',
        message: error.message,
        userMessage: 'An unexpected error occurred. Please try again.',
        retryable: true,
      };
    }

    // Handle unknown error types
    return {
      type: 'unknown',
      message: 'Unknown error occurred',
      userMessage: 'An unexpected error occurred. Please try again.',
      retryable: true,
    };
  }

  private static handlePalsHubError(error: PalsHubError): ErrorInfo {
    // PalsHubError doesn't have statusCode, use simple error handling
    return {
      type: 'unknown',
      message: error.message,
      userMessage: error.message || 'An error occurred with PalsHub.',
      retryable: false,
    };
  }

  private static handleAxiosError(
    error: AxiosError<PalsHubErrorResponse>,
  ): ErrorInfo {
    // Network errors (no response)
    if (!error.response) {
      if (error.code === 'ECONNABORTED') {
        return {
          type: 'network',
          message: 'Request timeout',
          userMessage:
            'Request timed out. Please check your connection and try again.',
          retryable: true,
        };
      }

      return {
        type: 'network',
        message: error.message,
        userMessage:
          'Network error. Please check your connection and try again.',
        retryable: true,
      };
    }

    // Server responded with error status
    const statusCode = error.response.status;
    const responseData = error.response.data;

    return {
      type: this.getErrorTypeFromStatus(statusCode),
      message: responseData?.message || responseData?.error || error.message,
      userMessage: this.getUserMessageFromStatus(statusCode),
      statusCode,
      retryable: this.isRetryableStatus(statusCode),
      details: responseData?.details,
    };
  }

  private static getErrorTypeFromStatus(statusCode: number): ErrorInfo['type'] {
    if (statusCode === 401 || statusCode === 403) {
      return 'auth';
    }
    if (statusCode === 429) {
      return 'rate_limit';
    }
    if (statusCode >= 400 && statusCode < 500) {
      return 'validation';
    }
    if (statusCode >= 500) {
      return 'server';
    }
    return 'unknown';
  }

  private static getUserMessageFromStatus(statusCode: number): string {
    switch (statusCode) {
      case 401:
        return 'Please sign in to access this feature.';
      case 403:
        return "You don't have permission to access this content.";
      case 404:
        return 'The requested content was not found.';
      case 429:
        return 'Too many requests. Please wait a moment before trying again.';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'Server error. Please try again later.';
      default:
        return 'An error occurred. Please try again.';
    }
  }

  private static isRetryableStatus(statusCode: number): boolean {
    // Retryable: server errors, rate limiting, timeouts
    return statusCode >= 500 || statusCode === 429 || statusCode === 408;
  }

  private static extractRetryAfter(details: unknown): number | undefined {
    if (
      typeof details === 'object' &&
      details !== null &&
      'retry_after' in details
    ) {
      const retryAfter = (details as any).retry_after;
      return typeof retryAfter === 'number' ? retryAfter : undefined;
    }
    return undefined;
  }

  // Helper method to determine if an error should trigger offline mode
  static shouldTriggerOfflineMode(error: ErrorInfo): boolean {
    return (
      error.type === 'network' ||
      (error.type === 'server' && error.statusCode === 503)
    );
  }

  // Helper method to get retry delay based on error type
  static getRetryDelay(error: ErrorInfo, attemptNumber: number): number {
    if (!error.retryable) {
      return 0;
    }

    if (error.retryAfter) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }

    // Exponential backoff for retryable errors
    const baseDelay = error.type === 'rate_limit' ? 5000 : 1000;
    return Math.min(baseDelay * Math.pow(2, attemptNumber - 1), 30000); // Max 30 seconds
  }

  // Helper method to format error for user display
  static formatForUser(error: ErrorInfo): string {
    let message = error.userMessage;

    if (error.type === 'rate_limit' && error.retryAfter) {
      message += ` (${error.retryAfter}s)`;
    }

    return message;
  }

  // Helper method to check if error indicates authentication is required
  static requiresAuthentication(error: ErrorInfo): boolean {
    return error.type === 'auth' && error.statusCode === 401;
  }

  // Helper method to check if error indicates insufficient permissions
  static insufficientPermissions(error: ErrorInfo): boolean {
    return error.type === 'auth' && error.statusCode === 403;
  }
}

// Retry utility with exponential backoff
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
    onError?: (error: ErrorInfo, attempt: number) => void,
  ): Promise<T> {
    let lastError: ErrorInfo | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = PalsHubErrorHandler.handle(error);

        if (onError) {
          onError(lastError, attempt);
        }

        // Don't retry if error is not retryable or this is the last attempt
        if (!lastError.retryable || attempt === maxAttempts) {
          throw error;
        }

        // Wait before retrying
        const delay = PalsHubErrorHandler.getRetryDelay(lastError, attempt);
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error(lastError?.message || 'Max retry attempts exceeded');
  }
}
