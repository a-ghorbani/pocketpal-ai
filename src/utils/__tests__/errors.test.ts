import axios from 'axios';
import {
  createErrorState,
  createMultimodalWarning,
  NetworkError,
  ServerError,
  AppCheckError,
} from '../errors';

// Mock uiStore
jest.mock('../../store/UIStore', () => ({
  uiStore: {
    l10n: {
      errors: {
        unexpectedError: 'An unexpected error occurred',
        hfAuthenticationError: 'HF authentication error',
        hfAuthenticationErrorSearch: 'HF authentication error during search',
        authenticationError: 'Authentication error',
        hfAuthorizationError: 'HF authorization error',
        authorizationError: 'Authorization error',
        hfServerError: 'HF server error',
        serverError: 'Server error',
        hfNetworkTimeout: 'HF network timeout',
        networkTimeout: 'Network timeout',
        hfNetworkError: 'HF network error',
        networkError: 'Network error',
      },
    },
  },
}));

describe('errors.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Error classes', () => {
    it('should create NetworkError correctly', () => {
      const error = new NetworkError('Network connection failed');
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Network connection failed');
      expect(error instanceof Error).toBe(true);
    });

    it('should create ServerError correctly', () => {
      const error = new ServerError('Server is down');
      expect(error.name).toBe('ServerError');
      expect(error.message).toBe('Server is down');
      expect(error instanceof Error).toBe(true);
    });

    it('should create AppCheckError correctly', () => {
      const error = new AppCheckError('App check failed');
      expect(error.name).toBe('AppCheckError');
      expect(error.message).toBe('App check failed');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('createErrorState', () => {
    it('should handle axios 401 errors', () => {
      const axiosError = {
        isAxiosError: true,
        response: {status: 401},
        config: {url: 'https://huggingface.co/api/models'},
      };
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const errorState = createErrorState(axiosError, 'search', 'huggingface');

      expect(errorState.code).toBe('authentication');
      expect(errorState.service).toBe('huggingface');
      expect(errorState.message).toBe('HF authentication error during search');
      expect(errorState.context).toBe('search');
      expect(errorState.recoverable).toBe(true);
    });

    it('should handle axios 403 errors', () => {
      const axiosError = {
        isAxiosError: true,
        response: {status: 403},
        config: {url: 'https://api.example.com'},
      };
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const errorState = createErrorState(axiosError, 'download');

      expect(errorState.code).toBe('authorization');
      expect(errorState.message).toBe('Authorization error');
      expect(errorState.context).toBe('download');
    });

    it('should handle axios 500+ errors', () => {
      const axiosError = {
        isAxiosError: true,
        response: {status: 502},
        config: {url: 'https://huggingface.co/api'},
      };
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const errorState = createErrorState(axiosError, 'search', 'huggingface');

      expect(errorState.code).toBe('server');
      expect(errorState.service).toBe('huggingface');
      expect(errorState.message).toBe('HF server error');
    });

    it('should handle network timeout errors', () => {
      const axiosError = {
        isAxiosError: true,
        code: 'ECONNABORTED',
        config: {url: 'https://huggingface.co/api'},
      };
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const errorState = createErrorState(axiosError, 'search', 'huggingface');

      expect(errorState.code).toBe('network');
      expect(errorState.message).toBe('HF network timeout');
    });

    it('should handle network connection errors', () => {
      const axiosError = {
        isAxiosError: true,
        code: 'ERR_NETWORK',
        config: {url: 'https://huggingface.co/api'},
      };
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const errorState = createErrorState(axiosError, 'search', 'huggingface');

      expect(errorState.code).toBe('network');
      expect(errorState.message).toBe('HF network error');
    });

    it('should auto-detect HuggingFace service from URL', () => {
      const axiosError = {
        isAxiosError: true,
        response: {status: 401},
        config: {url: 'https://hf.co/api/models'},
      };
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const errorState = createErrorState(axiosError, 'search');

      expect(errorState.service).toBe('huggingface');
      expect(errorState.message).toBe('HF authentication error during search');
    });

    it('should handle NetworkError instances', () => {
      const networkError = new NetworkError('Connection lost');

      const errorState = createErrorState(networkError, 'download');

      expect(errorState.code).toBe('network');
      expect(errorState.message).toBe('Connection lost');
    });

    it('should handle ServerError instances', () => {
      const serverError = new ServerError('Internal server error');

      const errorState = createErrorState(serverError, 'download');

      expect(errorState.code).toBe('server');
      expect(errorState.message).toBe('Internal server error');
    });

    it('should handle generic Error with status code in message', () => {
      const error = new Error('Client error: 403 Forbidden');

      const errorState = createErrorState(error, 'download', 'huggingface');

      expect(errorState.code).toBe('authorization');
      expect(errorState.message).toBe('HF authorization error');
    });

    it('should handle storage-related errors', () => {
      const error = new Error('Insufficient storage space available');

      const errorState = createErrorState(error, 'download');

      expect(errorState.code).toBe('storage');
      expect(errorState.message).toBe('Insufficient storage space available');
    });

    it('should preserve string error messages', () => {
      const stringError = 'Some string error';

      const errorState = createErrorState(stringError, 'chat');

      expect(errorState.code).toBe('unknown');
      expect(errorState.message).toBe('Some string error');
      expect(errorState.context).toBe('chat');
      expect(errorState.recoverable).toBe(true);
    });

    it('should handle object errors with message property (JSI bridge errors)', () => {
      // Errors from native JSI calls may not be proper Error instances
      const jsiError = {message: 'Native error: out of memory'};

      const errorState = createErrorState(jsiError, 'modelInit');

      expect(errorState.code).toBe('unknown');
      expect(errorState.message).toBe('Native error: out of memory');
      expect(errorState.context).toBe('modelInit');
    });

    it('should use default message for null/undefined errors', () => {
      const errorState = createErrorState(null, 'chat');

      expect(errorState.code).toBe('unknown');
      expect(errorState.message).toBe('An unexpected error occurred');
      expect(errorState.context).toBe('chat');
      expect(errorState.recoverable).toBe(true);
    });

    it('should include metadata when provided', () => {
      const error = new Error('Test error');
      const metadata = {modelId: 'test-model', extra: 'data'};

      const errorState = createErrorState(
        error,
        'download',
        undefined,
        metadata,
      );

      expect(errorState.metadata).toEqual(metadata);
    });

    it('should set severity when provided', () => {
      const error = new Error('Warning message');

      const errorState = createErrorState(
        error,
        'chat',
        undefined,
        undefined,
        'warning',
      );

      expect(errorState.severity).toBe('warning');
    });
  });

  describe('createMultimodalWarning', () => {
    it('should create multimodal warning with default context', () => {
      const warning = createMultimodalWarning('Vision model not loaded');

      expect(warning.code).toBe('multimodal');
      expect(warning.message).toBe('Vision model not loaded');
      expect(warning.context).toBe('chat');
      expect(warning.recoverable).toBe(false);
      expect(warning.severity).toBe('warning');
    });

    it('should create multimodal warning with custom context', () => {
      const warning = createMultimodalWarning(
        'Projection model missing',
        'modelDetails',
      );

      expect(warning.code).toBe('multimodal');
      expect(warning.message).toBe('Projection model missing');
      expect(warning.context).toBe('modelDetails');
      expect(warning.recoverable).toBe(false);
      expect(warning.severity).toBe('warning');
    });
  });
});
