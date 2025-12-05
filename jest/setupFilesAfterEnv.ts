/**
 * Jest setup file for test lifecycle hooks
 * This runs after the test environment is set up, so lifecycle hooks like afterEach are available
 */

afterEach(() => {
  // Clear all timers to prevent memory leaks
  jest.clearAllTimers();

  // Clear all mocks to prevent state leakage between tests
  jest.clearAllMocks();
});

afterAll(() => {
  // Restore real timers after all tests complete
  jest.useRealTimers();

  // Clear all remaining timers
  jest.clearAllTimers();
});
