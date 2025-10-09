import {AxiosError} from 'axios';
import {PalsHubErrorHandler} from '../ErrorHandler';
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
});
