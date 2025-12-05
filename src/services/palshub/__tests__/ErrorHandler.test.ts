import {AxiosError} from 'axios';
import {PalsHubErrorHandler, RetryHandler} from '../ErrorHandler';
import {PalsHubError} from '../PalsHubService';

describe('PalsHubErrorHandler', () => {
  describe('handle', () => {
    it('should handle PalsHubError', () => {
      const error = new PalsHubError('Test error', {code: 'TEST'});

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Test error');
      expect(result.userMessage).toBe('Test error');
      expect(result.retryable).toBe(false);
    });

    it('should handle generic Error', () => {
      const error = new Error('Generic error');

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Generic error');
      expect(result.userMessage).toBe(
        'An unexpected error occurred. Please try again.',
      );
      expect(result.retryable).toBe(true);
    });

    it('should handle unknown error types', () => {
      const error = 'string error';

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Unknown error occurred');
      expect(result.userMessage).toBe(
        'An unexpected error occurred. Please try again.',
      );
      expect(result.retryable).toBe(true);
    });

    it('should handle network timeout error', () => {
      const error = new AxiosError('Timeout');
      error.code = 'ECONNABORTED';

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('network');
      expect(result.message).toBe('Request timeout');
      expect(result.userMessage).toContain('timed out');
      expect(result.retryable).toBe(true);
    });

    it('should handle network error without response', () => {
      const error = new AxiosError('Network Error');

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('network');
      expect(result.userMessage).toContain('Network error');
      expect(result.retryable).toBe(true);
    });

    it('should handle 401 authentication error', () => {
      const error = new AxiosError('Unauthorized');
      error.response = {
        status: 401,
        data: {message: 'Unauthorized'},
        statusText: 'Unauthorized',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('auth');
      expect(result.statusCode).toBe(401);
      expect(result.retryable).toBe(false);
    });

    it('should handle 403 forbidden error', () => {
      const error = new AxiosError('Forbidden');
      error.response = {
        status: 403,
        data: {message: 'Forbidden'},
        statusText: 'Forbidden',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('auth');
      expect(result.statusCode).toBe(403);
      expect(result.retryable).toBe(false);
    });

    it('should handle 429 rate limit error', () => {
      const error = new AxiosError('Too Many Requests');
      error.response = {
        status: 429,
        data: {message: 'Rate limit exceeded'},
        statusText: 'Too Many Requests',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('rate_limit');
      expect(result.statusCode).toBe(429);
      expect(result.retryable).toBe(true);
    });

    it('should handle 400 validation error', () => {
      const error = new AxiosError('Bad Request');
      error.response = {
        status: 400,
        data: {message: 'Invalid input'},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('validation');
      expect(result.statusCode).toBe(400);
      expect(result.retryable).toBe(false);
    });

    it('should handle 422 validation error', () => {
      const error = new AxiosError('Unprocessable Entity');
      error.response = {
        status: 422,
        data: {message: 'Validation failed'},
        statusText: 'Unprocessable Entity',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('validation');
      expect(result.statusCode).toBe(422);
      expect(result.retryable).toBe(false);
    });

    it('should handle 500 server error', () => {
      const error = new AxiosError('Internal Server Error');
      error.response = {
        status: 500,
        data: {message: 'Server error'},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('server');
      expect(result.statusCode).toBe(500);
      expect(result.retryable).toBe(true);
    });

    it('should handle 503 service unavailable error', () => {
      const error = new AxiosError('Service Unavailable');
      error.response = {
        status: 503,
        data: {message: 'Service unavailable'},
        statusText: 'Service Unavailable',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.type).toBe('server');
      expect(result.statusCode).toBe(503);
      expect(result.retryable).toBe(true);
    });

    it('should extract error message from response data', () => {
      const error = new AxiosError('Error');
      error.response = {
        status: 400,
        data: {message: 'Custom error message'},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.message).toBe('Custom error message');
    });

    it('should extract error from response data when message is not available', () => {
      const error = new AxiosError('Error');
      error.response = {
        status: 400,
        data: {error: 'Error from error field'},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.message).toBe('Error from error field');
    });

    it('should include error details when available', () => {
      const error = new AxiosError('Error');
      error.response = {
        status: 400,
        data: {
          message: 'Validation error',
          details: {field: 'email', issue: 'invalid format'},
        },
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      const result = PalsHubErrorHandler.handle(error);

      expect(result.details).toEqual({field: 'email', issue: 'invalid format'});
    });
  });

  describe('shouldTriggerOfflineMode', () => {
    it('should trigger offline mode for network errors', () => {
      const errorInfo = {
        type: 'network' as const,
        message: 'Network error',
        userMessage: 'Network error',
        retryable: true,
      };

      expect(PalsHubErrorHandler.shouldTriggerOfflineMode(errorInfo)).toBe(
        true,
      );
    });

    it('should trigger offline mode for 503 server errors', () => {
      const errorInfo = {
        type: 'server' as const,
        message: 'Service unavailable',
        userMessage: 'Service unavailable',
        statusCode: 503,
        retryable: true,
      };

      expect(PalsHubErrorHandler.shouldTriggerOfflineMode(errorInfo)).toBe(
        true,
      );
    });

    it('should not trigger offline mode for other server errors', () => {
      const errorInfo = {
        type: 'server' as const,
        message: 'Server error',
        userMessage: 'Server error',
        statusCode: 500,
        retryable: true,
      };

      expect(PalsHubErrorHandler.shouldTriggerOfflineMode(errorInfo)).toBe(
        false,
      );
    });

    it('should not trigger offline mode for auth errors', () => {
      const errorInfo = {
        type: 'auth' as const,
        message: 'Unauthorized',
        userMessage: 'Unauthorized',
        statusCode: 401,
        retryable: false,
      };

      expect(PalsHubErrorHandler.shouldTriggerOfflineMode(errorInfo)).toBe(
        false,
      );
    });
  });

  describe('getRetryDelay', () => {
    it('should return 0 for non-retryable errors', () => {
      const errorInfo = {
        type: 'auth' as const,
        message: 'Unauthorized',
        userMessage: 'Unauthorized',
        retryable: false,
      };

      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 1)).toBe(0);
    });

    it('should use retryAfter value if provided', () => {
      const errorInfo = {
        type: 'rate_limit' as const,
        message: 'Rate limit',
        userMessage: 'Rate limit',
        retryable: true,
        retryAfter: 10, // 10 seconds
      };

      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 1)).toBe(10000); // 10000ms
    });

    it('should use exponential backoff for network errors', () => {
      const errorInfo = {
        type: 'network' as const,
        message: 'Network error',
        userMessage: 'Network error',
        retryable: true,
      };

      // Attempt 1: 1000 * 2^0 = 1000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 1)).toBe(1000);
      // Attempt 2: 1000 * 2^1 = 2000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 2)).toBe(2000);
      // Attempt 3: 1000 * 2^2 = 4000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 3)).toBe(4000);
      // Attempt 4: 1000 * 2^3 = 8000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 4)).toBe(8000);
    });

    it('should use higher base delay for rate limit errors', () => {
      const errorInfo = {
        type: 'rate_limit' as const,
        message: 'Rate limit',
        userMessage: 'Rate limit',
        retryable: true,
      };

      // Attempt 1: 5000 * 2^0 = 5000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 1)).toBe(5000);
      // Attempt 2: 5000 * 2^1 = 10000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 2)).toBe(10000);
      // Attempt 3: 5000 * 2^2 = 20000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 3)).toBe(20000);
    });

    it('should cap retry delay at 30 seconds', () => {
      const errorInfo = {
        type: 'network' as const,
        message: 'Network error',
        userMessage: 'Network error',
        retryable: true,
      };

      // Attempt 10: 1000 * 2^9 = 512000ms, capped at 30000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 10)).toBe(30000);
    });

    it('should cap rate limit retry delay at 30 seconds', () => {
      const errorInfo = {
        type: 'rate_limit' as const,
        message: 'Rate limit',
        userMessage: 'Rate limit',
        retryable: true,
      };

      // Attempt 5: 5000 * 2^4 = 80000ms, capped at 30000ms
      expect(PalsHubErrorHandler.getRetryDelay(errorInfo, 5)).toBe(30000);
    });
  });

  describe('formatForUser', () => {
    it('should return userMessage for standard errors', () => {
      const errorInfo = {
        type: 'network' as const,
        message: 'Network error',
        userMessage: 'Please check your connection',
        retryable: true,
      };

      expect(PalsHubErrorHandler.formatForUser(errorInfo)).toBe(
        'Please check your connection',
      );
    });

    it('should append retry time for rate limit errors with retryAfter', () => {
      const errorInfo = {
        type: 'rate_limit' as const,
        message: 'Rate limit',
        userMessage: 'Too many requests',
        retryable: true,
        retryAfter: 60,
      };

      expect(PalsHubErrorHandler.formatForUser(errorInfo)).toBe(
        'Too many requests (60s)',
      );
    });

    it('should not append retry time for rate limit errors without retryAfter', () => {
      const errorInfo = {
        type: 'rate_limit' as const,
        message: 'Rate limit',
        userMessage: 'Too many requests',
        retryable: true,
      };

      expect(PalsHubErrorHandler.formatForUser(errorInfo)).toBe(
        'Too many requests',
      );
    });
  });

  describe('requiresAuthentication', () => {
    it('should return true for 401 auth errors', () => {
      const errorInfo = {
        type: 'auth' as const,
        message: 'Unauthorized',
        userMessage: 'Please sign in',
        statusCode: 401,
        retryable: false,
      };

      expect(PalsHubErrorHandler.requiresAuthentication(errorInfo)).toBe(true);
    });

    it('should return false for 403 auth errors', () => {
      const errorInfo = {
        type: 'auth' as const,
        message: 'Forbidden',
        userMessage: 'No permission',
        statusCode: 403,
        retryable: false,
      };

      expect(PalsHubErrorHandler.requiresAuthentication(errorInfo)).toBe(false);
    });

    it('should return false for non-auth errors', () => {
      const errorInfo = {
        type: 'network' as const,
        message: 'Network error',
        userMessage: 'Network error',
        retryable: true,
      };

      expect(PalsHubErrorHandler.requiresAuthentication(errorInfo)).toBe(false);
    });
  });

  describe('insufficientPermissions', () => {
    it('should return true for 403 auth errors', () => {
      const errorInfo = {
        type: 'auth' as const,
        message: 'Forbidden',
        userMessage: 'No permission',
        statusCode: 403,
        retryable: false,
      };

      expect(PalsHubErrorHandler.insufficientPermissions(errorInfo)).toBe(true);
    });

    it('should return false for 401 auth errors', () => {
      const errorInfo = {
        type: 'auth' as const,
        message: 'Unauthorized',
        userMessage: 'Please sign in',
        statusCode: 401,
        retryable: false,
      };

      expect(PalsHubErrorHandler.insufficientPermissions(errorInfo)).toBe(
        false,
      );
    });

    it('should return false for non-auth errors', () => {
      const errorInfo = {
        type: 'server' as const,
        message: 'Server error',
        userMessage: 'Server error',
        statusCode: 500,
        retryable: true,
      };

      expect(PalsHubErrorHandler.insufficientPermissions(errorInfo)).toBe(
        false,
      );
    });
  });
});

describe('RetryHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withRetry', () => {
    it('should succeed on first attempt without retry', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await RetryHandler.withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and eventually succeed', async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const retryPromise = RetryHandler.withRetry(operation);

      await jest.runAllTimersAsync();
      const result = await retryPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should stop retrying after maxAttempts', async () => {
      jest.useFakeTimers();

      const operation = jest.fn().mockRejectedValue(new Error('Network error'));

      const retryPromise = RetryHandler.withRetry(operation, 3);
      jest.runAllTimersAsync();

      await expect(retryPromise).rejects.toThrow('Network error');
      expect(operation).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });

    it('should not retry non-retryable errors', async () => {
      const authError = new AxiosError('Unauthorized');
      authError.response = {
        status: 401,
        data: {message: 'Unauthorized'},
        statusText: 'Unauthorized',
        headers: {},
        config: {} as any,
      };

      const operation = jest.fn().mockRejectedValue(authError);

      await expect(RetryHandler.withRetry(operation, 3)).rejects.toThrow(
        'Unauthorized',
      );

      // Should only try once since 401 is not retryable
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should call onError callback on each error', async () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce('success');

      const onError = jest.fn();

      const retryPromise = RetryHandler.withRetry(operation, 3, onError);

      await jest.runAllTimersAsync();
      await retryPromise;

      expect(onError).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({type: 'unknown', message: 'Error 1'}),
        1,
      );
      expect(onError).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({type: 'unknown', message: 'Error 2'}),
        2,
      );

      jest.useRealTimers();
    });

    it('should respect exponential backoff delays', async () => {
      // Test that getRetryDelay produces exponential backoff values
      const networkError = {
        type: 'network' as const,
        message: 'Network error',
        userMessage: 'Network error',
        retryable: true,
      };

      // Verify exponential backoff: 1000, 2000, 4000, 8000 ms
      expect(PalsHubErrorHandler.getRetryDelay(networkError, 1)).toBe(1000);
      expect(PalsHubErrorHandler.getRetryDelay(networkError, 2)).toBe(2000);
      expect(PalsHubErrorHandler.getRetryDelay(networkError, 3)).toBe(4000);
      expect(PalsHubErrorHandler.getRetryDelay(networkError, 4)).toBe(8000);
    });

    it('should use higher base delay for rate limit errors', async () => {
      const rateLimitError = {
        type: 'rate_limit' as const,
        message: 'Rate limit',
        userMessage: 'Rate limit',
        retryable: true,
      };

      // Verify rate limit backoff: 5000, 10000, 20000 ms
      expect(PalsHubErrorHandler.getRetryDelay(rateLimitError, 1)).toBe(5000);
      expect(PalsHubErrorHandler.getRetryDelay(rateLimitError, 2)).toBe(10000);
      expect(PalsHubErrorHandler.getRetryDelay(rateLimitError, 3)).toBe(20000);
    });

    it('should throw original error on final failure', async () => {
      jest.useFakeTimers();

      const customError = new Error('Custom error message');
      const operation = jest.fn().mockRejectedValue(customError);

      const retryPromise = RetryHandler.withRetry(operation, 2);
      jest.runAllTimersAsync();

      await expect(retryPromise).rejects.toThrow('Custom error message');

      jest.useRealTimers();
    });

    it('should handle server errors with retries', async () => {
      jest.useFakeTimers();

      const serverError = new AxiosError('Internal Server Error');
      serverError.response = {
        status: 500,
        data: {message: 'Server error'},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as any,
      };

      const operation = jest
        .fn()
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce('success');

      const retryPromise = RetryHandler.withRetry(operation);

      await jest.runAllTimersAsync();
      const result = await retryPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should handle validation errors without retry', async () => {
      const validationError = new AxiosError('Validation failed');
      validationError.response = {
        status: 400,
        data: {message: 'Invalid input'},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      };

      const operation = jest.fn().mockRejectedValue(validationError);

      await expect(RetryHandler.withRetry(operation, 3)).rejects.toThrow();

      // Should only try once since validation errors are not retryable
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
