// Mock for src/services/palshub/ErrorHandler.ts

const mockErrorInfo = {
  type: 'unknown',
  message: 'An error occurred',
  userMessage: 'An error occurred',
  statusCode: undefined,
  retryable: true,
  retryAfter: undefined,
  details: undefined,
};

const PalsHubErrorHandler = {
  handle: jest.fn().mockReturnValue(mockErrorInfo),
  shouldTriggerOfflineMode: jest.fn().mockReturnValue(false),
  getRetryDelay: jest.fn().mockReturnValue(1000),
  formatForUser: jest.fn().mockReturnValue('An error occurred'),
  requiresAuthentication: jest.fn().mockReturnValue(false),
  insufficientPermissions: jest.fn().mockReturnValue(false),
};

const RetryHandler = {
  withRetry: jest.fn().mockImplementation(async operation => {
    return await operation();
  }),
};

// Export the mocks
module.exports = {
  PalsHubErrorHandler,
  RetryHandler,
};

// Named exports for ES6 compatibility
module.exports.PalsHubErrorHandler = PalsHubErrorHandler;
module.exports.RetryHandler = RetryHandler;
